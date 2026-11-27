-- P09-T06 · Audit log and the write RPCs (spec §3.3, decision D2).
-- Every write goes through a security definer function: role check first, one audit row per write.
-- Never edit this file after it has been pushed; add a new migration instead.

create table public.config_audit (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  actor     uuid not null,
  entity    text not null,
  entity_id text not null,
  action    text not null,
  before    jsonb,
  after     jsonb
);

alter table public.config_audit enable row level security;
revoke all on table public.config_audit from anon, authenticated;
grant select on table public.config_audit to authenticated;
create policy config_audit_select_boss on public.config_audit
  for select to authenticated using (public.is_boss());

-- Private helper: not callable through the API.
create function public._audit(
  p_entity text, p_entity_id text, p_action text, p_before jsonb, p_after jsonb
) returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.config_audit (actor, entity, entity_id, action, before, after)
  values (auth.uid(), p_entity, p_entity_id, p_action, p_before, p_after)
$$;
revoke all on function public._audit(text, text, text, jsonb, jsonb) from public, anon, authenticated;

-- Private helper: raise 42501 unless the caller is a boss / has any role.
create function public._require_boss() returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_boss() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
end
$$;
revoke all on function public._require_boss() from public, anon, authenticated;

-- Private helper: required top-level keys must exist and not be null.
create function public._require_keys(p jsonb, p_keys text[]) returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  k text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'invalid_payload: object expected' using errcode = '22023';
  end if;
  foreach k in array p_keys loop
    if not (p ? k) or p -> k = 'null'::jsonb then
      raise exception 'invalid_payload: missing %', k using errcode = '22023';
    end if;
  end loop;
end
$$;
revoke all on function public._require_keys(jsonb, text[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- save_appearance: boss or stylist, optimistic concurrency.
-- ---------------------------------------------------------------------------
create function public.save_appearance(
  p_employee_id text, p_doc jsonb, p_expected_version int
) returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before jsonb;
  v_new    int;
  v_rows   int;
begin
  if not public.is_staff() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  if not exists (select 1 from public.employees where id = p_employee_id) then
    raise exception 'unknown_employee' using errcode = '23503';
  end if;
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' or p_doc ->> 'v' is distinct from '1' then
    raise exception 'invalid_doc: v must be 1' using errcode = '22023';
  end if;
  if octet_length(p_doc::text) >= 16384 then
    raise exception 'invalid_doc: too large' using errcode = '22023';
  end if;

  select to_jsonb(a) into v_before from public.appearances a where a.employee_id = p_employee_id;

  if v_before is null and p_expected_version = 0 then
    begin
      insert into public.appearances (employee_id, doc, version, updated_by)
      values (p_employee_id, p_doc, 1, auth.uid());
    exception when unique_violation then
      raise exception 'version_conflict' using errcode = 'P0001';
    end;
    v_new := 1;
  else
    update public.appearances
       set doc = p_doc, version = version + 1, updated_at = now(), updated_by = auth.uid()
     where employee_id = p_employee_id and version = p_expected_version
    returning version into v_new;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      raise exception 'version_conflict' using errcode = 'P0001';
    end if;
  end if;

  perform public._audit('appearances', p_employee_id,
    case when v_before is null then 'insert' else 'update' end,
    v_before, p_doc);
  return v_new;
end
$$;

-- ---------------------------------------------------------------------------
-- upsert_* (boss only). p is the TS camelCase entity.
-- ---------------------------------------------------------------------------
create function public.upsert_department(p jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before jsonb; v_after jsonb;
begin
  perform public._require_boss();
  perform public._require_keys(p, array['id','key','label','order','colorSwatch','icon','hours','floorTemplate','active']);
  select to_jsonb(d) into v_before from public.departments d where d.id = p ->> 'id';
  insert into public.departments (id, key, label, "order", color_swatch, icon, hours, floor_template, active)
  values (p ->> 'id', p ->> 'key', p -> 'label', (p ->> 'order')::int, p ->> 'colorSwatch', p ->> 'icon',
          p ->> 'hours', p ->> 'floorTemplate', (p ->> 'active')::boolean)
  on conflict (id) do update set
    key = excluded.key, label = excluded.label, "order" = excluded."order",
    color_swatch = excluded.color_swatch, icon = excluded.icon, hours = excluded.hours,
    floor_template = excluded.floor_template, active = excluded.active;
  select to_jsonb(d) into v_after from public.departments d where d.id = p ->> 'id';
  perform public._audit('departments', p ->> 'id', case when v_before is null then 'insert' else 'update' end, v_before, v_after);
end $$;

create function public.upsert_role(p jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before jsonb; v_after jsonb;
begin
  perform public._require_boss();
  perform public._require_keys(p, array['key','label','scope','caps']);
  select to_jsonb(t) into v_before from public.roles t where t.key = p ->> 'key';
  insert into public.roles (key, def) values (p ->> 'key', p - 'key')
  on conflict (key) do update set def = excluded.def;
  select to_jsonb(t) into v_after from public.roles t where t.key = p ->> 'key';
  perform public._audit('roles', p ->> 'key', case when v_before is null then 'insert' else 'update' end, v_before, v_after);
end $$;

create function public.upsert_specialty(p jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before jsonb; v_after jsonb;
begin
  perform public._require_boss();
  perform public._require_keys(p, array['key','label','icon']);
  select to_jsonb(t) into v_before from public.specialties t where t.key = p ->> 'key';
  insert into public.specialties (key, def) values (p ->> 'key', p - 'key')
  on conflict (key) do update set def = excluded.def;
  select to_jsonb(t) into v_after from public.specialties t where t.key = p ->> 'key';
  perform public._audit('specialties', p ->> 'key', case when v_before is null then 'insert' else 'update' end, v_before, v_after);
end $$;

create function public.upsert_platform(p jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before jsonb; v_after jsonb;
begin
  perform public._require_boss();
  perform public._require_keys(p, array['key','label','kind','badge','active']);
  select to_jsonb(t) into v_before from public.platforms t where t.key = p ->> 'key';
  insert into public.platforms (key, def) values (p ->> 'key', p - 'key')
  on conflict (key) do update set def = excluded.def;
  select to_jsonb(t) into v_after from public.platforms t where t.key = p ->> 'key';
  perform public._audit('platforms', p ->> 'key', case when v_before is null then 'insert' else 'update' end, v_before, v_after);
end $$;

create function public.upsert_shop(p jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before jsonb; v_after jsonb;
begin
  perform public._require_boss();
  perform public._require_keys(p, array['id','platformKey','name']);
  select to_jsonb(t) into v_before from public.shops t where t.id = p ->> 'id';
  insert into public.shops (id, platform_key, name, handle)
  values (p ->> 'id', p ->> 'platformKey', p ->> 'name', p ->> 'handle')
  on conflict (id) do update set
    platform_key = excluded.platform_key, name = excluded.name, handle = excluded.handle;
  select to_jsonb(t) into v_after from public.shops t where t.id = p ->> 'id';
  perform public._audit('shops', p ->> 'id', case when v_before is null then 'insert' else 'update' end, v_before, v_after);
end $$;

create function public.upsert_task_type(p jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before jsonb; v_after jsonb;
begin
  perform public._require_boss();
  perform public._require_keys(p, array['key','departmentKey','label','specialty']);
  select to_jsonb(t) into v_before from public.task_types t where t.key = p ->> 'key';
  insert into public.task_types (key, def) values (p ->> 'key', p - 'key')
  on conflict (key) do update set def = excluded.def;
  select to_jsonb(t) into v_after from public.task_types t where t.key = p ->> 'key';
  perform public._audit('task_types', p ->> 'key', case when v_before is null then 'insert' else 'update' end, v_before, v_after);
end $$;

create function public.upsert_employee(p jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before jsonb; v_after jsonb; v_spec text[];
begin
  perform public._require_boss();
  perform public._require_keys(p, array['id','name','roleKey','kind','state','reviewMode','createdBy']);
  select coalesce(array_agg(x), '{}') into v_spec
    from jsonb_array_elements_text(coalesce(p -> 'specialties', '[]'::jsonb)) x;
  select to_jsonb(t) into v_before from public.employees t where t.id = p ->> 'id';
  insert into public.employees (id, name, department_id, role_key, specialties, kind, state, review_mode,
                                model_tier_override, bio, created_at, created_by, archived_at)
  values (p ->> 'id', p ->> 'name', p ->> 'departmentId', p ->> 'roleKey', v_spec, p ->> 'kind', p ->> 'state',
          p ->> 'reviewMode', p ->> 'modelTierOverride',
          case when p -> 'bio' = 'null'::jsonb then null else p -> 'bio' end,
          coalesce((p ->> 'createdAt')::timestamptz, now()), p ->> 'createdBy', (p ->> 'archivedAt')::timestamptz)
  on conflict (id) do update set
    name = excluded.name, department_id = excluded.department_id, role_key = excluded.role_key,
    specialties = excluded.specialties, kind = excluded.kind, state = excluded.state,
    review_mode = excluded.review_mode, model_tier_override = excluded.model_tier_override,
    bio = excluded.bio, archived_at = excluded.archived_at;
  select to_jsonb(t) into v_after from public.employees t where t.id = p ->> 'id';
  perform public._audit('employees', p ->> 'id', case when v_before is null then 'insert' else 'update' end, v_before, v_after);
end $$;

create function public.upsert_approval_rule(p jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before jsonb; v_after jsonb;
begin
  perform public._require_boss();
  perform public._require_keys(p, array['id','order','enabled','label','when','level']);
  select to_jsonb(t) into v_before from public.approval_rules t where t.id = p ->> 'id';
  insert into public.approval_rules (id, "order", enabled, label, "when", level)
  values (p ->> 'id', (p ->> 'order')::int, (p ->> 'enabled')::boolean, p -> 'label', p -> 'when',
          (p ->> 'level')::public.approval_level)
  on conflict (id) do update set
    "order" = excluded."order", enabled = excluded.enabled, label = excluded.label,
    "when" = excluded."when", level = excluded.level;
  select to_jsonb(t) into v_after from public.approval_rules t where t.id = p ->> 'id';
  perform public._audit('approval_rules', p ->> 'id', case when v_before is null then 'insert' else 'update' end, v_before, v_after);
end $$;

create function public.set_policy(p jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before jsonb; v_after jsonb;
begin
  perform public._require_boss();
  perform public._require_keys(p, array['staffing','help','priority','approvals','work','calendar']);
  select doc into v_before from public.policy where id = 1;
  insert into public.policy (id, doc) values (1, p)
  on conflict (id) do update set doc = excluded.doc;
  select doc into v_after from public.policy where id = 1;
  perform public._audit('policy', '1', case when v_before is null then 'insert' else 'update' end, v_before, v_after);
end $$;

-- ---------------------------------------------------------------------------
-- archive / restore / rule delete + reorder (boss only)
-- ---------------------------------------------------------------------------
create function public.archive_employee(p_id text, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before jsonb; v_after jsonb;
begin
  perform public._require_boss();
  select to_jsonb(e) into v_before from public.employees e where e.id = p_id;
  if v_before is null then
    raise exception 'unknown_employee' using errcode = '23503';
  end if;
  update public.employees set state = 'archived', archived_at = now() where id = p_id;
  select to_jsonb(e) into v_after from public.employees e where e.id = p_id;
  perform public._audit('employees', p_id, 'archive',
    v_before, v_after || jsonb_build_object('reason', p_reason));
end $$;

create function public.restore_employee(p_id text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before jsonb; v_after jsonb;
begin
  perform public._require_boss();
  select to_jsonb(e) into v_before from public.employees e where e.id = p_id;
  if v_before is null then
    raise exception 'unknown_employee' using errcode = '23503';
  end if;
  update public.employees set state = 'active', archived_at = null where id = p_id;
  select to_jsonb(e) into v_after from public.employees e where e.id = p_id;
  perform public._audit('employees', p_id, 'restore', v_before, v_after);
end $$;

create function public.delete_approval_rule(p_id text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before jsonb;
begin
  perform public._require_boss();
  delete from public.approval_rules where id = p_id returning to_jsonb(approval_rules) into v_before;
  if v_before is null then
    raise exception 'unknown_rule' using errcode = 'P0002';
  end if;
  perform public._audit('approval_rules', p_id, 'delete', v_before, null);
end $$;

create function public.reorder_approval_rules(p_ids text[]) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before jsonb; v_after jsonb;
begin
  perform public._require_boss();
  select jsonb_agg(id order by "order", id) into v_before from public.approval_rules;
  if p_ids is null
     or array_length(p_ids, 1) is distinct from (select count(*)::int from public.approval_rules)
     or exists (select 1 from unnest(p_ids) i where not exists (select 1 from public.approval_rules r where r.id = i))
     or (select count(distinct i) from unnest(p_ids) i) <> array_length(p_ids, 1) then
    raise exception 'invalid_payload: ids must list every rule exactly once' using errcode = '22023';
  end if;
  update public.approval_rules r set "order" = o.ord - 1
    from unnest(p_ids) with ordinality as o(id, ord) where r.id = o.id;
  select jsonb_agg(id order by "order", id) into v_after from public.approval_rules;
  perform public._audit('approval_rules', '*', 'reorder', v_before, v_after);
end $$;

-- ---------------------------------------------------------------------------
-- Grants: RPCs for signed-in users only. Role checks live inside each function.
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'save_appearance(text, jsonb, int)',
    'upsert_department(jsonb)', 'upsert_role(jsonb)', 'upsert_specialty(jsonb)',
    'upsert_platform(jsonb)', 'upsert_shop(jsonb)', 'upsert_task_type(jsonb)',
    'upsert_employee(jsonb)', 'upsert_approval_rule(jsonb)', 'set_policy(jsonb)',
    'archive_employee(text, text)', 'restore_employee(text)',
    'delete_approval_rule(text)', 'reorder_approval_rules(text[])'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end
$$;
