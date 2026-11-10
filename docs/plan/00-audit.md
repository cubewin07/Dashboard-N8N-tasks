# Audit of existing plans

Date: 2026-11-10. Scope: everything in the repo that plans or instructs future work (docs, agent files, code comments that promise later work, branches, issues).
**Nothing has been moved or deleted.** The proposed actions in §4 wait for the boss's approval.

## 1. What exists

| Item | Tracked in git | Uncommitted changes | GitHub |
|---|---|---|---|
| `docs/PLAN.md` | yes | yes (shops 7 → 5) | – |
| `docs/CONTRACT.md` | yes (v0.2 draft) | yes (shop platform enum) | – |
| `docs/EMPLOYEES.md` | yes | no | – |
| `docs/LAYOUT.md` | yes | yes ("BY SHOP (5)") | – |
| `docs/MVP-NOTES.md` | yes | no | – |
| `docs/OPEN-QUESTIONS.md` | yes | yes (new open items) | – |
| `AGENTS.md` | yes | yes (5 shops on 3 marketplaces) | – |
| `CLAUDE.md` | yes | no | – |
| `.herdr-tasks/` (BRIEF, TASK-*, REPORT-*) | **no** (ignored) | – | – |
| Code comments "Later: supabase…" in `src/lib/api.ts`, `src/lib/commands.ts`, `src/app/RealtimeProvider.tsx`, `src/app/auth.tsx`, `src/lib/database.types.ts`, `src/lib/mock/store.ts` | yes | – | – |
| Branch `feat/mvp-ui` (local + origin) | – | – | Same commit as `main` (`93cc9cc`); fully merged |
| GitHub issues / PRs | – | – | **None** (checked open and closed) |
| `TODO` / `FIXME` in `src/` | none | – | – |

The uncommitted edits record a real decision (**5 shops: Shopee ×3, Lazada ×1, TikTok Shop ×1; Zalo and Facebook are posting channels, not shops**). That decision is carried into the new plan (`data-model.md` §2.7, platforms as data). Proposed action A0 commits them first so the archive keeps the latest text.

## 2. Per-document review

### 2.1 `docs/PLAN.md`: old implementation plan (Supabase + n8n boss dashboard)
- **Covers:** architecture (dashboard ↔ Supabase ↔ n8n), key decisions D1–D11, stack, repo layout, phases Pre/0/1/2/3/4, runbook.
- **Implemented:** Pre-phase (docs). The **UI parts** of phases 0–4 exist on **mock data** (`src/lib/mock/*`): login (demo), Overview, Inbox, Tasks, Task detail, Start-work wizard, Library (simulated Drive), Team, Settings, GitHub Pages deploy workflow, lazy routes. **Not implemented:** everything backend: no `supabase/` folder, no migrations, no RLS, no real auth, no `commands` webhook, no Google OAuth, no n8n link.
- **Still relevant:** D1 (browser writes only commands), D5 (heartbeat → "team offline"), D6 (Drive-only media, read-only, token in memory), D7 (watchdog), D8 (HashRouter + base path), D9 (Vietnamese first, i18n keys), D10 (auth + RLS), runbook notes (Supabase pause, OAuth testing mode).
- **Conflicts with the vision:** a flat team of 7 fixed employees and 6 fixed workflows; the boss is the only approver; employees are enum keys; no departments, floors, hierarchy, queues, priorities, appearance, simulator or 3D. Phase order is backend-first; the new plan is visual-first with a simulator.
- **Classification:** **SUPERSEDE.** D1, D5–D10 are merged into `00-overview.md` §5 and `after-this-phase.md`. The runbook notes move to `after-this-phase.md` §6.

### 2.2 `docs/CONTRACT.md`: v0.2 dashboard ⇄ n8n contract
- **Covers:** who writes what, tables, enums, command payloads, `pg_net` delivery with Vault secret, `log_step` RPC, realtime publication, seed data, Drive media paths.
- **Implemented:** only as hand-written TS types (`src/lib/database.types.ts`) and the mock store. No SQL exists.
- **Still relevant:** the *pattern*: commands table with `pending → accepted → applied/failed`, idempotency of approvals ("already resolved via telegram"), service-role-only writes for operational state, one realtime channel, startup sweep of pending commands, Drive layout for media. The MVP-NOTES v0.3 proposals (`approvals.created_at`, payload shapes, `events.data.step_key`) are good ideas.
- **Conflicts:** `employees.key` enum (`thu|mai|…`), `owner_key` includes `boss`, workflow steps as the unit of work, single approval level, `shops.platform` enum, `emp_status` without departments or roles.
- **Classification:** **SUPERSEDE** by `contracts.md` (Office contract v1.0) and `data-model.md`. The command pattern, idempotency rule and Drive rules are merged. The n8n repo must be told the contract changed (question Q4).

### 2.3 `docs/EMPLOYEES.md`: the 7 AI employees and 6 workflows
- **Covers:** shared rules (one task at a time, logging every step, autonomy, approval gate, 2 retries, one question per task), the 7 personas (Thu, Mai, Linh, Hà, Vy, An, Bảo), the 6 workflows with steps.
- **Implemented:** as mock seed data and UI (Team page, workflow picker).
- **Still relevant:** the personas and names (continuity for the family; reused in the seed org, `data-model.md` §4), the shared rules (become domain policy: one active task per worker, `maxRetries: 2`, at most one question per task), the escalation list for chat (refund, complaints, money, legal → boss level, now an approval rule), the review-reply style rules (become simulator content and later worker skills).
- **Conflicts:** "No agent calls another agent" (the vision wants cross-department help requests and handoffs); a single QC employee (now leads + reviewers per department); fixed step pipelines with the boss as gate.
- **Classification:** **SUPERSEDE.** Personas → `src/content/org.seed.json` (P01); rules → `policy.json` + `approval-rules.json`; workflow definitions → `after-this-phase.md` §3 (department work).

### 2.4 `docs/LAYOUT.md`: screens and design direction
- **Covers:** design principles ("calm control room"), visual tokens (Be Vietnam Pro, warm neutrals, jade accent, status colours, per-employee tints), app shell, 8 screens, shared components.
- **Implemented:** fully, on mock data (tokens in `src/index.css`, all screens).
- **Still relevant:** tokens and principles (people first, one place for "needs you", progressive disclosure, live but quiet), app shell + mobile tab bar, Inbox/Task detail/Library screens (kept as "legacy" until P11; Library + Drive return after this phase).
- **Conflicts:** the home screen (cards grid) is replaced by the 3D building; per-employee tint tokens (`--emp-thu` …) are tied to 7 fixed keys, while employees are now data (tints move to a generated palette keyed by department, `data-model.md` §2.2).
- **Classification:** **MERGE then SUPERSEDE.** Tokens and principles are copied into `phase-01` §3.6 and `phase-05` (3D visual language) before archiving. Screen sketches stay in the archive for reference.

### 2.5 `docs/MVP-NOTES.md`: how the mock works
- **Covers:** the in-memory store, fake n8n, simulator tick (~9 s), demo controls, "swap points" for the real backend, i18n split per feature, query key convention, inbox deep links, v0.3 contract proposals.
- **Implemented:** yes; this describes the current code.
- **Still relevant:** the swap-point idea (now formalised as ports/adapters), i18n split per feature, query keys starting with table name, demo controls (team offline / reconnecting) → become simulator scenarios.
- **Conflicts:** the mock store is a second simulator with the old data model. Two simulators must not run at once (P01-T09 confines the legacy one to legacy routes; P11 removes it).
- **Classification:** **SUPERSEDE.** Lessons merged into `contracts.md` §1 and `phase-03`.

### 2.6 `docs/OPEN-QUESTIONS.md`
- **Open items:** real shop names; Zalo/Facebook role; which Google account connects to Drive.
- **Classification:** **SUPERSEDE.** Shop names → `questions-and-assumptions.md` (low impact, data). Zalo/Facebook → resolved by "platforms are data" (both are platform rows; whether they are shops or channels is a field). Drive account → `after-this-phase.md` §6.

### 2.7 `AGENTS.md` and `CLAUDE.md`
- **Still relevant:** hard rules 1, 2, 4, 5, 6, 7, 8, 10; coding conventions; definition of done; working process.
- **Conflicts:** "What this repo is" (boss dashboard over n8n) and "Read before working" (old docs); rule 3 needs the config-write amendment (`contracts.md` §5); rule 9 (seed via migrations) now applies from P09 only; stack list lacks three/R3F/zustand/zod/Playwright; repo layout is outdated.
- **Classification:** **KEEP, rewrite sections.** A one-line banner pointing to `docs/plan/` was added on 2026-11-10 (no other change). The full rewrite is P00-T05, after approval.

### 2.8 `.herdr-tasks/` (local, git-ignored)
- Briefs and reports from the agents that built the MVP UI. The audit report's issues were fixed in commit `93cc9cc`.
- **Classification:** **DISCARD** (local scratch, not in git). No git action. Optional: delete the folder locally.

### 2.9 Code comments promising later work
- `api.ts`, `commands.ts`, `RealtimeProvider.tsx`, `auth.tsx`, `database.types.ts`, `mock/store.ts` say "Later: supabase…".
- **Classification:** **SUPERSEDE.** They describe the legacy screens' backend swap. The new path is `src/ports` + `src/adapters/supabase` (P09). P11-T07 deletes these files together with the legacy screens.

### 2.10 Branch `feat/mvp-ui`
- Identical to `main`. **DISCARD:** delete local and remote branch (A6).

## 3. Code that stays, changes or goes

| Code | Fate | When |
|---|---|---|
| `src/index.css` tokens, `src/components/ui/*`, `src/components/{StatusPill,TimeAgo,EmptyState,PageHeader,LiveBadge,CommandButton}` | **Keep** and reuse in new 2D screens | – |
| `src/i18n/*` (per-feature split) | **Keep**, extend | P01+ |
| `src/lib/time.ts`, `src/lib/utils.ts` | **Keep** | – |
| `src/app/{AppLayout,router,providers}` | **Change**: new nav (Văn phòng, Sơ đồ, Duyệt, Hoạt động, Tủ đồ, Quản trị), legacy group | P01, P11 |
| `src/app/auth.tsx` | **Replace** by `AuthPort` + `LocalAuth` (P08b) + `SupabaseAuth` (P09) | P08b, P09 |
| `src/app/drive.tsx`, `src/lib/drive.ts`, Library | **Keep frozen** (needed after this phase for media) | – |
| `src/lib/mock/*`, `src/lib/api.ts`, `src/lib/commands.ts`, `src/hooks/queries.ts`, `src/app/RealtimeProvider.tsx`, legacy features (overview, inbox, tasks, start, team) | **Legacy**: keep running in a "Bản cũ" nav group, simulator confined to legacy routes; **delete** in P11 once org/queue/activity cover them | P01, P11 |
| `.github/workflows/deploy.yml` | **Keep**; add `ci.yml` for PRs | P01 |

## 4. Proposed actions (awaiting approval)

| # | Action | Command / detail |
|---|---|---|
| A0 | Commit your pending doc edits (5 shops) on `main` first, so the archive holds the latest text | `git add AGENTS.md docs/*.md && git commit -m "docs: 5 shops on 3 marketplaces"` (or tell me to fold them into P00) |
| A1 | Create `docs/archive/` and **move** `PLAN.md`, `CONTRACT.md`, `EMPLOYEES.md`, `LAYOUT.md`, `MVP-NOTES.md`, `OPEN-QUESTIONS.md` there with `git mv` | Each file gets a first line: `> **Superseded by docs/plan/** (2026-11-10). Kept for history. Do not implement from this file.` |
| A2 | Before A1, copy LAYOUT tokens/principles into the plan (already done in `phase-01` §3.6 and `phase-05` §3) | – |
| A3 | Rewrite `AGENTS.md`: new "What this repo is", "Read before working: docs/plan/ only", rule 3 amendment, stack, layout, DoD pointer to `00-overview.md` §6 | P00-T05 |
| A4 | Update `CLAUDE.md`: point at `docs/plan/`; replace the n8n note with "work that belongs to real AI workers is out of scope until after-this-phase.md" | P00-T05 |
| A5 | Add `README.md` (none exists): one paragraph + "The current plan is `docs/plan/`. Everything in `docs/archive/` is history." | P00-T05 |
| A6 | Delete merged branch `feat/mvp-ui` (local + origin) | `git branch -d feat/mvp-ui && git push origin --delete feat/mvp-ui` |
| A7 | Optional: delete local `.herdr-tasks/` | not tracked; your call |

After approval, A0–A6 land as the second commit set of the P00 PR (`phase-00-plan.md`).

## 5. Approval

**Approved on 2026-11-10** by the boss ("answer the assumptions and questions yourself… finish planning and setting up everything"). A0–A6 are carried out in the P00 PR. A7 (local `.herdr-tasks/`) is left alone: it is git-ignored and harmless.
