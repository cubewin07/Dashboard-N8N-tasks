-- R2: anon reads and writes nothing; a signed-in user with no app_users row sees nothing.
begin;
select plan(23);
select tests.create_users();

-- Every table is denied to anon (no privilege at all).
select tests.as_anon();
select throws_ok($$select 1 from public.employees$$, '42501', null, 'anon: employees denied');
select throws_ok($$select 1 from public.departments$$, '42501', null, 'anon: departments denied');
select throws_ok($$select 1 from public.roles$$, '42501', null, 'anon: roles denied');
select throws_ok($$select 1 from public.specialties$$, '42501', null, 'anon: specialties denied');
select throws_ok($$select 1 from public.platforms$$, '42501', null, 'anon: platforms denied');
select throws_ok($$select 1 from public.shops$$, '42501', null, 'anon: shops denied');
select throws_ok($$select 1 from public.task_types$$, '42501', null, 'anon: task_types denied');
select throws_ok($$select 1 from public.approval_rules$$, '42501', null, 'anon: approval_rules denied');
select throws_ok($$select 1 from public.policy$$, '42501', null, 'anon: policy denied');
select throws_ok($$select 1 from public.appearances$$, '42501', null, 'anon: appearances denied');
select throws_ok($$select 1 from public.config_audit$$, '42501', null, 'anon: config_audit denied');
select throws_ok($$select 1 from public.app_users$$, '42501', null, 'anon: app_users denied');
select throws_ok($$insert into public.departments (id,key,label,"order",color_swatch,icon,hours) values ('dep_x','x','{}',1,'a','b','office')$$, '42501', null, 'anon: insert denied');
select throws_ok($$select public.save_appearance('emp_giam_doc', '{"v":1}', 0)$$, '42501', null, 'anon: save_appearance denied');
select throws_ok($$select public.upsert_department('{}')$$, '42501', null, 'anon: upsert_department denied');

-- Authenticated but not allow-listed: reads return zero rows, RPCs raise 42501.
select tests.as_user('nobody');
select is((select count(*)::int from public.employees), 0, 'nobody: employees empty');
select is((select count(*)::int from public.departments), 0, 'nobody: departments empty');
select is((select count(*)::int from public.roles), 0, 'nobody: roles empty');
select is((select count(*)::int from public.appearances), 0, 'nobody: appearances empty');
select is((select count(*)::int from public.app_users), 0, 'nobody: app_users empty');
select is(public.app_role()::text, null, 'nobody: app_role() is null');
select throws_ok($$select public.save_appearance('emp_giam_doc', '{"v":1}', 0)$$, '42501', null, 'nobody: save_appearance denied');
select throws_ok($$select public.upsert_employee('{}')$$, '42501', null, 'nobody: upsert_employee denied');

select * from finish();
rollback;
