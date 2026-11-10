# Contracts

Version: **office-contract v1.0 (draft)**. This replaces `docs/CONTRACT.md` v0.2.
Any change to a port, event, command, config schema or appearance schema bumps the version (minor = additive, major = breaking) and adds a line to the changelog below. Zod schemas in `src/domain/{events,commands,config,appearance}.ts` are the executable form; this file is the readable form. A unit test (`contracts.test.ts`) fails if the `CONTRACT_VERSION` constant and this file's version differ.

### Changelog
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
  stop(): void
}

interface ConfigSource {
  load(): Promise<OrgConfig>                                  // validated with zod
  subscribe(cb: (cfg: OrgConfig) => void): () => void          // live config edits (P09 realtime)
  apply(change: ConfigChange): Promise<void>                    // role-checked (P10); throws ConfigError
}

interface AppearanceStore {
  get(employeeId: string): Promise<AppearanceV1 | null>         // null → generated default
  getAll(): Promise<Record<string, AppearanceV1>>
  save(employeeId: string, doc: AppearanceV1, expectedVersion: number): Promise<{ version: number }>
  subscribe(cb: (employeeId: string, doc: AppearanceV1) => void): () => void
}

interface AuthPort {
  session(): Session | null                                    // { userId, email, role: 'boss' | 'stylist', displayName }
  onChange(cb: (s: Session | null) => void): () => void
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
  sendPasswordReset(email: string): Promise<void>
}
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

## 6. Versioning and compatibility rules

1. Additive changes (new event type, new optional field, new config field with default) = minor bump. The reducer skips unknown types; zod schemas use `.passthrough()` on payloads for forward compatibility, `.strict()` on commands we send.
2. Breaking changes (rename, removed field, changed meaning) = major bump + a migration note + updating every adapter in the same PR.
3. Config JSON and appearance docs carry their own `v`/`schema` and a `migrate*()` function; old docs must load forever.
4. The future worker-service repo consumes this file. When it changes after P11, notify that repo (copy the changelog line into its tracking issue).
