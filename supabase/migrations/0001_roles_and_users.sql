-- P09-T02 · Roles and users.
-- Who may log in and what they may do. A Supabase Auth user without an app_users row can do nothing.
-- Never edit this file after it has been pushed; add a new migration instead.

create type public.app_role as enum ('boss', 'stylist');
create type public.approval_level as enum ('reviewer', 'dept_manager', 'boss');

create table public.app_users (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  role              public.app_role not null,
  display_name      text not null check (length(display_name) between 1 and 80),
  -- links a boss login to their avatar in the building (FK added in 0002, once employees exists)
  owner_employee_id text null
);

comment on table public.app_users is
  'Allow-list of logins and their role. Rows are added by hand in the SQL editor (runbook step 5).';

-- ---------------------------------------------------------------------------
-- Helpers used by every policy and RPC.
-- security definer so they can read app_users without recursing through its RLS.
-- ---------------------------------------------------------------------------

create function public.app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.role from public.app_users u where u.user_id = auth.uid()
$$;

create function public.is_boss()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.app_role() = 'boss', false)
$$;

create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.app_role() is not null
$$;

revoke all on function public.app_role() from public, anon;
revoke all on function public.is_boss() from public, anon;
revoke all on function public.is_staff() from public, anon;
grant execute on function public.app_role() to authenticated;
grant execute on function public.is_boss() to authenticated;
grant execute on function public.is_staff() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: a user selects their own row, a boss selects all. No write policies (R3).
-- ---------------------------------------------------------------------------

alter table public.app_users enable row level security;

revoke all on table public.app_users from anon, authenticated;
grant select on table public.app_users to authenticated;

create policy app_users_select on public.app_users
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_boss());
