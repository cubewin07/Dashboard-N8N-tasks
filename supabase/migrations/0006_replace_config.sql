-- P10-T04 · Config writes the boss screens need beyond 0005: reorder departments, delete a custom role
-- or specialty, and an atomic whole-config replace (import / reset).
-- Same rules as 0005: security definer, search_path pinned, _require_boss() first, one audit row per call,
-- execute for `authenticated` only. No new tables.
-- Never edit this file after it has been pushed; add a new migration instead.

-- ---------------------------------------------------------------------------
-- reorder_departments: listed ids get order 1..n in list order (1-based like the seed);
-- departments not listed keep their relative order after them. Unknown or duplicate ids are rejected.
-- ---------------------------------------------------------------------------
create function public.reorder_departments(p_ids text[]) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before jsonb; v_after jsonb; v_n int;
begin
  perform public._require_boss();
  if p_ids is null
     or exists (select 1 from unnest(p_ids) i where not exists (select 1 from public.departments d where d.id = i))
     or (select count(distinct i) from unnest(p_ids) i) <> coalesce(array_length(p_ids, 1), 0) then
    raise exception 'invalid_payload: ids must be known departments, each once' using errcode = '22023';
  end if;
  v_n := coalesce(array_length(p_ids, 1), 0);
  select jsonb_agg(id order by "order", id) into v_before from public.departments;
  update public.departments d set "order" = o.ord
    from unnest(p_ids) with ordinality as o(id, ord) where d.id = o.id;
  update public.departments d set "order" = v_n + r.rn
    from (
      select id, row_number() over (order by "order", id) as rn
        from public.departments where id <> all (p_ids)
    ) r
   where d.id = r.id;
  select jsonb_agg(id order by "order", id) into v_after from public.departments;
  perform public._audit('departments', '*', 'reorder', v_before, v_after);
end $$;

-- ---------------------------------------------------------------------------
-- delete_role: custom roles with no holders (active or archived) only.
--   22023 built-in role, 23503 role_in_use, P0002 unknown_role
-- ---------------------------------------------------------------------------
create function public.delete_role(p_key text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before jsonb; v_holders int;
begin
  perform public._require_boss();
  select to_jsonb(r) into v_before from public.roles r where r.key = p_key;
  if v_before is null then
    raise exception 'unknown_role' using errcode = 'P0002';
  end if;
  if p_key = any (array['owner','manager','dept_manager','lead','reviewer','worker']) then
    raise exception 'invalid_payload: built_in_role %', p_key using errcode = '22023';
  end if;
  select count(*)::int into v_holders from public.employees e where e.role_key = p_key;
  if v_holders > 0 then
    raise exception 'role_in_use: % holder(s)', v_holders using errcode = '23503';
  end if;
  delete from public.roles where key = p_key;
  perform public._audit('roles', p_key, 'delete', v_before, null);
end $$;

-- ---------------------------------------------------------------------------
-- delete_specialty: refused while any employee or task type uses it.
--   23503 specialty_in_use, P0002 unknown_specialty
-- ---------------------------------------------------------------------------
create function public.delete_specialty(p_key text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before jsonb; v_uses int;
begin
  perform public._require_boss();
  select to_jsonb(s) into v_before from public.specialties s where s.key = p_key;
  if v_before is null then
    raise exception 'unknown_specialty' using errcode = 'P0002';
  end if;
  select (select count(*) from public.employees e where p_key = any (e.specialties))
       + (select count(*) from public.task_types t where t.def ->> 'specialty' = p_key)
    into v_uses;
  if v_uses > 0 then
    raise exception 'specialty_in_use: % use(s)', v_uses using errcode = '23503';
  end if;
  delete from public.specialties where key = p_key;
  perform public._audit('specialties', p_key, 'delete', v_before, null);
end $$;

-- ---------------------------------------------------------------------------
-- replace_config: atomic import / reset. p holds the editable parts of OrgConfig
-- (departments, roles, specialties, platforms, shops, taskTypes, employees, approvalRules, policy).
-- The column mapping is the one the upsert_* RPCs use, written inline so the whole call
-- produces exactly ONE audit row (entity 'config', entity_id '*', action 'replace').
--   upsert only (D5, archive-not-delete): departments, platforms, employees
--   upsert, then remove what the payload leaves out when nothing references it: roles (never built-in),
--   specialties, shops, task types
--   approval rules not in the payload are deleted
-- Everything runs in one transaction: any error rolls the whole replace back.
-- ---------------------------------------------------------------------------
create function public.replace_config(p jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v        jsonb;
  v_spec   text[];
  v_before jsonb;
  v_after  jsonb;
begin
  perform public._require_boss();
  perform public._require_keys(p, array[
    'departments','roles','specialties','platforms','shops','taskTypes','employees','approvalRules','policy'
  ]);
  if exists (
    select 1 from unnest(array['departments','roles','specialties','platforms','shops','taskTypes','employees','approvalRules']) k
     where jsonb_typeof(p -> k) <> 'array'
  ) or jsonb_typeof(p -> 'policy') <> 'object' then
    raise exception 'invalid_payload: collections must be arrays, policy an object' using errcode = '22023';
  end if;

  v_before := jsonb_build_object(
    'departments', (select count(*) from public.departments),
    'roles', (select count(*) from public.roles),
    'specialties', (select count(*) from public.specialties),
    'platforms', (select count(*) from public.platforms),
    'shops', (select count(*) from public.shops),
    'taskTypes', (select count(*) from public.task_types),
    'employees', (select count(*) from public.employees),
    'approvalRules', (select count(*) from public.approval_rules));

  -- departments
  for v in select value from jsonb_array_elements(p -> 'departments') loop
    perform public._require_keys(v, array['id','key','label','order','colorSwatch','icon','hours','floorTemplate','active']);
    insert into public.departments (id, key, label, "order", color_swatch, icon, hours, floor_template, active)
    values (v ->> 'id', v ->> 'key', v -> 'label', (v ->> 'order')::int, v ->> 'colorSwatch', v ->> 'icon',
            v ->> 'hours', v ->> 'floorTemplate', (v ->> 'active')::boolean)
    on conflict (id) do update set
      key = excluded.key, label = excluded.label, "order" = excluded."order",
      color_swatch = excluded.color_swatch, icon = excluded.icon, hours = excluded.hours,
      floor_template = excluded.floor_template, active = excluded.active;
  end loop;

  -- roles
  for v in select value from jsonb_array_elements(p -> 'roles') loop
    perform public._require_keys(v, array['key','label','scope','caps']);
    insert into public.roles (key, def) values (v ->> 'key', v - 'key')
    on conflict (key) do update set def = excluded.def;
  end loop;

  -- specialties
  for v in select value from jsonb_array_elements(p -> 'specialties') loop
    perform public._require_keys(v, array['key','label','icon']);
    insert into public.specialties (key, def) values (v ->> 'key', v - 'key')
    on conflict (key) do update set def = excluded.def;
  end loop;

  -- platforms
  for v in select value from jsonb_array_elements(p -> 'platforms') loop
    perform public._require_keys(v, array['key','label','kind','badge','active']);
    insert into public.platforms (key, def) values (v ->> 'key', v - 'key')
    on conflict (key) do update set def = excluded.def;
  end loop;

  -- shops
  for v in select value from jsonb_array_elements(p -> 'shops') loop
    perform public._require_keys(v, array['id','platformKey','name']);
    insert into public.shops (id, platform_key, name, handle)
    values (v ->> 'id', v ->> 'platformKey', v ->> 'name', v ->> 'handle')
    on conflict (id) do update set
      platform_key = excluded.platform_key, name = excluded.name, handle = excluded.handle;
  end loop;

  -- task types
  for v in select value from jsonb_array_elements(p -> 'taskTypes') loop
    perform public._require_keys(v, array['key','departmentKey','label','specialty']);
    insert into public.task_types (key, def) values (v ->> 'key', v - 'key')
    on conflict (key) do update set def = excluded.def;
  end loop;

  -- employees (created_at / created_by are kept on conflict, like upsert_employee)
  for v in select value from jsonb_array_elements(p -> 'employees') loop
    perform public._require_keys(v, array['id','name','roleKey','kind','state','reviewMode','createdBy']);
    select coalesce(array_agg(x), '{}') into v_spec
      from jsonb_array_elements_text(coalesce(v -> 'specialties', '[]'::jsonb)) x;
    insert into public.employees (id, name, department_id, role_key, specialties, kind, state, review_mode,
                                  model_tier_override, bio, created_at, created_by, archived_at)
    values (v ->> 'id', v ->> 'name', v ->> 'departmentId', v ->> 'roleKey', v_spec, v ->> 'kind', v ->> 'state',
            v ->> 'reviewMode', v ->> 'modelTierOverride',
            case when v -> 'bio' = 'null'::jsonb then null else v -> 'bio' end,
            coalesce((v ->> 'createdAt')::timestamptz, now()), v ->> 'createdBy', (v ->> 'archivedAt')::timestamptz)
    on conflict (id) do update set
      name = excluded.name, department_id = excluded.department_id, role_key = excluded.role_key,
      specialties = excluded.specialties, kind = excluded.kind, state = excluded.state,
      review_mode = excluded.review_mode, model_tier_override = excluded.model_tier_override,
      bio = excluded.bio, archived_at = excluded.archived_at;
  end loop;

  -- approval rules: replace the whole set
  for v in select value from jsonb_array_elements(p -> 'approvalRules') loop
    perform public._require_keys(v, array['id','order','enabled','label','when','level']);
    insert into public.approval_rules (id, "order", enabled, label, "when", level)
    values (v ->> 'id', (v ->> 'order')::int, (v ->> 'enabled')::boolean, v -> 'label', v -> 'when',
            (v ->> 'level')::public.approval_level)
    on conflict (id) do update set
      "order" = excluded."order", enabled = excluded.enabled, label = excluded.label,
      "when" = excluded."when", level = excluded.level;
  end loop;
  delete from public.approval_rules r
   where not exists (select 1 from jsonb_array_elements(p -> 'approvalRules') x where x ->> 'id' = r.id);

  -- policy
  perform public._require_keys(p -> 'policy', array['staffing','help','priority','approvals','work','calendar']);
  insert into public.policy (id, doc) values (1, p -> 'policy')
  on conflict (id) do update set doc = excluded.doc;

  -- leftovers the payload does not list: remove only when nothing references them
  delete from public.shops s
   where not exists (select 1 from jsonb_array_elements(p -> 'shops') x where x ->> 'id' = s.id);
  delete from public.task_types t
   where not exists (select 1 from jsonb_array_elements(p -> 'taskTypes') x where x ->> 'key' = t.key);
  delete from public.specialties s
   where not exists (select 1 from jsonb_array_elements(p -> 'specialties') x where x ->> 'key' = s.key)
     and not exists (select 1 from public.employees e where s.key = any (e.specialties))
     and not exists (select 1 from public.task_types t where t.def ->> 'specialty' = s.key);
  delete from public.roles r
   where not exists (select 1 from jsonb_array_elements(p -> 'roles') x where x ->> 'key' = r.key)
     and r.key <> all (array['owner','manager','dept_manager','lead','reviewer','worker'])
     and not exists (select 1 from public.employees e where e.role_key = r.key);

  v_after := jsonb_build_object(
    'departments', (select count(*) from public.departments),
    'roles', (select count(*) from public.roles),
    'specialties', (select count(*) from public.specialties),
    'platforms', (select count(*) from public.platforms),
    'shops', (select count(*) from public.shops),
    'taskTypes', (select count(*) from public.task_types),
    'employees', (select count(*) from public.employees),
    'approvalRules', (select count(*) from public.approval_rules));
  perform public._audit('config', '*', 'replace', v_before, v_after);
end $$;

-- ---------------------------------------------------------------------------
-- Grants: signed-in users only; the role check lives inside each function.
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'reorder_departments(text[])', 'delete_role(text)', 'delete_specialty(text)', 'replace_config(jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end
$$;
