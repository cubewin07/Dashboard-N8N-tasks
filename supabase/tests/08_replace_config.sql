-- P10-T04 · Migration 0006: reorder_departments, delete_role, delete_specialty, replace_config.
-- Boss only, one audit row per call, refusals use the documented errcodes.
begin;
select plan(47);
select tests.create_users();
select tests.as_user('boss');

-- Builds the editable-config payload (camelCase, like the TS OrgConfig) from the current tables.
create function pg_temp.cfg() returns jsonb language sql as $$
  select jsonb_build_object(
    'departments', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'key', key, 'label', label,
        'order', "order", 'colorSwatch', color_swatch, 'icon', icon, 'hours', hours,
        'floorTemplate', floor_template, 'active', active)), '[]') from public.departments),
    'roles', (select coalesce(jsonb_agg(def || jsonb_build_object('key', key)), '[]') from public.roles),
    'specialties', (select coalesce(jsonb_agg(def || jsonb_build_object('key', key)), '[]') from public.specialties),
    'platforms', (select coalesce(jsonb_agg(def || jsonb_build_object('key', key)), '[]') from public.platforms),
    'shops', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'platformKey', platform_key,
        'name', name, 'handle', handle)), '[]') from public.shops),
    'taskTypes', (select coalesce(jsonb_agg(def || jsonb_build_object('key', key)), '[]') from public.task_types),
    'employees', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'departmentId', department_id,
        'roleKey', role_key, 'specialties', to_jsonb(specialties), 'kind', kind, 'state', state,
        'reviewMode', review_mode, 'modelTierOverride', model_tier_override, 'bio', bio,
        'createdAt', created_at, 'createdBy', created_by, 'archivedAt', archived_at)), '[]') from public.employees),
    'approvalRules', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'order', "order", 'enabled', enabled,
        'label', label, 'when', "when", 'level', level)), '[]') from public.approval_rules),
    'policy', (select doc from public.policy)
  )
$$;

-- Fixtures: a custom role nobody holds, one a worker holds, and three specialties.
select public.upsert_role('{"key":"role_free","label":{"vi":"F","en":"F"},"scope":"dept","caps":[]}');
select public.upsert_role('{"key":"role_held","label":{"vi":"H","en":"H"},"scope":"dept","caps":[]}');
select public.upsert_specialty('{"key":"spec_free","label":{"vi":"F","en":"F"},"icon":"i"}');
select public.upsert_specialty('{"key":"spec_emp","label":{"vi":"E","en":"E"},"icon":"i"}');
select public.upsert_specialty('{"key":"spec_tt","label":{"vi":"T","en":"T"},"icon":"i"}');
select public.upsert_task_type('{"key":"tt_t","departmentKey":"cs","label":{"vi":"T","en":"T"},"specialty":"spec_tt"}');
select public.upsert_employee('{"id":"emp_t","name":"T","departmentId":null,"roleKey":"role_held","specialties":["spec_emp"],"kind":"temp","state":"archived","reviewMode":"always","createdBy":"boss","archivedAt":"2026-01-01T00:00:00Z"}');

-- ---------------------------------------------------------------------------
-- reorder_departments
-- ---------------------------------------------------------------------------
select lives_ok($$select public.reorder_departments(array['dep_accounting','dep_design','dep_marketing','dep_cs'])$$, 'reorder_departments');
select is((select array_agg(id order by "order") from public.departments),
  array['dep_accounting','dep_design','dep_marketing','dep_cs'], 'departments reordered');
select is((select "order" from public.departments where id = 'dep_accounting'), 1, 'orders are 1-based');
select lives_ok($$select public.reorder_departments(array['dep_cs'])$$, 'partial list is allowed');
select is((select array_agg(id order by "order") from public.departments),
  array['dep_cs','dep_accounting','dep_design','dep_marketing'], 'unlisted departments follow in their old order');
select throws_ok($$select public.reorder_departments(array['dep_nope'])$$, '22023', null, 'unknown department rejected');
select throws_ok($$select public.reorder_departments(array['dep_cs','dep_cs'])$$, '22023', null, 'duplicate id rejected');
select is((select count(*)::int from public.config_audit where entity = 'departments' and entity_id = '*' and action = 'reorder'),
  2, 'one audit row per successful reorder');

-- ---------------------------------------------------------------------------
-- delete_role
-- ---------------------------------------------------------------------------
select throws_ok($$select public.delete_role('worker')$$, '22023', null, 'built-in role refused');
select ok(exists (select 1 from public.roles where key = 'worker'), 'built-in role still there');
select throws_ok($$select public.delete_role('role_held')$$, '23503', null, 'role held by an archived employee refused');
select throws_ok($$select public.delete_role('role_nope')$$, 'P0002', null, 'unknown role -> P0002');
select lives_ok($$select public.delete_role('role_free')$$, 'unused custom role deleted');
select ok(not exists (select 1 from public.roles where key = 'role_free'), 'role gone');
select is((select count(*)::int from public.config_audit where entity = 'roles' and entity_id = 'role_free' and action = 'delete'),
  1, 'delete_role audited once');

-- ---------------------------------------------------------------------------
-- delete_specialty
-- ---------------------------------------------------------------------------
select throws_ok($$select public.delete_specialty('spec_emp')$$, '23503', null, 'specialty used by an employee refused');
select throws_ok($$select public.delete_specialty('spec_tt')$$, '23503', null, 'specialty used by a task type refused');
select throws_ok($$select public.delete_specialty('spec_nope')$$, 'P0002', null, 'unknown specialty -> P0002');
select lives_ok($$select public.delete_specialty('spec_free')$$, 'unused specialty deleted');
select ok(not exists (select 1 from public.specialties where key = 'spec_free'), 'specialty gone');
select is((select count(*)::int from public.config_audit where entity = 'specialties' and entity_id = 'spec_free' and action = 'delete'),
  1, 'delete_specialty audited once');

-- ---------------------------------------------------------------------------
-- replace_config
-- ---------------------------------------------------------------------------
select set_config('t.audit_n', (select count(*) from public.config_audit)::text, true);
select set_config('t.emps', (select count(*) from public.employees)::text, true);
select set_config('t.rules', (select count(*) from public.approval_rules)::text, true);

select lives_ok($$select public.replace_config(pg_temp.cfg())$$, 'replace with the current config (round trip)');
select is((select count(*)::int from public.config_audit), current_setting('t.audit_n')::int + 1, 'exactly one audit row for the replace');
select is((select count(*)::int from public.config_audit where entity = 'config' and entity_id = '*' and action = 'replace'
             and actor = tests.uid('boss')), 1, 'audit row is entity config / replace, by the boss');
select is((select count(*) from public.employees)::text || '/' || (select count(*) from public.approval_rules)::text,
  current_setting('t.emps') || '/' || current_setting('t.rules'), 'round trip changes no row counts');

-- A real edit: new policy cap, new department, one rule dropped, one new role.
select lives_ok($$
  select public.replace_config(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(pg_temp.cfg(), '{policy,staffing,tempCap}', '12'),
          '{departments}', (pg_temp.cfg() -> 'departments') ||
            '[{"id":"dep_x","key":"x","label":{"vi":"X","en":"X"},"order":9,"colorSwatch":"a","icon":"i","hours":"office","floorTemplate":"department","active":true}]'::jsonb),
        '{approvalRules}', (select jsonb_agg(r) from jsonb_array_elements(pg_temp.cfg() -> 'approvalRules') r where r ->> 'id' <> 'reviewer_routine')),
      '{roles}', (pg_temp.cfg() -> 'roles') || '[{"key":"role_new","label":{"vi":"N","en":"N"},"scope":"dept","caps":[]}]'::jsonb))
$$, 'replace with edits');
select is((select doc #>> '{staffing,tempCap}' from public.policy), '12', 'policy replaced');
select ok(exists (select 1 from public.departments where id = 'dep_x'), 'department added');
select ok(not exists (select 1 from public.approval_rules where id = 'reviewer_routine'), 'rule left out of the payload is deleted');
select ok(exists (select 1 from public.roles where key = 'role_new'), 'role added');

-- Collections the payload leaves out: removed only when unused; built-ins and held roles stay.
select lives_ok($$
  select public.replace_config(
    jsonb_set(pg_temp.cfg(), '{roles}',
      (select jsonb_agg(r) from jsonb_array_elements(pg_temp.cfg() -> 'roles') r where r ->> 'key' not in ('role_new', 'role_held', 'worker'))))
$$, 'replace that omits roles');
select ok(not exists (select 1 from public.roles where key = 'role_new'), 'unused custom role omitted from the payload is removed');
select ok(exists (select 1 from public.roles where key = 'role_held'), 'held role stays');
select ok(exists (select 1 from public.roles where key = 'worker'), 'built-in role stays');
select ok(exists (select 1 from public.departments where id = 'dep_x'), 'departments are never deleted by replace');

-- Atomic: a bad employee (unknown role) rolls the whole replace back, including the policy edit.
select throws_ok($$
  select public.replace_config(
    jsonb_set(
      jsonb_set(
        jsonb_set(pg_temp.cfg(), '{policy,staffing,tempCap}', '99'),
        '{departments}', (pg_temp.cfg() -> 'departments') ||
          '[{"id":"dep_atomic","key":"atomic","label":{"vi":"A","en":"A"},"order":8,"colorSwatch":"a","icon":"i","hours":"office","floorTemplate":"department","active":true}]'::jsonb),
      '{employees}', (pg_temp.cfg() -> 'employees') ||
        '[{"id":"emp_bad","name":"B","roleKey":"role_nope","specialties":[],"kind":"temp","state":"active","reviewMode":"always","createdBy":"boss"}]'::jsonb))
$$, '23503', null, 'bad reference fails the replace');
select is((select doc #>> '{staffing,tempCap}' from public.policy), '12', 'failed replace: policy unchanged (atomic)');
select ok(not exists (select 1 from public.departments where id = 'dep_atomic'), 'failed replace: earlier upserts rolled back');
select throws_ok($$select public.replace_config('{"departments":[]}')$$, '22023', null, 'missing keys rejected');

-- ---------------------------------------------------------------------------
-- Role gating: stylist and anon are refused by every function.
-- ---------------------------------------------------------------------------
select tests.as_user('stylist');
select throws_ok($$select public.replace_config('{}')$$, '42501', null, 'stylist: replace_config 42501');
select throws_ok($$select public.delete_role('role_held')$$, '42501', null, 'stylist: delete_role 42501');
select throws_ok($$select public.delete_specialty('spec_tt')$$, '42501', null, 'stylist: delete_specialty 42501');
select throws_ok($$select public.reorder_departments(array['dep_cs'])$$, '42501', null, 'stylist: reorder_departments 42501');

select tests.as_anon();
select throws_ok($$select public.replace_config('{}')$$, '42501', null, 'anon: replace_config denied');
select throws_ok($$select public.delete_role('role_held')$$, '42501', null, 'anon: delete_role denied');
select throws_ok($$select public.delete_specialty('spec_tt')$$, '42501', null, 'anon: delete_specialty denied');
select throws_ok($$select public.reorder_departments(array['dep_cs'])$$, '42501', null, 'anon: reorder_departments denied');

select * from finish();
rollback;
