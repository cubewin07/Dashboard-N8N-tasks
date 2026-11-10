# P10: Boss controls (edit the company as data)

## 1. Goal and demo
Give the boss a simple "Quản trị" area where everything about the organisation is editable without code: departments, roles, specialties, employees, caps and policy, approval rules, platforms and shops. Edits apply live to the 2D screens and the 3D building, and the simulator follows the new rules.

**Demo after merge:** dad opens Quản trị → Phòng ban → "Thêm phòng ban", types "Kho vận", saves. In the building a new floor slides in under the leisure floor, with empty desks. He hires a department manager and two workers; they walk in through the lobby and ride up. He lowers "Số nhân viên tạm tối đa" from 10 to 4; the longest-idle temps pack up and leave. He opens "Quy tắc duyệt", tests a sample task ("Hoàn tiền 500.000đ cho khách") and sees "Cần: Sếp duyệt, vì quy tắc *Việc nhạy cảm*".

## 2. Requirements
- **R1** `#/admin` exists, is visible and reachable only for role `boss` (router guard + nav), and works at 375 px.
- **R2** Departments: create, rename, reorder, change colour/icon/hours, deactivate. Deactivation is refused while the department has active staff. A new or reordered department changes the building within 1 s, no reload; the boss floor stays on top.
- **R3** Roles: create custom roles, edit label, capabilities, model tier, max per department, workspace. Built-in roles (`owner`, `manager`, `dept_manager`, `lead`, `reviewer`, `worker`) cannot be deleted, and their `scope` and `humanOwner` cannot change.
- **R4** Specialties: create, rename, set home department. A specialty in use cannot be deleted (it can be renamed).
- **R5** Employees: hire (core or temp), rename, move department, change role / specialties / review mode / model tier override, dismiss (= archive), restore from the archive with the look kept. An archive list shows who, when, why.
- **R6** Policy form edits every field of `Policy` (`data-model.md` §2.5) with units, ranges and a "Mặc định" reset per field.
- **R7** Approval rules: ordered list with enable/disable, create/edit/delete, a condition builder (tags, task types, platforms, departments, amount ≥, cross-department) and a level picker.
- **R8** Rule tester ("Thử quy tắc"): for a sample task (type or free tags, platform, amount, cross-department) it shows the required level, the matched rule ids/labels and the chain of approvers, using the **same** `domain/rules.ts` function the engine uses, against the unsaved draft rules.
- **R9** Platforms and shops: edit label, badge text/colour, kind, active; add/rename shops. Inactive platforms disappear from new simulated tasks and from pickers.
- **R10** Every save validates the whole resulting config with `validateConfig()` (zod + invariants, §3.3). Invalid changes are refused with a Vietnamese message naming the broken rule; nothing is partially saved.
- **R11** `ConfigSource.apply(change)` works in both adapters: Local (localStorage overrides) and Supabase (RPCs from P09). On RPC failure the optimistic change is rolled back and an error toast shows.
- **R12** `SimFeed` reacts to `config.changed`: new departments receive simulated work, removed/archived people stop receiving work, the staffing cap and help/priority/approval policy take effect for new decisions without restarting.
- **R13** History ("Nhật ký thay đổi"): lists config changes with who, when, what, before → after. Supabase mode reads `config_audit`; Local mode reads a local ring buffer of the last 200 changes.
- **R14** Export the full config as one JSON file; import it back (validated, with a diff summary before applying); "Khôi phục mặc định" resets to the seed after a typed confirmation.
- **R15** Stylist can do none of the above (UI hidden, `apply` rejects by role locally, RPC rejects in Supabase).
- **R16** No hard-coded strings; all labels of data-defined things are edited as `{vi, en}` pairs (en optional, falls back to vi).

## 3. Specs
### 3.1 `ConfigChange` (completes the type declared in P01; `src/domain/configChange.ts`)
```ts
type ConfigChange =
  | { kind: 'department.upsert'; department: Department }
  | { kind: 'department.reorder'; ids: string[] }
  | { kind: 'role.upsert'; role: RoleDef } | { kind: 'role.delete'; key: string }
  | { kind: 'specialty.upsert'; specialty: Specialty } | { kind: 'specialty.delete'; key: string }
  | { kind: 'employee.upsert'; employee: Employee }
  | { kind: 'employee.archive'; id: string; reason: 'dismissed' | 'cap' }
  | { kind: 'employee.restore'; id: string }
  | { kind: 'policy.set'; policy: Policy }
  | { kind: 'rule.upsert'; rule: ApprovalRule } | { kind: 'rule.delete'; id: string }
  | { kind: 'rule.reorder'; ids: string[] }
  | { kind: 'platform.upsert'; platform: Platform } | { kind: 'shop.upsert'; shop: Shop }
  | { kind: 'taskType.upsert'; taskType: TaskType }
  | { kind: 'config.replace'; config: OrgConfig }          // import / reset; boss only, typed confirm
```
- Pure function `applyConfigChange(config, change) → OrgConfig` in the domain (used by Local adapter, optimistic UI and the reducer's `config.changed` handler).
- Supabase mapping: one RPC per change kind (table in `phase-09` §3.3). `config.replace` runs the upserts in one new RPC `replace_config(p jsonb)` (migration `0006_replace_config.sql`) so it is atomic.
- Role deletion is local-only for custom roles with zero holders; in Supabase it is `delete_role(p_key)` added in 0006 with the same check.

### 3.2 Hiring and dismissing: config vs runtime
Two paths end in the same state, and both must work:
1. **Boss edits staff in Quản trị** → `ConfigChange employee.upsert/archive` through `ConfigSource`. `SimFeed` sees `config.changed` and emits `staff.hired` / `staff.archived` so the character walks in or out.
2. **Boss or the simulated manager hires through the office** (`staff.hire` command, P03) → the feed applies cap logic (`domain/staffing.ts`) and then calls the same `ConfigSource.apply`, so the new person is persisted.
The feed deduplicates by employee id so one hire never produces two arrivals. Cap logic (unchanged from P03): under cap → hire; at cap → archive the longest-idle temp idle ≥ `minIdleMinutesBeforeDrop`; none eligible → boss-level approval (`hire_over_cap`), which is implicit when the boss issued it from Quản trị. Lowering `tempCap` below the current count archives idle temps (longest idle first) as they become eligible; busy temps finish their task first.

### 3.3 `validateConfig(config) → Issue[]` (`src/domain/validateConfig.ts`)
Zod shape first, then invariants:
1. Exactly one active employee whose role has `scope: 'building'` and `assignTasks` (the Manager).
2. At least one active `humanOwner` employee.
3. Per active department: ≤ `maxPerDepartment` holders for each role (1 dept manager, 1 lead by seed); warnings (not errors) for a department with no dept manager, no lead or no reviewer ("việc cần duyệt sẽ dồn lên cấp trên").
4. Unique ids and keys; keys match `^[a-z][a-z0-9_]*$` and never change once created.
5. Every reference resolves: employee → department/role/specialties; rule → task types/tags/platforms/departments; shop → platform; task type → department/specialty.
6. For each `ApprovalLevel` there is a way to reach an approver (some role has `approveLevel` = that level).
7. Policy ranges: `tempCap` 0–50; `help.maxRounds` 1–5; `help.timeoutMinutes` 5–480; weights strictly ordered urgent > high > normal > low; `agingCapPoints` < `weights.high − weights.low`+ so low never passes urgent; `questionSeatThreshold` 1–10.
8. The building stack never lists the boss floor (layout appends it); no edit path can move it.
Issues carry `{ level: 'error' | 'warning', code, path, params }`; messages come from i18n by `code`.

### 3.4 Simulator reaction (`src/adapters/sim/`)
- On `config.changed`: rebuild indexes (people by department/specialty, task types by department), keep running tasks untouched.
- **Unknown department** (no `task_types` rows): use the generic set `src/adapters/sim/content/vi/generic.ts` (8 templates such as "Soạn báo cáo tuần", "Cập nhật bảng theo dõi", "Trả lời yêu cầu nội bộ", "Kiểm tra số liệu") with tags `routine_draft` / `internal_note`, so a new floor is alive immediately.
- Department without approvers: reviews escalate to the next level that exists (same rule as the engine's chain, tested in P03).
- Archived person with a running task: the task goes back to `queued` and is reassigned (`task.handed_off`).

### 3.5 Screens (`src/features/admin/`)
```
AdminPage            tabs: Phòng ban · Nhân sự · Vai trò · Chuyên môn · Chính sách · Quy tắc duyệt · Nền tảng · Nhật ký · Sao lưu
DepartmentsTab       sortable list (drag + up/down buttons for keyboard), editor sheet
PeopleTab            table (desktop) / cards (phone): filters by department, role, kind, state; editor sheet;
                     "Xem trong văn phòng" → follow camera; "Đổi diện mạo" → #/wardrobe?employee=…
RolesTab             capability checkboxes with one-line explanations; built-ins show a lock
PolicyTab            grouped form: Nhân sự tạm · Nhờ hỗ trợ · Ưu tiên · Duyệt · Lịch làm việc
RulesTab             ordered list + RuleEditor (condition builder) + RuleTester side panel
PlatformsTab         platforms + shops
HistoryTab           audit list with before/after diff (JSON diff, collapsed)
BackupTab            export · import (diff summary) · reset to seed
```
All forms: draft state local to the sheet, "Lưu" disabled until valid and dirty, validation issues inline, `CommandButton`-style states (đang lưu → đã lưu / lỗi). Reuses existing shadcn components; adds `Table`, `Popover`, `Command` (combobox) from shadcn if missing.

## 4. Design choices
| # | Topic | Options | Choice | Reason | Revisit if |
|---|---|---|---|---|---|
| D1 | Change granularity | whole-config replace on every save · typed `ConfigChange` union | **Typed union** (+ `config.replace` for import/reset) | Small audited writes, clear RPC mapping, concurrent edits to different entities don't clobber each other | The union grows past ~30 kinds → generic `entity.upsert` |
| D2 | Validation place | SQL constraints · client zod + invariants · both | **Client is authoritative for invariants; SQL keeps cheap checks** | Cross-entity invariants are painful in SQL; only the boss can write, so the threat is mistakes, not attacks | Real workers start writing config → move invariants into RPCs |
| D3 | Rule matching model | first match wins · strictest match wins | **Strictest wins** (from `data-model.md` §2.6) | Order then only affects display; a new lenient rule can never weaken a strict one | Boss needs exceptions ("except for shop X") → add `unless` conditions |
| D4 | Optimistic UI | wait for server · optimistic + rollback | **Optimistic + rollback** | The building should react instantly on the Mac Studio; realtime confirms | Rollbacks confuse users → wait for ack |
| D5 | Deleting things | hard delete · deactivate/archive | **Archive/deactivate** for departments, employees, platforms; hard delete only rules and unused custom roles/specialties | History, looks and future audit keep referring to them | – |
| D6 | Editing task types | full editor · read-only list + JSON import | **Read-only list now**, editable through import | Task types are the worker vocabulary and will be shaped by real intake later | Boss asks to add task kinds by hand |
| D7 | Local-mode audit | none · ring buffer | **Ring buffer (200)** | The History tab works in the no-backend demo | – |
| D8 | Floor templates and wardrobe catalogue | editable here · developer data | **Not editable here** | They are tied to art assets; out of "starting simple" | Boss wants to rearrange furniture → a layout editor is its own phase |

## 5. Tasks
- [ ] **P10-T01** `ConfigChange` union + `applyConfigChange` + tests. *Files:* `src/domain/configChange.ts`, `src/domain/configChange.test.ts`, `contracts.md`. *Acceptance:* one test per kind; applying a change never mutates the input; contract bumped to v1.2.
- [ ] **P10-T02** `validateConfig` + invariants + i18n codes. *Files:* `src/domain/validateConfig.ts`, tests, `src/i18n/{vi,en}/admin.ts`. *Acceptance:* each invariant in §3.3 has a failing-case and passing-case test; the seed config yields zero errors.
- [ ] **P10-T03** `LocalConfigSource.apply` + local audit buffer. *Files:* `src/adapters/local/LocalConfigSource.ts`, tests. *Acceptance:* role check (stylist → `ConfigError('forbidden')`), validate-then-save, subscribers notified, survives reload, reset clears overrides.
- [ ] **P10-T04** ∥ `SupabaseConfigSource.apply` + migration `0006_replace_config.sql` (`replace_config`, `delete_role`) + pgTAP additions. *Files:* `src/adapters/supabase/SupabaseConfigSource.ts`, `supabase/migrations/0006_*.sql`, `supabase/tests/07_replace_config.sql`. *Acceptance:* mapping test (each kind → expected RPC + args with a mocked client); optimistic rollback test; stylist rejected.
- [ ] **P10-T05** Admin shell + guard + nav. *Files:* `src/features/admin/AdminPage.tsx`, `src/app/router.tsx`, `src/app/AppLayout.tsx`, i18n. *Acceptance:* R1, R15; E2E: stylist session visiting `#/admin` is redirected.
- [ ] **P10-T06** ∥ Departments tab. *Acceptance:* R2; E2E adds a department and asserts a new floor label appears in the org list and (desktop) the floor count in the scene debug hook `window.__office_debug.floors()` increases; deactivation with staff shows the refusal message.
- [ ] **P10-T07** ∥ People tab (hire, edit, move, dismiss, restore, archive list). *Acceptance:* R5; restoring an archived temp brings back the same appearance doc; moving a person changes their desk on the new floor without reload.
- [ ] **P10-T08** ∥ Roles + specialties tabs. *Acceptance:* R3, R4; built-in role delete button absent; a custom role with `approveLevel: 'reviewer'` starts receiving reviews in the sim.
- [ ] **P10-T09** ∥ Policy tab. *Acceptance:* R6; changing `tempCap` to a lower value makes the sim archive idle temps (unit test on staffing with edited policy + manual check).
- [ ] **P10-T10** ∥ Rules tab + condition builder. *Acceptance:* R7; reorder persists; disabled rule is ignored by the engine (unit test already in P03, UI test here).
- [ ] **P10-T11** Rule tester. *Files:* `src/features/admin/RuleTester.tsx`, `src/domain/rules.ts` (export `explainLevel`). *Acceptance:* R8; fixtures: refund task → boss via `boss_sensitive`; FAQ reply → reviewer; untagged → default `dept_manager`; results update as the draft rule changes before saving.
- [ ] **P10-T12** ∥ Platforms + shops tab. *Acceptance:* R9; deactivating `lazada` removes its badge from new sim tasks within one sim hour.
- [ ] **P10-T13** Simulator reaction to config changes + generic task set + hire/dismiss dedupe. *Files:* `src/adapters/sim/brain/*`, `src/adapters/sim/content/vi/generic.ts`, tests. *Acceptance:* R12; seeded test: add department + 3 staff → within 2 sim hours at least one task is created, reviewed and completed there; archived assignee's task is reassigned; one hire → exactly one `staff.hired`.
- [ ] **P10-T14** History tab. *Acceptance:* R13 in both modes; entries show actor display name, entity, action and a readable diff.
- [ ] **P10-T15** Backup tab: export / import / reset. *Acceptance:* R14; export → reset → import round-trips to a deep-equal config; importing an invalid file shows issues and applies nothing.
- [ ] **P10-T16** Phone pass + a11y + copy. *Acceptance:* all tabs usable at 375 px (cards instead of tables, sheets full-screen); keyboard-only run through "add department → hire → edit rule"; Playwright 375 px screenshots attached.

## 6. Dependencies
- **Needs:** P01 (`ConfigSource`, config schema), P02 (layout rebuild from config), P03 (rules/staffing/priority engine, `SimFeed`, `staff.*` and `config.changed` events), P04 (arrival/leave trips), P08b (roles in `AuthPort`), P09 (RPCs, `config_audit`).
- **Later phases rely on:** P11 (settings links, demo tour uses "add a department"). After this phase: the same config tables and `validateConfig` are what real workers read; the rule tester becomes the place to explain real approval decisions.

## 7. Branch and PR
- Branch `stack/p10-boss-controls` from `stack/p09-supabase`. PR base `stack/p09-supabase`. Title: `[P10] Boss controls: edit departments, people, roles, caps and approval rules`.
- If the diff passes ~2 500 lines, split: `stack/p10a-config-core` (T01–T05, T13) and `stack/p10b-admin-screens` (the tabs); record the split in §4.
- Description template:
```md
<stack map>
## What
Quản trị (boss only): departments, people, roles, specialties, policy, approval rules + tester, platforms, history, backup.
Edits apply live to 2D, 3D and the simulator. Works in Local and Supabase modes.
## How to test (5 min)
1. Add department "Kho vận" → new floor. 2. Hire 3 people → they arrive. 3. Lower temp cap → idle temps leave.
4. Thử quy tắc with a refund task → Sếp duyệt. 5. Export, reset, import.
## Contract
office-contract v1.2 (ConfigChange union, replace_config/delete_role RPCs)
## Screens
<desktop + 375px screenshots>
```

## 8. Review checklist
- [ ] No component computes approval level, cap or validity itself; all go through `domain/*`.
- [ ] `validateConfig` runs on every path into `apply` (forms, import, reset), in both adapters.
- [ ] Built-in roles and the boss-floor rule cannot be broken through any form or import.
- [ ] Nothing is hard-deleted that history or looks refer to.
- [ ] Optimistic updates roll back on failure; no stuck "đang lưu".
- [ ] The simulator has no import from `features/admin`; it reacts only to `config.changed`.
- [ ] Scene rebuild after a config change does not reset the camera or teleport unaffected people.
- [ ] Stylist blocked at UI, adapter and RPC level.
- [ ] All new strings in `vi` and `en`; data labels editable as `{vi, en}`.
- [ ] 375 px screenshots show no horizontal scroll.

## 9. Risks and open questions
- **Scope.** Nine tabs is a lot; the split in §7 is the release valve. The must-haves for the demo are departments, people, policy cap and the rule tester.
- **Layout churn.** Reordering departments moves whole floors; people mid-trip need re-planning (director handles "floor index changed" by re-planning from the current position; verify in T06).
- **Concurrent boss edits** (dad and son at once): last write wins per entity; realtime shows the other's change. Acceptable for two users.
- **Custom roles with odd capability mixes** (e.g. approves boss level but is not an owner) are allowed by data; `validateConfig` warns. Open: should only owners ever hold `approveLevel: 'boss'`? Assumed yes as a warning, not an error.
- **Task type editing** is import-only (D6); ask the boss if that is enough.
