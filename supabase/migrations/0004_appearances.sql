-- P09-T05 · Appearance docs (what each employee looks like).
-- Staff (boss + stylist) can select; writes only through save_appearance (0005).
-- Never edit this file after it has been pushed; add a new migration instead.

create table public.appearances (
  employee_id text primary key references public.employees (id) on delete cascade,
  doc         jsonb not null,
  version     int not null default 1 check (version >= 1),
  updated_at  timestamptz not null default now(),
  updated_by  uuid not null references auth.users (id)
);

alter table public.appearances enable row level security;

revoke all on table public.appearances from anon, authenticated;
grant select on table public.appearances to authenticated;

create policy appearances_select_staff on public.appearances
  for select to authenticated
  using (public.is_staff());

-- Realtime: DELETE/UPDATE payloads carry the full old row, so clients can diff.
alter table public.appearances replica identity full;
alter publication supabase_realtime add table public.appearances;
