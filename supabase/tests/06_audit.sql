-- R6: each RPC write produces exactly one config_audit row with the right actor, entity and action.
begin;
select plan(18);
select tests.create_users();
select tests.as_user('boss');

select public.upsert_department('{"id":"dep_t","key":"t","label":{"vi":"T","en":"T"},"order":9,"colorSwatch":"a","icon":"i","hours":"office","floorTemplate":"department","active":true}');
select public.upsert_department('{"id":"dep_t","key":"t","label":{"vi":"T","en":"T"},"order":10,"colorSwatch":"a","icon":"i","hours":"office","floorTemplate":"department","active":true}');
select public.upsert_role('{"key":"role_t","label":{"vi":"T","en":"T"},"scope":"dept","caps":[]}');
select public.upsert_specialty('{"key":"spec_t","label":{"vi":"T","en":"T"},"icon":"i"}');
select public.upsert_platform('{"key":"plat_t","label":{"vi":"T","en":"T"},"kind":"shop","badge":"x","active":true}');
select public.upsert_shop('{"id":"shop_t","platformKey":"plat_t","name":"Shop T"}');
select public.upsert_task_type('{"key":"tt_t","departmentKey":"cs","label":{"vi":"T","en":"T"},"specialty":"spec_t"}');
select public.upsert_employee('{"id":"emp_t","name":"T","departmentId":"dep_t","roleKey":"role_t","specialties":[],"kind":"temp","state":"active","reviewMode":"always","createdBy":"boss"}');
select public.upsert_approval_rule('{"id":"rule_t","order":9,"enabled":true,"label":{"vi":"T","en":"T"},"when":{},"level":"reviewer"}');
select public.reorder_approval_rules(array['rule_t','boss_sensitive','boss_big_amount','dm_public','dm_cross_dept','reviewer_routine']);
select public.archive_employee('emp_t', 'because');
select public.restore_employee('emp_t');
select public.delete_approval_rule('rule_t');
select public.set_policy((select doc from public.policy));
select public.save_appearance('emp_giam_doc', '{"v":1}', 0);

create function pg_temp.n(p_entity text, p_id text, p_action text) returns int language sql as $$
  select count(*)::int from public.config_audit
   where entity = p_entity and entity_id = p_id and action = p_action and actor = tests.uid('boss')
$$;

select is(pg_temp.n('departments', 'dep_t', 'insert'), 1, 'audit: department insert');
select is(pg_temp.n('departments', 'dep_t', 'update'), 1, 'audit: department update');
select is(pg_temp.n('roles', 'role_t', 'insert'), 1, 'audit: role');
select is(pg_temp.n('specialties', 'spec_t', 'insert'), 1, 'audit: specialty');
select is(pg_temp.n('platforms', 'plat_t', 'insert'), 1, 'audit: platform');
select is(pg_temp.n('shops', 'shop_t', 'insert'), 1, 'audit: shop');
select is(pg_temp.n('task_types', 'tt_t', 'insert'), 1, 'audit: task type');
select is(pg_temp.n('employees', 'emp_t', 'insert'), 1, 'audit: employee insert');
select is(pg_temp.n('approval_rules', 'rule_t', 'insert'), 1, 'audit: rule insert');
select is(pg_temp.n('approval_rules', '*', 'reorder'), 1, 'audit: reorder');
select is(pg_temp.n('employees', 'emp_t', 'archive'), 1, 'audit: archive');
select is(pg_temp.n('employees', 'emp_t', 'restore'), 1, 'audit: restore');
select is(pg_temp.n('approval_rules', 'rule_t', 'delete'), 1, 'audit: rule delete');
select is(pg_temp.n('policy', '1', 'update'), 1, 'audit: policy');
select is(pg_temp.n('appearances', 'emp_giam_doc', 'insert'), 1, 'audit: appearance insert');
select is((select count(*)::int from public.config_audit), 15, 'exactly one audit row per write');

-- A failed write leaves no audit row.
select throws_ok($$select public.delete_approval_rule('nope')$$, 'P0002');
select is((select count(*)::int from public.config_audit), 15, 'failed write: no audit row');

select * from finish();
rollback;
