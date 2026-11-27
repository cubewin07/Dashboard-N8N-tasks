-- R5: save_appearance optimistic concurrency and document validation.
begin;
select plan(13);
select tests.create_users();
select tests.as_user('stylist');

select is(public.save_appearance('emp_giam_doc', '{"v":1,"hair":"a"}', 0), 1, 'insert with expected 0 returns 1');
select is(public.save_appearance('emp_giam_doc', '{"v":1,"hair":"b"}', 1), 2, 'update with expected 1 returns 2');

select throws_ok($$select public.save_appearance('emp_giam_doc', '{"v":1,"hair":"c"}', 1)$$, 'P0001', 'version_conflict', 'stale version -> version_conflict');
select is((select doc ->> 'hair' from public.appearances where employee_id = 'emp_giam_doc'), 'b', 'stale write changed nothing (doc)');
select is((select version from public.appearances where employee_id = 'emp_giam_doc'), 2, 'stale write changed nothing (version)');

select throws_ok($$select public.save_appearance('emp_giam_doc', '{"v":1}', 0)$$, 'P0001', 'version_conflict', 'insert when row exists -> version_conflict');
select throws_ok($$select public.save_appearance('emp_pho_giam_doc', '{"v":1}', 3)$$, 'P0001', 'version_conflict', 'update of missing row -> version_conflict');

select throws_ok($$select public.save_appearance('emp_pho_giam_doc', '{"v":2}', 0)$$, '22023', null, 'v <> 1 rejected');
select throws_ok($$select public.save_appearance('emp_pho_giam_doc', '[1]', 0)$$, '22023', null, 'non-object doc rejected');
select throws_ok(format($f$select public.save_appearance('emp_pho_giam_doc', %L::jsonb, 0)$f$, json_build_object('v', 1, 'pad', repeat('x', 17000))::text),
  '22023', null, 'doc over 16 KB rejected');
select throws_ok($$select public.save_appearance('emp_nope', '{"v":1}', 0)$$, '23503', null, 'unknown employee rejected');
select is((select count(*)::int from public.appearances), 1, 'rejected docs stored nothing');

select tests.as_user('boss');
select is(public.save_appearance('emp_giam_doc', '{"v":1,"hair":"d"}', 2), 3, 'boss may save too');

select * from finish();
rollback;
