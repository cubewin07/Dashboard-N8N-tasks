# Contracts

Version: **office-contract v1.4 (draft)**. This replaces `docs/CONTRACT.md` v0.2.
Any change to a port, event, command, config schema or appearance schema bumps the version (minor = additive, major = breaking) and adds a line to the changelog below. Zod schemas in `src/domain/{events,commands,config,appearance}.ts` are the executable form; this file is the readable form. A unit test (`contracts.test.ts`) fails if the `CONTRACT_VERSION` constant and this file's version differ.

### Changelog
- **v1.4 (2026-11-28, P11, additive):** optional `OfficeFeed.onIssue(cb)` reports events the feed dropped (`FeedIssue { kind: 'invalid_event', reason, eventId?, type? }`); the store subscribes before `start` and counts them for Settings → Giới thiệu → Chẩn đoán. Invalid events are never thrown to the UI. New feed kind for builds without a simulator: the `NullFeed` (`kind: 'replay'`, rejects every command with `no_feed`).
- **v1.3 (2026-11-26, P10, additive):** optional `OfficeFeed.reconfigure(config, change)`; `ConfigSource.apply(change)` and `history(limit)` now work (Local: localStorage overrides + a 200-row ring buffer; Supabase: one RPC per change kind); `ConfigChange` is complete (phase-10 §3.1). New RPCs in migration 0006: `reorder_departments(p_ids text[])`, `delete_role(p_key text)`, `delete_specialty(p_key text)`, `replace_config(p jsonb)` (boss only, one audit row; errcodes as §5.1 plus `23503` `role_in_use` / `specialty_in_use`, `P0002` `unknown_role` / `unknown_specialty`). Supersedes the v1.2 note that `SupabaseConfigSource.apply` throws until P10.
- **v1.2 (2026-11-26, P09, additive):** `AuthPort.updatePassword?(password)` (optional; the demo port has none) and `AuthError { code: 'invalid_credentials' | 'not_allowed' | 'network' | 'unknown' }`; the Supabase write RPCs and their error codes (§5.1). `ConfigSource.subscribe` now fires on realtime edits (Supabase); `SupabaseConfigSource.apply` throws `ConfigError('not_supported')` until P10.
- **v1.1 (2026-11-21, P08b, additive):** `AppearanceStore.getEntries()` returns saved looks with their versions (the editor needs the version for `save`); `save` rejects with `AppearanceConflictError { employeeId, current, currentVersion, expectedVersion }` on a version mismatch (unknown employee = version 0).
- **v1.0 (draft):** Ports (`OfficeFeed`, `ConfigSource`, `AppearanceStore`, `AuthPort`), event envelope + catalogue, commands, config/appearance write rule.

## 1. Ports (`src/ports/*.ts`, interfaces only)

```ts
interface OfficeFeed {
  readonly kind: 'sim' | 'supabase' | 'replay'
  /** Load the current state. The sim builds it from config; the real feed reads projections. */
  start(config: OrgConfig): Promise<OfficeSnapshot>          // { state: OfficeState, seq }
  /** Events after the snapshot, in order. Returns an unsubscribe. */
  subscribe(onEvents: (batch: OfficeEvent[]) => void): () => void
  /** UI → system. Resolves when accepted (not when applied). Result events follow via subscribe. */
  send(cmd: Command): Promise<CommandAck>                     // { commandId, status: 'accepted' | 'rejected', reason? }
  /** Feed clock (sim time now; wall time for the real system). */
  now(): Iso
  /** Connection to the source: 'live' | 'reconnecting' | 'offline'. Drives LiveBadge. */
  connection(): ConnectionState; onConnection(cb: (c: ConnectionState) => void): () => void
  reconfigure?(config: OrgConfig, change: ConfigChange | null): void   // v1.3
  /** Events dropped because they failed validation (never thrown to the UI). */
  onIssue?(cb: (issue: FeedIssue) => void): () => void                // v1.4
  stop(): void
}
// FeedIssue = { kind: 'invalid_event'; reason: string; eventId?: string | null; type?: string | null }

interface ConfigSource {
  load(): Promise<OrgConfig>                                  // validated with zod
  subscribe(cb: (cfg: OrgConfig) => void): () => void          // live config edits (P09 realtime)
  apply(change: ConfigChange): Promise<void>                    // role-checked (P10); throws ConfigError
}

interface AppearanceStore {
  get(employeeId: string): Promise<AppearanceV1 | null>         // null → generated default
  getAll(): Promise<Record<string, AppearanceV1>>
  getEntries(): Promise<Record<string, { doc: AppearanceV1; version: number }>>  // v1.1
  save(employeeId: string, doc: AppearanceV1, expectedVersion: number): Promise<{ version: number }>
                                                                // version mismatch → AppearanceConflictError (v1.1)
  subscribe(cb: (employeeId: string, doc: AppearanceV1) => void): () => void
}

interface AuthPort {
  session(): Session | null                                    // { userId, email, role: 'boss' | 'stylist', displayName }
  onChange(cb: (s: Session | null) => void): () => void
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
  sendPasswordReset(email: string): Promise<void>
  updatePassword?(password: string): Promise<void>             // v1.2; signed-in or recovery session
}
// signIn rejects with AuthError { code }: 'invalid_credentials' | 'not_allowed' (no app_users row) | 'network' | 'unknown' (v1.2)
```

Adapters and when they land:

| Port | Now | P09 | After this phase |
|---|---|---|---|
| `OfficeFeed` | `SimFeed` (P03) | `SimFeed` | `SupabaseFeed` (reads `office_events`, realtime) |
| `ConfigSource` | `LocalConfigSource` (P01) | `SupabaseConfigSource` | same |
| `AppearanceStore` | `LocalAppearanceStore` (P08b) | `SupabaseAppearanceStore` | same |
| `AuthPort` | `LocalAuth` demo accounts (P08b) | `SupabaseAuth` | same |

Selection lives in `src/office/feedRegistry.ts` and `src/office/configStore.ts`, driven by env: `VITE_FEED` (`static` until P03, then `sim` by default; see `00-overview.md` §7) and the presence of `VITE_SUPABASE_URL`. A replay feed (`ReplayFeed`, P03-T11) plays a recorded event log for tests and demos.

## 2. Events

### 2.1 Envelope
```ts
interface OfficeEvent<T extends EventType = EventType> {
  v: 1                                  // envelope version
  id: string                            // 'evt_' + ULID
  seq: number                           // strictly increasing per feed; reducer ignores seq ≤ state.seq (idempotent)
  at: Iso                               // feed time
  type: T
  actor: { kind: 'employee' | 'owner' | 'system' | 'customer'; id: string | null }
  causedBy: string | null               // command id or event id (for the activity feed "because …")
  payload: EventPayloads[T]
}
```
Rules:
- The reducer is `apply(state, event) → state`, pure and total: an event that references an unknown id is **logged and skipped**, never thrown (the real system may be ahead of our config).
- Unknown `type` → skipped with a warning (forward compatibility).
- Events are facts in past tense. Feeds never send derived state the reducer can compute.

### 2.2 Catalogue

| type | payload | state effect | visual consequence (director) |
|---|---|---|---|
| `intake.received` | `{messageId, channel, modality, fromUserId, text}` | add message | manager's phone rings / glows |
| `task.created` | `{task: Task}` (status `queued`) | add task | paper appears in manager's out-tray |
| `task.assigned` | `{taskId, assigneeId, byId}` | set assignee | assigner (or assignee) walks/rides to deliver if different floor |
| `task.started` | `{taskId}` | `in_progress`, person `working`, carrying from task type, platform badge | sits at desk, holds item, desk status "working" |
| `task.progressed` | `{taskId, progress}` | progress | desk progress ring |
| `task.handed_off` | `{taskId, fromId, toId, newTaskId?}` | reassign / child task | courier trip with document (elevator if cross-floor) |
| `task.reprioritised` | `{taskId, priority}` | priority | pile order changes |
| `task.blocked` | `{taskId, reason}` | `blocked` | red desk status, person waits at desk |
| `task.completed` | `{taskId}` | `done`, person freed | small done tick, then idle |
| `task.cancelled` / `task.failed` | `{taskId, reason}` | status | grey/red tick |
| `review.requested` | `{review: ReviewItem}` | add review, task `in_review` | worker carries paper to the approver's pile (rides if cross-floor), pile count +1 |
| `review.started` | `{reviewId}` | `in_review` | approver picks paper from pile, reads |
| `review.decided` | `{reviewId, decision: 'approved' \| 'changes_requested' \| 'rejected', note?}` | update review/task | paper to out-tray; changes → back to worker |
| `review.escalated` | `{reviewId, toLevel, newReview: ReviewItem}` | next level in chain | lead/reviewer carries paper up (elevator) |
| `question.asked` | `{question: Question}` | add question; asker `asking` | in person: walk to target; if busy → waiting seat |
| `question.answered` | `{questionId, answer}` | answered; asker back to `working` | short chat animation, return |
| `help.requested` | `{help: HelpRequest}` | add help; task `waiting_help` | asker visits helper's floor (elevator) |
| `help.accepted` / `help.answered` | `{helpId, byId}` | update | helper works briefly / hands back |
| `help.timed_out` / `help.escalated` | `{helpId, toId}` | round+1 or escalate | asker goes to dept manager |
| `person.activity` | `{employeeId, activity, locationHint?}` | set activity (idle, resting, off_shift, in_meeting) | director chooses idle behaviour |
| `staff.hired` | `{employee: Employee, appearance?: AppearanceV1}` | add to config + people | arrives through lobby, rides to department |
| `staff.archived` | `{employeeId, reason: 'cap' \| 'dismissed'}` | state archived | walks to elevator, rides to lobby, exits |
| `config.changed` | `{change: ConfigChange}` | update config snapshot | layout rebuild if floors/desks changed |
| `system.heartbeat` | `{source: 'sim' \| 'worker', version}` | last heartbeat | "team online" indicator |
| `sim.scenario` | `{key, label}` | log only | banner in sim panel (sim only; real feed never sends it) |

The full zod definitions, including every payload, are written in P01-T03 (types) and completed in P03-T01.

## 3. Commands (UI → feed)

```ts
interface Command<T extends CommandType = CommandType> {
  v: 1; id: string /* 'cmd_' + ULID */; type: T
  issuedBy: { userId: string; role: 'boss' | 'stylist' }; issuedAt: Iso /* wall time */
  payload: CommandPayloads[T]
}
```

| type | payload | allowed role | result events |
|---|---|---|---|
| `intake.submit` | `{text, modality: 'text'}` | boss | `intake.received`, then `task.created`… |
| `review.decide` | `{reviewId, decision, note?}` (boss-level only from UI) | boss | `review.decided` |
| `question.answer` | `{questionId, answer}` (questions addressed to an owner) | boss | `question.answered` |
| `task.set_priority` | `{taskId, priority}` | boss | `task.reprioritised` |
| `task.cancel` | `{taskId, reason?}` | boss | `task.cancelled` |
| `staff.hire` | `{departmentId, roleKey, specialties, name?}` | boss | `staff.hired` or a boss-level `review.requested` (over cap) |
| `staff.dismiss` | `{employeeId}` | boss | `staff.archived` |

Idempotency: a feed that sees the same `command.id` twice returns the first ack. A decision on an already-decided review returns `rejected: 'already_decided'` (carried over from CONTRACT v0.2).

`CommandButton` (existing) keeps its *sending → queued → applied / failed* states, driven by the ack plus the first result event whose `causedBy` equals the command id.

## 4. Simulator-only controls (not part of the contract)

The sim panel talks to `SimFeed` through its own API (`simControls`: speed, pause, seed, run scenario, team offline). These are **not** commands and never reach the real system. They live in `src/adapters/sim/` only.

## 5. Write rules (amends `AGENTS.md` rule 3)

| Data | How the browser writes it | Phase |
|---|---|---|
| Operational state (tasks, reviews, staffing, intake) | **Never directly.** `OfficeFeed.send(Command)`; the feed applies it | P03+ |
| Org config (departments, roles, employees, rules, policy, platforms) | Local: `LocalConfigSource.apply` → localStorage overrides. Supabase: role-checked `security definer` RPCs that also write `config_audit` | P10 (local first), P09 RPCs |
| Appearance | `AppearanceStore.save` → localStorage (P08b) → RPC `save_appearance` (P09), boss or stylist | P08b, P09 |
| Media | Never (Drive read-only, unchanged) | – |

Why config is not a command: commands are processed by the worker system, which does not exist yet, and config edits are owner edits that must work while the worker service is offline. When real workers arrive, they *read* config; they never write it except `staff.hired/archived`, which the manager AI triggers through the same RPC path with a service role (after-this-phase §2).

### 5.1 Supabase RPCs (P09 `0005_audit_and_rpcs.sql`, P10 `0006_replace_config.sql`)

All are `security definer`, `set search_path = public, pg_temp`, executable by `authenticated` only (never `anon`), and every successful call writes one `config_audit` row (`actor`, `action`, `target`, `before`, `after`). Tables have select policies only; there is no other write path.

| RPC | Args | Role | Notes |
|---|---|---|---|
| `save_appearance` | `p_employee_id text, p_doc jsonb, p_expected_version int` → `int` (new version) | boss, stylist | `p_expected_version = 0` creates; otherwise must equal the stored version |
| `upsert_department` · `upsert_role` · `upsert_specialty` · `upsert_platform` · `upsert_shop` · `upsert_task_type` · `upsert_employee` · `upsert_approval_rule` | `p jsonb` (the config row, same shape as `src/content`) | boss | insert or update by id/key |
| `set_policy` | `p jsonb` | boss | the single policy row |
| `archive_employee` / `restore_employee` | `p_id text` (+ `p_reason text` for archive) | boss | sets `state` |
| `delete_approval_rule` | `p_id text` | boss | |
| `reorder_approval_rules` | `p_ids text[]` | boss | must list every rule exactly once (stores 0-based `order`) |
| `reorder_departments` (0006) | `p_ids text[]` | boss | 1-based `order`; listed ids first, the rest keep their relative order |
| `delete_role` (0006) | `p_key text` | boss | refuses built-in roles (`22023`) and roles with any holder (`23503 role_in_use`) |
| `delete_specialty` (0006) | `p_key text` | boss | refuses a specialty used by an employee or task type (`23503 specialty_in_use`) |
| `replace_config` (0006) | `p jsonb` (the editable parts of `OrgConfig`) | boss | atomic import/reset; upserts every collection, never deletes departments, platforms or employees (archive instead), removes approval rules not in `p` and unused custom roles/specialties/shops/task types; one audit row (`config`, `*`, `replace`) |

Error codes (Postgres `errcode`, surfaced by supabase-js as `error.code`). From P10 `SupabaseConfigSource.apply` calls exactly one RPC per `ConfigChange` and maps errors as below (plus a failed fetch → `ConfigError('network')`, anything else → `'unknown'`):

| errcode | message | Meaning | Browser mapping |
|---|---|---|---|
| `42501` | `insufficient_privilege` | wrong role, or no `app_users` row | save fails (P10: `ConfigError('forbidden')`) |
| `22023` | `invalid_payload: …` / `invalid_doc: …` | missing key, wrong shape, doc not `v: 1` or too large | save fails (P10: `ConfigError('invalid')`) |
| `23503` | `unknown_employee` · `role_in_use` · `specialty_in_use` | missing reference, or a delete refused because the row is in use | save fails (P10: `unknown_*` → `ConfigError('not_found')`, other `23xxx` → `'invalid'`) |
| `P0001` | `version_conflict` | `p_expected_version` is stale | `AppearanceConflictError` with the server doc and version |
| `P0002` | `unknown_rule` · `unknown_role` · `unknown_specialty` | row does not exist | P10: `ConfigError('not_found')` |

## 6. Versioning and compatibility rules

1. Additive changes (new event type, new optional field, new config field with default) = minor bump. The reducer skips unknown types; zod schemas use `.passthrough()` on payloads for forward compatibility, `.strict()` on commands we send.
2. Breaking changes (rename, removed field, changed meaning) = major bump + a migration note + updating every adapter in the same PR.
3. Config JSON and appearance docs carry their own `v`/`schema` and a `migrate*()` function; old docs must load forever.
4. The future worker-service repo consumes this file. When it changes after P11, notify that repo (copy the changelog line into its tracking issue).
