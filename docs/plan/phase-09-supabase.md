# P09: Supabase backend (auth, config, appearance)

## 1. Goal and demo
Replace the demo logins and browser-only storage with a real backend: Supabase Auth with three accounts (two bosses, one stylist), org config and appearance docs stored in Postgres behind RLS, and realtime so two open browsers stay in sync. The simulator still drives all activity, in each browser.

**Demo after merge:** the sister logs in on her phone with her own account and sees only "Tủ đồ". She changes Linh's hair; on the Mac Studio, where dad is logged in as boss, Linh's hair changes within a second without a refresh. Signing in with a wrong password fails; a logged-out visitor sees only the login page. With no Supabase variables set (CI, a fresh clone), the app still runs fully on the Local adapters.

**Note for the demo:** two viewers see the **same org and the same looks**, but **different simulated activity**, because `SimFeed` runs separately in each browser. This is expected until the real feed exists (`after-this-phase.md` §7).

## 2. Requirements
- **R1** `supabase/migrations/` holds five migrations, one concern each (§3.1). Each is idempotent where it seeds, and none is edited after being applied.
- **R2** Every table has RLS enabled. `anon` can read and write nothing. `authenticated` users without an `app_users` row can read and write nothing.
- **R3** No table has an `insert`, `update` or `delete` policy. All writes go through `security definer` RPCs with `set search_path = public, pg_temp` and an explicit role check.
- **R4** Role `stylist` can `select` only what the wardrobe needs (§3.2) and can call only `save_appearance`. Calling any boss RPC as stylist raises `42501` (insufficient privilege).
- **R5** `save_appearance` uses optimistic concurrency: a stale `expected_version` raises a `version_conflict` error and changes nothing.
- **R6** Every RPC write adds one `config_audit` row (actor, entity, entity id, action, before, after).
- **R7** SQL tests (`supabase/tests/*.sql`, pgTAP) prove R2–R6 and run with `supabase test db` locally and in CI.
- **R8** `src/adapters/supabase/` implements `AuthPort`, `ConfigSource` (load + subscribe) and `AppearanceStore` against the contract in `contracts.md` §1. No other folder imports `@supabase/supabase-js`.
- **R9** Adapter selection: both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` present → Supabase adapters; otherwise Local adapters. The build, unit tests and E2E pass with **no** env vars.
- **R10** The only env vars in the repo and in the bundle are `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_CLIENT_ID`, `VITE_FEED`. No service_role key anywhere (code, workflow, docs, chat).
- **R11** Login is email + password only, no sign-up UI; password reset works through the existing `#/reset-password` page.
- **R12** A config or appearance change made in one browser appears in another logged-in browser within 2 s without reload; on reconnect the adapters reload everything.
- **R13** Appearance conflict: if someone else saved the same employee while the editor was open, the user sees "Người khác vừa đổi diện mạo này" with **Tải lại** / **Ghi đè**; nothing is lost silently.
- **R14** A boss can import looks saved in this browser's localStorage into Supabase once (button in Settings), with a per-employee result list.
- **R15** `docs/plan/runbook-supabase.md` gives click-by-click human steps (§3.6) and never asks for a secret in chat.

## 3. Specs
### 3.1 Migrations
| File | Content |
|---|---|
| `0001_roles_and_users.sql` | enums `app_role('boss','stylist')`, `approval_level`; table `app_users`; helper `app_role() returns app_role` (`stable`, `security definer`, reads `app_users` for `auth.uid()`, returns null if absent); helpers `is_boss()`, `is_staff()` (boss or stylist); RLS on `app_users`: a user selects own row, a boss selects all |
| `0002_config_tables.sql` | `departments, roles, specialties, platforms, shops, task_types, employees, approval_rules, policy` exactly as `data-model.md` §5; indexes `employees(department_id)`, `employees(state)`, `approval_rules("order")`; RLS + select policies (§3.2); `alter publication supabase_realtime add table …` for each |
| `0003_seed_org.sql` | **Generated** by `scripts/seed-sql.mjs` from `src/content/*.json`; `insert … on conflict do nothing`; header comment "GENERATED, do not edit; run npm run seed:sql" |
| `0004_appearances.sql` | `appearances` table, RLS, select policy for boss + stylist, realtime publication, `replica identity full` |
| `0005_audit_and_rpcs.sql` | `config_audit` (boss select only); private helper `_audit(entity, entity_id, action, before, after)`; all RPCs (§3.3); `revoke all on function … from public, anon; grant execute … to authenticated` |

Later schema changes add `0006_…`; JSON seed changes after first push ship as a new generated migration (`seed-sql.mjs --since <git ref>` emits only new rows), never by editing 0003.

### 3.2 Select policies
| Table | boss | stylist | anon |
|---|---|---|---|
| `app_users` | all rows | own row | – |
| `employees`, `departments`, `roles`, `appearances` | ✓ | ✓ | – |
| `specialties`, `platforms`, `shops`, `task_types`, `approval_rules`, `policy`, `config_audit` | ✓ | – | – |

Policy form: `using (is_boss())` or `using (is_staff())`, `to authenticated`. The stylist client therefore loads a **reduced config**; `SupabaseConfigSource.load()` fills the missing parts from the bundled `src/content` defaults so zod validation still passes and the wardrobe's people list works.

### 3.3 RPCs
| RPC | Role | Behaviour |
|---|---|---|
| `save_appearance(p_employee_id text, p_doc jsonb, p_expected_version int) returns int` | boss, stylist | Checks employee exists; checks `p_doc->>'v' = '1'` and size < 16 KB; insert when no row and expected 0; else `update … where version = p_expected_version`; 0 rows → `raise exception 'version_conflict' using errcode = 'P0001'`; returns new version; audits |
| `upsert_department(p jsonb)`, `upsert_role(p jsonb)`, `upsert_specialty(p jsonb)`, `upsert_platform(p jsonb)`, `upsert_shop(p jsonb)`, `upsert_task_type(p jsonb)`, `upsert_employee(p jsonb)`, `upsert_approval_rule(p jsonb)`, `set_policy(p jsonb)` | boss | Validate required keys in SQL (cheap checks only; full validation is zod in the client, P10); insert or update by primary key; audit before/after |
| `archive_employee(p_id text, p_reason text)`, `restore_employee(p_id text)` | boss | Flip `state`, set/clear `archived_at`; the `appearances` row is kept |
| `delete_approval_rule(p_id text)`, `reorder_approval_rules(p_ids text[])` | boss | Rules are the only config rows that can be hard-deleted |

RPCs are created and SQL-tested here; the **UI and `ConfigSource.apply` wiring are P10** (decision D4). `save_appearance` is fully wired here.

### 3.4 Adapters (`src/adapters/supabase/`)
```
client.ts                   createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true } })
SupabaseAuth.ts             AuthPort: signInWithPassword, signOut, resetPasswordForEmail(redirect → #/reset-password),
                            session() joins app_users (role, display_name); a user with no app_users row is signed out
                            with error key auth.notAllowed
SupabaseConfigSource.ts     load(): parallel selects → map rows → OrgConfig → zod; subscribe(): ONE channel
                            'config' with postgres_changes on the config tables, debounce 150 ms, reload, emit;
                            apply(): throws ConfigError('not_supported') until P10
SupabaseAppearanceStore.ts  get/getAll (select), save (rpc save_appearance; maps P0001 → AppearanceConflictError
                            carrying the server doc + version), subscribe (channel 'appearances')
realtime.ts                 shared channel helper; reports 'live' | 'reconnecting' | 'offline'; on re-join calls
                            each adapter's reload()
database.types.ts           generated: supabase gen types typescript --linked
index.ts                    isSupabaseConfigured(), createSupabaseAdapters()
```
- `src/office/configStore.ts` and `src/app/providers.tsx` choose adapters with `isSupabaseConfigured()` (the only allowed import sites, per the boundary rule).
- `LiveBadge` shows the worst of feed connection and Supabase realtime connection.
- The session is stored by supabase-js in localStorage (its default). That is the Supabase session token, which is allowed; the **Drive** token rule (memory only) is unchanged.
- Local demo accounts (`LocalAuth`) are disabled when Supabase is configured.

### 3.5 Appearance conflict flow
Wardrobe keeps `baseVersion` from when the editor opened. On `AppearanceConflictError`: dialog with both options. **Tải lại** replaces the draft with the server doc. **Ghi đè** retries with the server's version. A realtime update for the employee being edited shows a quiet banner ("Có thay đổi mới") instead of replacing the draft.

### 3.6 Human runbook (`docs/plan/runbook-supabase.md`, written in T12)
1. supabase.com → New project → name `ai-office`, region **Southeast Asia (Singapore)**, generate a DB password and store it in your password manager.
2. Authentication → Sign In / Providers → Email: enable; turn **off** "Allow new users to sign up"; URL Configuration → Site URL `https://cubewin07.github.io/Dashboard-N8N-tasks/`, add redirect `http://localhost:5173/Dashboard-N8N-tasks/`.
3. Authentication → Users → Add user ×3 (dad, you, sister), "Auto confirm user" on.
4. Terminal on the Mac: `brew install supabase/tap/supabase` → `supabase login` → `supabase link --project-ref <ref>` → `supabase db push` → `supabase test db --linked` is **not** run against production; tests run locally (`supabase start && supabase test db`).
5. SQL editor → paste the snippet from the runbook that inserts three `app_users` rows by email (`select id from auth.users where email = …`), roles `boss`, `boss`, `stylist`, and links each boss to an owner avatar (`owner_employee_id`).
6. Project Settings → API → copy **Project URL** and **anon public** key into `.env.local` (git-ignored) and into GitHub → repo Settings → Secrets and variables → Actions → **Variables** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Never copy the `service_role` key anywhere. Never paste keys into chat.
7. Re-run the Pages deploy (Actions → Deploy → Run workflow). Log in with each account and tick the test checklist.
8. Keep-alive: free projects pause after about 7 days without activity. Opening the app counts. If paused: dashboard → project → **Restore**. (A scheduled ping arrives with real workers.)

## 4. Design choices
| # | Topic | Options | Choice | Reason | Revisit if |
|---|---|---|---|---|---|
| D1 | Config storage | one JSONB doc · normalised tables · tables with JSONB `def` for small entities | **Mixed, as `data-model.md` §5** (real columns for departments/employees/rules, `def jsonb` for roles/specialties/platforms/task types) | Future workers query employees and rules by column; small definition entities change shape often | Workers need to filter by role capability in SQL → promote columns |
| D2 | Write path | direct table policies · RPCs · commands table | **RPCs only** | One place for role check + audit + concurrency; a policy can't write an audit row or compare versions | – |
| D3 | Stylist isolation | UI gating only · RLS select subset + RPC grant | **RLS + RPC check** (UI gating stays as convenience) | "Only appearance and nothing else" must hold even with the anon key and a console | – |
| D4 | `ConfigSource.apply` | wire here · wire in P10 | **P10** | Keeps this PR reviewable (SQL + read path + auth); P10 defines the `ConfigChange` union the mapping needs | P10 slips and local-only editing is not acceptable |
| D5 | Simulator location | browser per viewer · shared sim writing to Supabase (Edge Function/cron) | **Browser per viewer** | No server to run, removable, zero cost; the shared stream is exactly what the real feed will be | Dad and son must watch the *same* fake activity in two places → record a run and use `ReplayFeed` |
| D6 | DB tests | none · pgTAP via `supabase test db` · JS integration tests with three users | **pgTAP** | Runs in the local Supabase stack with no secrets; RLS bugs are the costliest bugs here | Docker in CI too slow → nightly job |
| D7 | Seed source | hand-written SQL · generated from JSON | **Generated** | `src/content` stays the single source; Local and Supabase modes start identical | – |
| D8 | Types | hand-written · `supabase gen types` | **Generated, committed** | Catches column drift at typecheck | – |

## 5. Tasks
- [ ] **P09-T01** Supabase project scaffold. *Files:* `supabase/config.toml`, `.gitignore`, `package.json` (scripts `db:start`, `db:test`, `db:types`, `seed:sql`). *Steps:* `supabase init`; disable sign-ups in `config.toml` (`enable_signup = false`); document Docker requirement. *Acceptance:* `supabase start` boots locally; `npm run build` unaffected.
- [ ] **P09-T02** Migration 0001 (§3.1). *Files:* `supabase/migrations/0001_roles_and_users.sql`. *Acceptance:* `supabase db reset` applies; `select app_role()` returns null for a user without a row.
- [ ] **P09-T03** Migration 0002 config tables + RLS + realtime. *Files:* `supabase/migrations/0002_config_tables.sql`. *Acceptance:* every table shows `rowsecurity = true` in `pg_tables`; no policy with cmd other than SELECT (query in the test).
- [ ] **P09-T04** ∥ `scripts/seed-sql.mjs` + generated 0003. *Steps:* read and zod-validate `src/content/*.json`; emit inserts with `on conflict do nothing`; `--check` mode fails CI when the file is stale. *Acceptance:* after reset, row counts equal JSON counts (28 employees, 4 departments, 9 platforms, 5 shops); running twice changes nothing.
- [ ] **P09-T05** Migration 0004 appearances. *Acceptance:* stylist and boss can select; anon cannot.
- [ ] **P09-T06** Migration 0005 audit + RPCs (§3.3). *Acceptance:* each RPC has `prosecdef = true` and a `search_path` setting (catalog query in tests); execute revoked from `anon`.
- [ ] **P09-T07** pgTAP suite. *Files:* `supabase/tests/00_helpers.sql` (create three users, `set local request.jwt.claims`), `01_rls_anon.sql`, `02_rls_stylist.sql`, `03_rls_boss.sql`, `04_save_appearance.sql`, `05_boss_rpcs.sql`, `06_audit.sql`. *Acceptance:* covers R2–R6 including: anon selects 0 rows everywhere; stylist cannot select `policy`/`approval_rules`/`config_audit`; stylist `upsert_employee` → 42501; direct `update appearances` as boss → denied; stale version → `version_conflict`; each write → exactly one audit row. CI job `db` runs it.
- [ ] **P09-T08** Client + generated types. *Files:* `src/adapters/supabase/{client,index,database.types}.ts`, `.env.example` (comments only). *Acceptance:* with no env, `isSupabaseConfigured()` is false and supabase-js is not in the initial chunk (dynamic import; check build output).
- [ ] **P09-T09** `SupabaseAuth` + login wiring. *Files:* `SupabaseAuth.ts`, `src/app/auth.tsx`, `src/features/login/*`, i18n. *Steps:* implement port; generic error "Email hoặc mật khẩu không đúng"; not-allowed error; reset flow via `onAuthStateChange('PASSWORD_RECOVERY')`. *Acceptance:* unit tests with a mocked client; manual: three accounts log in with the right role; stylist deep-linking to `#/admin` lands on `#/wardrobe`.
- [ ] **P09-T10** ∥ `SupabaseConfigSource` (load + subscribe). *Files:* `SupabaseConfigSource.ts`, `realtime.ts`, `src/office/configStore.ts`. *Acceptance:* row-mapping unit tests round-trip the seed (`mapRows(seedRows)` deep-equals bundled config); editing a department label in the SQL editor updates the floor label in an open browser within 2 s; reduced stylist config validates.
- [ ] **P09-T11** ∥ `SupabaseAppearanceStore` + conflict UI + one-time import. *Files:* `SupabaseAppearanceStore.ts`, `src/features/wardrobe/ConflictDialog.tsx`, `src/features/settings/ImportLocalLooks.tsx`, i18n. *Acceptance:* R12–R14; unit test for error mapping; two-browser manual check in the PR description.
- [ ] **P09-T12** Runbook + CI. *Files:* `docs/plan/runbook-supabase.md`, `.github/workflows/ci.yml` (job `db`: `supabase start`, `supabase test db`, `seed-sql --check`), `deploy.yml` (no change expected; confirm variables). *Acceptance:* R15; CI green without secrets.
- [ ] **P09-T13** Connection state + reconnect. *Files:* `realtime.ts`, `src/components/LiveBadge.tsx`. *Acceptance:* toggling the network offline/online in devtools shows reconnecting → live and triggers a reload of config and appearances.
- [ ] **P09-T14** Security review. *Steps:* `grep -ri "service_role" .` (excluding `node_modules`) returns only warnings in docs; inspect `dist/` for any key except the anon key; run the `security-review` skill on the diff; check the Supabase dashboard "Security Advisor" shows no RLS warnings. *Acceptance:* results pasted into the PR description.
- [ ] **P09-T15** Contract + docs update. *Files:* `contracts.md` (v1.1: RPC list, error codes), `data-model.md` §5 (final DDL differences). *Acceptance:* `contracts.test.ts` passes with the bumped version.

## 6. Dependencies
- **Needs:** P01 (ports, config schema, `configStore`), P08b (`AuthPort`, `LocalAuth`, `AppearanceStore`, wardrobe, stylist gating).
- **Later phases rely on:** P10 (RPCs, `config_audit`, `SupabaseConfigSource`), P11 (settings page, runbook). After this phase: `app_users`, the RPC write rule and `config_audit` are the base for real workers, permissions and the audit log.

## 7. Branch and PR
- Branch `stack/p09-supabase` from `stack/p08b-wardrobe`. PR base `stack/p08b-wardrobe`. Title: `[P09] Supabase backend: auth, config, appearance (RLS + RPC)`.
- Description template:
```md
<stack map>
## What
Real logins (boss ×2, stylist), config + appearance in Supabase with RLS, RPC-only writes, realtime sync.
Simulator still runs per browser. App still runs with no backend.
## Human steps before testing
docs/plan/runbook-supabase.md (≈20 min). Do NOT paste keys in chat or in this PR.
## Evidence
- pgTAP output: …
- Security review (T14): …
- Two-browser sync check: …
## Contract
office-contract v1.1 (RPCs, error codes)
```

## 8. Review checklist
- [ ] Every table: RLS on, select-only policies, nothing for `anon`.
- [ ] Every RPC: `security definer`, pinned `search_path`, role check first, audit write, execute revoked from `public`/`anon`.
- [ ] No `service_role`, DB password or project secret in the repo, workflow or PR text.
- [ ] `@supabase/supabase-js` imported only under `src/adapters/supabase/`.
- [ ] Build, unit tests and E2E pass with empty env.
- [ ] 0003 is generated and `seed-sql --check` passes; no hand edits.
- [ ] Stylist cannot reach any non-wardrobe data through the API (tested in pgTAP, not just hidden in the UI).
- [ ] Conflict dialog cannot lose a draft.
- [ ] Runbook steps are exact and complete; a non-developer could follow them.

## 9. Risks and open questions
- **Docker needed for local Supabase and pgTAP.** If the human's Mac has no Docker, tests run only in CI; note it in the runbook.
- **Supabase dashboard labels move.** The runbook names the setting and its section; update on drift.
- **Free-tier pause** during a quiet week breaks the demo at the worst time; the runbook says to open the app the day before showing dad.
- **Existing Supabase project?** Unknown whether the n8n repo already uses one (Q4). If it does, use a **separate** project for now to avoid colliding with the v0.2 tables.
- **Stylist sees employee names and departments.** Assumed fine (family member). If not, add a view exposing only id + name.
- **Realtime limits** on the free tier (connections, messages) are far above three users; no action.
