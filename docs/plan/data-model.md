# Data model

Version: **office-model v1.0 (draft)**. Changing a shape here = bump the version in `contracts.md` and add a changelog line there.

Two kinds of data, kept strictly apart:

| Kind | What | Who edits | Where it lives |
|---|---|---|---|
| **Config** | Departments, roles, specialties, employees (identity), platforms, shops, task types, approval rules, policy, building/floor templates, wardrobe catalogue, appearance docs | Boss (org), stylist + boss (appearance), developers (templates, catalogue) | `src/content/*.json` (seed) → `LocalConfigSource` (localStorage overrides) → Supabase tables from P09 |
| **Runtime** | Tasks, reviews, questions, help requests, intake messages, employee activity, activity log | Only the feed (simulator now, real workers later), via `OfficeEvent`s | In memory (`OfficeState`) now; Supabase `office_events` + projections later (`after-this-phase.md`) |

TypeScript types live in `src/domain/*.ts`. Each config file has a zod schema in `src/domain/config.ts`, and `scripts/content-validate.mjs` validates all JSON in CI (P01-T06).

## 1. Shared primitives

```ts
type Label = { vi: string; en: string }            // data-defined names; UI chrome uses i18n instead
type Iso = string                                   // ISO-8601 UTC, feed time (sim time now)
type ApprovalLevel = 'reviewer' | 'dept_manager' | 'boss'   // ordered; compare with LEVEL_RANK
type Priority = 'urgent' | 'high' | 'normal' | 'low'
type ModelTier = 'strong' | 'standard' | 'cheap'
type Id<P extends string> = `${P}_${string}`        // e.g. emp_01JD…; seed rows may use readable ids (emp_thu)
```

## 2. Config entities

### 2.1 Department (`src/content/org.seed.json` → `departments[]`)
```ts
interface Department {
  id: Id<'dep'>; key: string            // 'cs', 'marketing' (stable slug)
  label: Label
  order: number                         // floor order among departments (bottom → top)
  colorSwatch: string                   // palette swatch key (palette.json), used for floor accents & idle tints
  icon: string                          // lucide icon name for 2D
  hours: 'office' | '24_7'              // 24/7 departments keep workers active at night
  floorTemplate: string                 // 'department' by default
  active: boolean
}
```
A department with more people than its floor template's desk capacity gets an **annex floor** right above it (`layout.annexes`). There is no floor limit.

### 2.2 Role (`src/content/roles.json`)
Roles are data. **Code depends on capabilities, never on role keys** (except the seed's display order).
```ts
interface RoleDef {
  key: string                           // 'manager' | 'dept_manager' | 'lead' | 'reviewer' | 'worker' | 'owner' | custom
  label: Label
  scope: 'building' | 'department'      // building: one for the whole company (manager, owner)
  caps: {
    assignTasks: boolean                // manager, dept_manager
    approveLevel: ApprovalLevel | null  // reviewer → 'reviewer', dept_manager → 'dept_manager', owner → 'boss'
    distributeReviews: boolean          // lead
    answerQuestions: boolean            // lead, dept_manager, manager
    doWork: boolean                     // worker, lead (light), reviewer (no)
    humanOwner: boolean                 // true only for 'owner' (boss avatars); never simulated as AI
  }
  modelTier: ModelTier                  // display now; real model routing later
  maxPerDepartment: number | null       // dept_manager: 1, lead: 1, others: null
  workspace: 'private_office' | 'review_desk' | 'desk' | 'boss_office' | 'manager_office'
  sortOrder: number
}
```

### 2.3 Specialty (`src/content/specialties.json`)
```ts
interface Specialty { key: string; label: Label; icon: string; homeDepartmentKey: string | null }
```
Seed keys: `customer_chat`, `review_reply`, `follow_up`, `copywriting`, `social_scheduling`, `ads`, `promotions`, `reporting`, `image`, `video`, `product_photo`, `invoicing`, `bookkeeping`, `tax`, `qc`.

### 2.4 Employee identity (`org.seed.json` → `employees[]`)
```ts
interface Employee {
  id: Id<'emp'>
  name: string                          // Vietnamese given name, e.g. 'Thu'
  departmentId: Id<'dep'> | null        // null = building-wide (manager, owners)
  roleKey: string
  specialties: string[]
  kind: 'core' | 'temp'                 // core is never auto-dropped
  state: 'active' | 'archived'
  reviewMode: 'always' | 'when_important'   // start: 'always' (told to ask), loosen later
  modelTierOverride: ModelTier | null
  bio: Label | null
  createdAt: Iso; createdBy: 'seed' | 'boss' | 'manager'
  archivedAt: Iso | null
}
```
Desk positions are **not** stored; the layout allocates slots deterministically (sorted by role sortOrder, then `createdAt`, then `id`).

### 2.5 Policy (`src/content/policy.json`, one object)
```ts
interface Policy {
  staffing: { tempCap: number /*10*/; dropOrder: 'longest_idle_first'; minIdleMinutesBeforeDrop: number /*60*/ }
  help: { timeoutMinutes: number /*30*/; maxRounds: number /*2*/; escalateTo: 'dept_manager' }
  priority: {
    weights: Record<Priority, number>   // urgent 400, high 300, normal 200, low 100
    agingPointsPerHour: number          // 20: a 'normal' item waiting 5 h ranks with a fresh 'high'
    agingCapPoints: number              // 150: aging never lifts low above high
  }
  approvals: {
    defaultLevel: ApprovalLevel         // 'dept_manager' (start strict)
    chain: 'every_level_up_to_required' | 'required_only'   // start: every level
    questionSeatThreshold: number       // 3: if the target has ≥3 open questions, askers sit in waiting seats
  }
  work: { oneActiveTaskPerWorker: true; maxRetries: 2; maxQuestionsPerTask: 1 }
  calendar: { timezone: 'Asia/Ho_Chi_Minh'; workStart: '08:00'; workEnd: '17:30'; lunch: ['12:00', '13:00'] }
}
```
Effective priority of a queued item = `weights[p] + min(agingCap, agingPointsPerHour × hoursWaiting)`. Ties → older first → lower id first. No queue length limit.

### 2.6 Approval rule (`src/content/approval-rules.json`)
```ts
interface ApprovalRule {
  id: string; order: number; enabled: boolean
  label: Label
  when: {                               // all present fields must match (AND); arrays are "any of"
    taskTypes?: string[]; tagsAny?: string[]; platformsAny?: string[]
    departmentsAny?: string[]; amountVndGte?: number; crossDepartment?: boolean
  }
  level: ApprovalLevel
}
```
**Evaluation (pure, `domain/rules.ts`):** collect enabled rules that match → required level = the **highest** level among matches; no match → `policy.approvals.defaultLevel`. Strictest wins, so adding a reviewer-level rule can never lower a boss-level match. The engine returns the matched rule ids so the UI can explain "why does this need the boss?".

Seed rules (start strict):

| id | when | level |
|---|---|---|
| `boss_sensitive` | tagsAny: `money, tax, legal, refund, angry_customer, irreversible, new_account, hire_over_cap` | boss |
| `boss_big_amount` | amountVndGte: 2 000 000 | boss |
| `dm_public` | tagsAny: `public_post, campaign` | dept_manager |
| `dm_cross_dept` | crossDepartment: true | dept_manager |
| `reviewer_routine` | tagsAny: `routine_draft, faq_reply, internal_note` | reviewer |
| (default) | – | dept_manager |

### 2.7 Platform and shop (`src/content/platforms.json`, `org.seed.json → shops[]`)
```ts
interface Platform {
  key: string                           // 'facebook','instagram','zalo_oa','zalo','tiktok','tiktok_business',
                                        // 'shopee','lazada','tiktok_shop' (seed: all 9, active: true)
  label: Label
  kind: 'marketplace' | 'social' | 'messaging'
  badge: { text: string; swatch: string } // placeholder badge, e.g. {text:'SP', swatch:'orange_500'}
  iconAsset: string | null              // later: real icon file
  active: boolean
}
interface Shop { id: Id<'shop'>; platformKey: string; name: string; handle: string | null }
```
Seed shops (decision from the old docs): Shopee 1/2/3, Lazada 1, TikTok Shop 1. Zalo OA and Facebook are platforms used for posting and chat, not shops.

### 2.8 Task type (`src/content/task-types.json`)
Shared vocabulary between the simulator now and real intake later.
```ts
interface TaskType {
  key: string                           // 'cs.reply_review', 'design.banner_set', 'acc.monthly_vat'
  departmentKey: string
  label: Label
  specialty: string                     // who can do it
  tags: string[]                        // drive approval rules
  defaultPriority: Priority
  durationMinutes: [number, number]     // sim time range for work
  platformKeys: string[]                // empty = no platform badge
  needsHelpFrom: string[]               // specialties often consulted (e.g. 'image' for a post)
  carries: 'document' | 'laptop' | 'phone' | 'tablet' | 'box' | 'camera'   // held item while working
}
```
P03 seeds ~40 task types across the 4 departments (list in `phase-03` §3.4).

### 2.9 Building and floor templates (`src/content/building.json`, `src/content/floor-templates/*.json`)
```ts
interface BuildingConfig {
  floorHeight: 4.0
  stack: Array<                         // bottom → top; departments expand in place
    | { kind: 'fixed'; key: 'lobby_cafe' | 'games_rest' | 'management'; template: string }
    | { kind: 'departments' }            // one floor (+annexes) per active department, by order
  >                                      // the boss floor is NOT listed: layout always appends it on top
  elevator: { cars: number /*2*/; speedFloorsPerSec: number; doorSeconds: number; capacity: number }
}
interface FloorTemplate {
  key: string; size: { w: number; d: number }   // metres; department floors 24 × 14 by default
  gridCell: 0.5                                 // nav grid resolution
  fixedSlots: Slot[]                            // elevator doors, stairs, rooms, decor, idle spots
  deskArea?: { rect: Rect; cluster: { cols: 2; rows: 2 }; spacing: number; capacity: number /*16*/ }
  walls: WallSegment[]                          // front (−Z) side is always open (cutaway)
}
interface Slot {
  id: string; type: SlotType; x: number; z: number; rotY: number
  roleHint?: string; capacity?: number          // e.g. waiting bench seats 4
}
type SlotType =
  | 'desk' | 'review_desk' | 'private_office' | 'manager_office' | 'boss_desk' | 'pile_anchor'
  | 'waiting_seat' | 'elevator_door' | 'stairs_entry' | 'meeting_table'
  | 'idle_sofa' | 'idle_coffee' | 'idle_tea_table' | 'idle_water' | 'idle_window' | 'idle_chat'
  | 'idle_pingpong' | 'idle_arcade' | 'idle_boardgame' | 'idle_karaoke' | 'idle_bed' | 'idle_massage_chair'
  | 'decor' | 'cat_spot'
```
Default stack: `lobby_cafe` (ground) → departments → `games_rest` → `management` → **boss (always top, appended by code)**.

### 2.10 Wardrobe catalogue (`src/content/catalog/*.json`, one file per slot)
```ts
type WardrobeSlot =
  | 'hair' | 'eyes' | 'brows' | 'mouth' | 'facial_hair'
  | 'top' | 'bottom' | 'fullbody' | 'outer' | 'shoes'
  | 'head' | 'glasses' | 'ears' | 'neck' | 'wrist' | 'bag'
interface CatalogItem {
  id: string                            // 'top_tshirt_crew_01'
  slot: WardrobeSlot
  label: Label
  bases: Array<'female' | 'male'>       // which base bodies the item fits (most: both)
  model: Partial<Record<'female' | 'male', string>> | null
                                        // per-base fitted GLBs, e.g. {female:'models/wardrobe/top_tshirt_crew_01_f.glb', male:'…_m.glb'};
                                        // rigid accessories may point both keys at one file; null for texture-only face parts
  faceTile?: { atlas: 'face'; cell: [number, number] }   // eyes/brows/mouth are atlas cells, not meshes
  thumb: string                         // 'thumbs/top_tshirt_crew_01.webp'
  attach: 'skinned' | { bone: 'Head' | 'Neck' | 'Spine2' | 'LeftHand' | 'RightHand' | 'LeftForeArm' }
  tint: { regions: Array<'primary' | 'secondary' | 'accent'>; defaults: Record<string, string> } | null
  hides: WardrobeSlot[]                 // fullbody hides top+bottom; hats may hide hair 'top' variant
  requires?: WardrobeSlot[]
  bodyLimits?: Partial<Record<BodyKey, [number, number]>>   // narrows sliders while worn
  tags: string[]                        // 'office', 'casual', 'traditional', 'sport', 'party', 'winter'
  credit: string                        // key into public/assets/credits.json
}
```
Colours come from `src/content/catalog/colors.json` (named swatches for hair, skin, fabrics). Adding an item = GLB + thumb + JSON row; `scripts/catalog-validate.mjs` checks files exist, ids are unique, slots valid, credit present.

### 2.11 Appearance doc (one per employee, including owners)
```ts
type BodyKey = 'height' | 'build' | 'muscle' | 'chest' | 'hips' | 'shoulders'
interface AppearanceV1 {
  v: 1
  base: 'female' | 'male'               // separate base bodies (decided); shared skeleton; changing base keeps items that support the new base, others fall back to slot defaults
  body: Record<BodyKey, number>         // each 0..1 in the doc; mapped to safe ranges by the character system
                                        // height → scale 0.92–1.08; build → morph 'Heavy' −0.6..0.8 (slim..heavy)
  skin: string                          // swatch key 'skin_01'…'skin_08'
  face: { eyes: string; brows: string; mouth: string; eyeColor: string; facialHair: string | null; blush: boolean }
  hair: { item: string | null; color: string }
  outfit: { top: string | null; bottom: string | null; fullbody: string | null; outer: string | null; shoes: string | null }
  accessories: Partial<Record<'head' | 'glasses' | 'ears' | 'neck' | 'wrist' | 'bag', string>>
  colors: Record<string /*itemId*/, Partial<Record<'primary' | 'secondary' | 'accent', string>>>
  updatedAt: Iso; updatedBy: string     // user id or 'seed' or 'generator'
}
```
- **Default looks:** `generateAppearance(employeeId)` (seeded by id) produces a plausible varied look, so new hires never look identical. Stored only once someone edits it.
- **Versioning:** `migrateAppearance(doc: unknown): AppearanceV1` upgrades old versions; unknown item ids fall back to the slot default with a console warning, so removing a catalogue item never breaks a character.

## 3. Runtime entities (`OfficeState`, built only by the event reducer)

```ts
interface OfficeState {
  schema: 1
  now: Iso                                         // feed time of the last event
  config: OrgConfig                                // snapshot of config the feed is using
  people: Record<EmployeeId, PersonRuntime>
  tasks: Record<TaskId, Task>
  reviews: Record<ReviewId, ReviewItem>
  questions: Record<QuestionId, Question>
  help: Record<HelpId, HelpRequest>
  messages: Record<MessageId, IntakeMessage>
  log: OfficeEvent[]                               // ring buffer, last 500, newest last
  seq: number                                      // last applied event sequence
}

interface PersonRuntime {
  employeeId: EmployeeId
  activity: 'idle' | 'working' | 'reviewing' | 'delivering' | 'asking' | 'waiting_answer'
          | 'helping' | 'in_meeting' | 'resting' | 'off_shift'
  taskId: TaskId | null
  carrying: TaskType['carries'] | null
  platformKey: string | null                       // shown as badge while working on a platform task
  idleSince: Iso | null; lastActiveAt: Iso
  location: { floorKey: string; target: 'desk' | 'office' | 'elevator' | 'waiting_seat' | 'other' } | null
                                                   // a HINT from the feed (e.g. "went to dept_manager's office");
                                                   // the director decides the exact path
}

interface Task {
  id: TaskId; typeKey: string; title: string; detail: string | null
  departmentId: DepartmentId; assigneeId: EmployeeId | null
  requestedBy: { kind: 'boss' | 'manager' | 'employee' | 'schedule' | 'customer'; id: string | null }
  channel: 'telegram' | 'app' | 'schedule' | 'internal' | 'platform'
  platformKey: string | null; shopId: string | null; amountVnd: number | null
  tags: string[]; priority: Priority; createdAt: Iso; startedAt: Iso | null; finishedAt: Iso | null
  status: 'queued' | 'in_progress' | 'in_review' | 'waiting_help' | 'waiting_answer'
        | 'blocked' | 'done' | 'cancelled' | 'failed'
  progress: number                                 // 0..1, for the desk progress ring
  requiredLevel: ApprovalLevel                     // from the rule engine at creation (re-evaluated on change)
  matchedRuleIds: string[]
  parentTaskId: TaskId | null                      // handoff chain
  attempts: number
}

interface ReviewItem {                             // one paper on a desk pile
  id: ReviewId; taskId: TaskId; level: ApprovalLevel
  assigneeId: EmployeeId                           // reviewer, dept manager, or an owner avatar for 'boss'
  status: 'pending' | 'in_review' | 'approved' | 'changes_requested' | 'rejected'
  priority: Priority; createdAt: Iso; decidedAt: Iso | null; decidedBy: string | null; note: string | null
}
interface Question {
  id: QuestionId; taskId: TaskId; fromId: EmployeeId; toId: EmployeeId; text: string
  status: 'open' | 'answered' | 'expired'; inPerson: boolean    // inPerson = asker sits in a waiting seat
  createdAt: Iso; answeredAt: Iso | null
}
interface HelpRequest {
  id: HelpId; taskId: TaskId; fromId: EmployeeId; specialty: string; toId: EmployeeId | null
  round: number; status: 'open' | 'accepted' | 'answered' | 'timed_out' | 'escalated'
  createdAt: Iso; timeoutAt: Iso
}
interface IntakeMessage {
  id: MessageId; channel: 'telegram' | 'app'; modality: 'text' | 'voice'
  fromUserId: string; text: string; at: Iso; taskIds: TaskId[]
}
```

Derived selectors (`domain/selectors.ts`, memoised): `pileFor(employeeId)` (pending reviews assigned, by effective priority), `waitingSeatsFor(employeeId)`, `queueFor(employeeId)`, `bossQueue()`, `floorSummary(floorKey)`, `idlePeople()`, `tempStaff()`, `whyLevel(taskId)`.

## 4. Seed organisation (`src/content/org.seed.json`, P01)

Reuses the MVP names for continuity. Owners are employees with role `owner` (`humanOwner: true`) so they appear on the boss floor and can be dressed.

| Floor | Department (key) | Dept manager | Lead | Reviewers | Workers (specialties) |
|---|---|---|---|---|---|
| Top | Boss floor | – | – | – | Owners: **Giám đốc**, **Phó giám đốc** (placeholder names, Q9) |
| Management | – | **Thu** = Manager (building-wide) | | | |
| Dept 4 | Kế toán (`accounting`) | Lan | Hùng | Oanh | Việt (invoicing), Hạnh (bookkeeping, tax) |
| Dept 3 | Thiết kế (`design`) | Minh | Vy | Tú | Long (image), Nhi (video), Tâm (product_photo) |
| Dept 2 | Marketing (`marketing`) | Hải | Hà | Khánh, Yến | Duy (copywriting), Bảo (promotions, ads), Thảo (social_scheduling, reporting) |
| Dept 1 | Chăm sóc khách hàng (`cs`, 24/7) | Ngọc | Linh | An, Quân | Mai (customer_chat), Trang (review_reply), Phúc (follow_up) |
| Ground | Lobby & café | – | | | |
Plus a `games_rest` floor between the departments and Management. Total: 25 department staff + Thu + 2 owners = 28 core. Temps: 0 at start (the simulator hires some).

Employee tints: the old per-person tokens (`--emp-thu` …) stop scaling. New rule: **department swatch** for floor accents and the idle ring; person-level variety comes from appearance, not colour.

## 5. SQL sketch (built in P09; final DDL lives in migrations)

```sql
create type app_role as enum ('boss','stylist');
create type approval_level as enum ('reviewer','dept_manager','boss');

create table app_users   (user_id uuid primary key references auth.users on delete cascade,
                          role app_role not null, display_name text not null,
                          owner_employee_id text null);         -- links a boss login to their avatar
create table departments (id text primary key, key text unique not null, label jsonb not null,
                          "order" int not null, color_swatch text not null, icon text not null,
                          hours text not null check (hours in ('office','24_7')),
                          floor_template text not null default 'department', active bool not null default true);
create table roles       (key text primary key, def jsonb not null);          -- RoleDef minus key
create table specialties (key text primary key, def jsonb not null);
create table platforms   (key text primary key, def jsonb not null);
create table shops       (id text primary key, platform_key text references platforms, name text, handle text);
create table task_types  (key text primary key, def jsonb not null);
create table employees   (id text primary key, name text not null, department_id text references departments,
                          role_key text references roles not null, specialties text[] not null default '{}',
                          kind text not null check (kind in ('core','temp')),
                          state text not null check (state in ('active','archived')),
                          review_mode text not null, model_tier_override text null, bio jsonb null,
                          created_at timestamptz not null default now(), created_by text not null,
                          archived_at timestamptz null);
create table approval_rules (id text primary key, "order" int not null, enabled bool not null,
                          label jsonb not null, "when" jsonb not null, level approval_level not null);
create table policy      (id int primary key default 1 check (id = 1), doc jsonb not null);
create table appearances (employee_id text primary key references employees on delete cascade,
                          doc jsonb not null, version int not null default 1,
                          updated_at timestamptz not null default now(), updated_by uuid not null);
create table config_audit (id bigint generated always as identity primary key, at timestamptz default now(),
                          actor uuid not null, entity text not null, entity_id text not null,
                          action text not null, before jsonb, after jsonb);   -- seed of the future audit log
```
- **RLS:** every table enabled. `select` for `boss` and `stylist` (stylist needs employees + catalogue context to dress people; it sees no runtime data, which isn't in the DB yet anyway). **No direct insert/update/delete** for anyone; writes go through `security definer` RPCs that check `app_users.role` and write `config_audit`:
  - `save_appearance(employee_id, doc, expected_version)`: boss or stylist; optimistic concurrency.
  - `upsert_department`, `upsert_employee`, `archive_employee`, `upsert_role`, `upsert_specialty`, `upsert_approval_rule`, `set_policy`, `upsert_platform`: boss only.
- **Realtime:** publication includes all config tables + `appearances` so two open browsers stay in sync (sister edits → dad sees it live).
- **Seed:** migration `0003_seed_org.sql` is generated from `src/content/*.json` by `scripts/seed-sql.mjs` (idempotent `on conflict do nothing`), so JSON stays the single source.

Designed but **not built** in this phase (see `after-this-phase.md`): `office_events`, `commands`, `tasks`, `reviews`, `questions`, `help_requests`, `intake_messages`, `employee_runtime`, `budgets`, `model_routes`, `connected_accounts`, `audit_log`.
