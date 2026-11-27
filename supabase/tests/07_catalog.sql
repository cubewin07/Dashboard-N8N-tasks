-- Catalog checks: RLS everywhere, select-only policies, hardened functions, no anon execute.
begin;
select plan(7);

select is((select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity), 0, 'every public table has RLS enabled');
select is((select count(*)::int from pg_policies where schemaname = 'public' and cmd <> 'SELECT'), 0, 'no write policies in public');
select is((select count(*)::int from pg_policies where schemaname = 'public' and 'anon' = any(roles)), 0, 'no policy for anon');

select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind = 'f' and p.proname !~ '^_require_keys$'
              and not (p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))), 0,
  'public functions are security definer with a fixed search_path');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind = 'f' and p.proname = '_require_keys'
              and not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')), 0,
  '_require_keys (pure helper) has a fixed search_path');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'EXECUTE')), 0,
  'anon has no EXECUTE on any public function');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('_audit', '_require_boss', '_require_keys')
              and has_function_privilege('authenticated', p.oid, 'EXECUTE')), 0,
  'private helpers are not executable by authenticated');

select * from finish();
rollback;
