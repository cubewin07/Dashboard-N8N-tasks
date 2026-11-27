-- Boss reads everything; nobody writes tables directly, not even a boss.
begin;
select plan(19);
select tests.create_users();
select tests.as_user('boss');

select is((select count(*)::int from public.employees), 28, 'boss: employees');
select is((select count(*)::int from public.departments), 4, 'boss: departments');
select is((select count(*)::int from public.roles), 6, 'boss: roles');
select is((select count(*)::int from public.specialties), 15, 'boss: specialties');
select is((select count(*)::int from public.platforms), 9, 'boss: platforms');
select is((select count(*)::int from public.shops), 5, 'boss: shops');
select is((select count(*)::int from public.task_types), 43, 'boss: task_types');
select is((select count(*)::int from public.approval_rules), 5, 'boss: approval_rules');
select is((select count(*)::int from public.policy), 1, 'boss: policy');
select is((select count(*)::int from public.app_users), 3, 'boss: all app_users');
select is((select count(*)::int from public.config_audit), 0, 'boss: config_audit selectable');

select throws_ok($$insert into public.departments (id,key,label,"order",color_swatch,icon,hours) values ('dep_x','x','{}',1,'a','b','office')$$, '42501', null, 'boss: direct insert denied');
select throws_ok($$update public.employees set name = 'x'$$, '42501', null, 'boss: direct update employees denied');
select throws_ok($$delete from public.employees$$, '42501', null, 'boss: direct delete employees denied');
select throws_ok($$update public.policy set doc = '{}'$$, '42501', null, 'boss: direct update policy denied');
select throws_ok($$insert into public.config_audit (actor, entity, entity_id, action) values (gen_random_uuid(), 'a', 'b', 'c')$$, '42501', null, 'boss: audit insert denied');

select tests.as_postgres();
insert into public.appearances (employee_id, doc, updated_by) values ('emp_giam_doc', '{"v":1}', tests.uid('boss'));
select tests.as_user('boss');
select throws_ok($$update public.appearances set doc = '{"v":1,"x":1}'$$, '42501', null, 'boss: direct update appearances denied');
select throws_ok($$insert into public.appearances (employee_id, doc, updated_by) values ('emp_giam_doc','{"v":1}', gen_random_uuid())$$, '42501', null, 'boss: direct insert appearances denied');
select throws_ok($$delete from public.appearances$$, '42501', null, 'boss: direct delete appearances denied');

select * from finish();
rollback;
