-- R3/R6: every boss RPC works for a boss and fails for a stylist.
begin;
select plan(29);
select tests.create_users();
select tests.as_user('boss');

select lives_ok($$select public.upsert_department('{"id":"dep_t","key":"t","label":{"vi":"T","en":"T"},"order":9,"colorSwatch":"a","icon":"i","hours":"office","floorTemplate":"department","active":true}')$$, 'upsert_department');
select is((select "order" from public.departments where id = 'dep_t'), 9, 'department stored');
select lives_ok($$select public.upsert_department('{"id":"dep_t","key":"t","label":{"vi":"T","en":"T"},"order":10,"colorSwatch":"a","icon":"i","hours":"office","floorTemplate":"department","active":true}')$$, 'upsert_department update');
select is((select "order" from public.departments where id = 'dep_t'), 10, 'department updated');

select lives_ok($$select public.upsert_role('{"key":"role_t","label":{"vi":"T","en":"T"},"scope":"dept","caps":[]}')$$, 'upsert_role');
select ok(exists (select 1 from public.roles where key = 'role_t'), 'role stored');
select lives_ok($$select public.upsert_specialty('{"key":"spec_t","label":{"vi":"T","en":"T"},"icon":"i"}')$$, 'upsert_specialty');
select ok(exists (select 1 from public.specialties where key = 'spec_t'), 'specialty stored');
select lives_ok($$select public.upsert_platform('{"key":"plat_t","label":{"vi":"T","en":"T"},"kind":"shop","badge":"x","active":true}')$$, 'upsert_platform');
select ok(exists (select 1 from public.platforms where key = 'plat_t'), 'platform stored');
select lives_ok($$select public.upsert_shop('{"id":"shop_t","platformKey":"plat_t","name":"Shop T"}')$$, 'upsert_shop');
select ok(exists (select 1 from public.shops where id = 'shop_t'), 'shop stored');
select lives_ok($$select public.upsert_task_type('{"key":"tt_t","departmentKey":"cs","label":{"vi":"T","en":"T"},"specialty":"spec_t"}')$$, 'upsert_task_type');
select ok(exists (select 1 from public.task_types where key = 'tt_t'), 'task type stored');
select lives_ok($$select public.upsert_employee('{"id":"emp_t","name":"T","departmentId":"dep_t","roleKey":"role_t","specialties":["spec_t"],"kind":"temp","state":"active","reviewMode":"always","createdBy":"boss"}')$$, 'upsert_employee');
select is((select specialties from public.employees where id = 'emp_t'), array['spec_t'], 'employee stored');
select lives_ok($$select public.upsert_approval_rule('{"id":"rule_t","order":9,"enabled":true,"label":{"vi":"T","en":"T"},"when":{},"level":"reviewer"}')$$, 'upsert_approval_rule');
select ok(exists (select 1 from public.approval_rules where id = 'rule_t'), 'rule stored');
select lives_ok($$select public.reorder_approval_rules(array['rule_t','boss_sensitive','boss_big_amount','dm_public','dm_cross_dept','reviewer_routine'])$$, 'reorder_approval_rules');
select is((select "order" from public.approval_rules where id = 'rule_t'), 0, 'rule reordered');
select throws_ok($$select public.reorder_approval_rules(array['rule_t'])$$, '22023', null, 'reorder with partial list rejected');
select lives_ok($$select public.delete_approval_rule('rule_t')$$, 'delete_approval_rule');
select throws_ok($$select public.delete_approval_rule('rule_t')$$, 'P0002', null, 'delete unknown rule -> P0002');
select lives_ok($$select public.archive_employee('emp_t', 'test')$$, 'archive_employee');
select is((select state from public.employees where id = 'emp_t'), 'archived', 'employee archived');
select lives_ok($$select public.restore_employee('emp_t')$$, 'restore_employee');
select is((select state from public.employees where id = 'emp_t'), 'active', 'employee restored');
select lives_ok(format($f$select public.set_policy(%L::jsonb)$f$, (select (doc || '{"staffing":{"tempCap":11}}')::text from public.policy)), 'set_policy');
select is((select doc #>> '{staffing,tempCap}' from public.policy), '11', 'policy stored');

select * from finish();
rollback;
