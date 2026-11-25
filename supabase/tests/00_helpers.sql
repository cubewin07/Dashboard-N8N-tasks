-- P09-T07 · Test helpers. `supabase test db` runs every file in its own transaction, so the helper
-- functions are created here once (committed, in the `tests` schema) and each test file calls them
-- to build its fixtures inside its own rolled-back transaction. `supabase db reset` removes them.
create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

-- Fixed users: boss, boss2, stylist (with app_users rows) and nobody (auth user, no app_users row).
create or replace function tests.create_users() returns void
language plpgsql as $$
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'boss@test.local', '', now(), now()),
    ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'boss2@test.local', '', now(), now()),
    ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'stylist@test.local', '', now(), now()),
    ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'nobody@test.local', '', now(), now());
  insert into public.app_users (user_id, role, display_name) values
    ('10000000-0000-0000-0000-000000000001', 'boss', 'Boss'),
    ('10000000-0000-0000-0000-000000000002', 'boss', 'Boss 2'),
    ('10000000-0000-0000-0000-000000000003', 'stylist', 'Stylist');
end $$;

create or replace function tests.uid(p_name text) returns uuid
language sql immutable as $$
  select case p_name
    when 'boss' then '10000000-0000-0000-0000-000000000001'
    when 'boss2' then '10000000-0000-0000-0000-000000000002'
    when 'stylist' then '10000000-0000-0000-0000-000000000003'
    when 'nobody' then '10000000-0000-0000-0000-000000000004'
  end::uuid
$$;

-- Switch the current transaction to a signed-in user (role + JWT claims), like PostgREST does.
create or replace function tests.as_user(p_name text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', tests.uid(p_name), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', tests.uid(p_name)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create or replace function tests.as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('role', 'anon', true);
end $$;

create or replace function tests.as_postgres() returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

grant execute on function tests.uid(text), tests.as_user(text), tests.as_anon(), tests.as_postgres()
  to anon, authenticated;

select plan(1);
select has_function('tests', 'as_user', array['text'], 'test helpers installed');
select * from finish();
