-- R4: stylist sees only what the wardrobe needs and can call only save_appearance.
begin;
select plan(18);
select tests.create_users();
select tests.as_user('stylist');

select is((select count(*)::int from public.employees), 28, 'stylist sees employees');
select is((select count(*)::int from public.departments), 4, 'stylist sees departments');
select is((select count(*)::int from public.roles), 6, 'stylist sees roles');
select is((select count(*)::int from public.appearances), 0, 'stylist can select appearances (empty)');
select is((select count(*)::int from public.app_users), 1, 'stylist sees only own app_users row');

select is((select count(*)::int from public.specialties), 0, 'stylist: specialties hidden');
select is((select count(*)::int from public.platforms), 0, 'stylist: platforms hidden');
select is((select count(*)::int from public.shops), 0, 'stylist: shops hidden');
select is((select count(*)::int from public.task_types), 0, 'stylist: task_types hidden');
select is((select count(*)::int from public.approval_rules), 0, 'stylist: approval_rules hidden');
select is((select count(*)::int from public.policy), 0, 'stylist: policy hidden');
select is((select count(*)::int from public.config_audit), 0, 'stylist: config_audit hidden');

select throws_ok($$select public.upsert_employee('{"id":"emp_x"}')$$, '42501', null, 'stylist: upsert_employee 42501');
select throws_ok($$select public.upsert_department('{}')$$, '42501', null, 'stylist: upsert_department 42501');
select throws_ok($$select public.set_policy('{}')$$, '42501', null, 'stylist: set_policy 42501');
select throws_ok($$select public.archive_employee('emp_giam_doc', 'x')$$, '42501', null, 'stylist: archive_employee 42501');
select throws_ok($$select public.delete_approval_rule('x')$$, '42501', null, 'stylist: delete_approval_rule 42501');
select lives_ok($$select public.save_appearance('emp_giam_doc', '{"v":1}', 0)$$, 'stylist: save_appearance allowed');

select * from finish();
rollback;
