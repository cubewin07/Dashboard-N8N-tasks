-- P09-T03 · Org config tables (data-model.md §5, decision D1).
-- Real columns for departments, employees and approval rules (future workers query them);
-- `def jsonb` for small definition entities (the TS object minus its key).
-- Column names are snake_case versions of the TS fields; src/adapters/supabase maps them.
-- Never edit this file after it has been pushed; add a new migration instead.

create table public.departments (
  id             text primary key check (id ~ '^dep_[a-z0-9_]+$'),
  key            text unique not null,
  label          jsonb not null,
  "order"        int not null check ("order" >= 0),
  color_swatch   text not null,
  icon           text not null,
  hours          text not null check (hours in ('office', '24_7')),
  floor_template text not null default 'department',
  active         boolean not null default true
);

create table public.roles (
  key text primary key,
  def jsonb not null            -- RoleDef minus key
);

create table public.specialties (
  key text primary key,
  def jsonb not null            -- Specialty minus key
);

create table public.platforms (
  key text primary key,
  def jsonb not null            -- Platform minus key
);

create table public.shops (
  id           text primary key check (id ~ '^shop_[a-z0-9_]+$'),
  platform_key text not null references public.platforms (key),
  name         text not null,
  handle       text null
);

create table public.task_types (
  key text primary key,
  def jsonb not null            -- TaskType minus key
);

create table public.employees (
  id                  text primary key check (id ~ '^emp_[a-z0-9_]+$'),
  name                text not null,
  department_id       text null references public.departments (id),
  role_key            text not null references public.roles (key),
  specialties         text[] not null default '{}',
  kind                text not null check (kind in ('core', 'temp')),
  state               text not null check (state in ('active', 'archived')),
  review_mode         text not null check (review_mode in ('always', 'when_important')),
  model_tier_override text null check (model_tier_override in ('strong', 'standard', 'cheap')),
  bio                 jsonb null,
  created_at          timestamptz not null default now(),
  created_by          text not null check (created_by in ('seed', 'boss', 'manager')),
  archived_at         timestamptz null
);

create table public.approval_rules (
  id      text primary key,
  "order" int not null check ("order" >= 0),
  enabled boolean not null,
  label   jsonb not null,
  "when"  jsonb not null,
  level   public.approval_level not null
);

create table public.policy (
  id  int primary key default 1 check (id = 1),
  doc jsonb not null
);

create index employees_department_id_idx on public.employees (department_id);
create index employees_state_idx on public.employees (state);
create index approval_rules_order_idx on public.approval_rules ("order");

alter table public.app_users
  add constraint app_users_owner_employee_fk
  foreign key (owner_employee_id) references public.employees (id) on delete set null;

-- ---------------------------------------------------------------------------
-- RLS (§3.2). Select only; no insert/update/delete policies (R3). Nothing for anon (R2).
-- Supabase's default privileges grant everything to anon/authenticated on new public tables,
-- so take that away explicitly and give back select only.
--   staff (boss + stylist): departments, roles, employees  (the wardrobe needs them)
--   boss only:              specialties, platforms, shops, task_types, approval_rules, policy
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'departments', 'roles', 'specialties', 'platforms', 'shops',
    'task_types', 'employees', 'approval_rules', 'policy'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
  end loop;

  foreach t in array array['departments', 'roles', 'employees'] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_staff())',
      t || '_select_staff', t
    );
  end loop;

  foreach t in array array[
    'specialties', 'platforms', 'shops', 'task_types', 'approval_rules', 'policy'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_boss())',
      t || '_select_boss', t
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Realtime: two open browsers stay in sync (R12). postgres_changes respects RLS.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table
  public.departments, public.roles, public.specialties, public.platforms, public.shops,
  public.task_types, public.employees, public.approval_rules, public.policy;
