# P03: Work engine and simulator

## 1. Goal and demo
Build the **pure domain engine** (how the company works: tasks, queues, three approval levels, help requests, staffing cap) and the **removable simulator** that feeds it believable Vietnamese business activity. Add the 2D screens that show it.

**Demo after merge:** open the app and the company is alive without any 3D people yet:
- `#/activity` scrolls a live feed in Vietnamese ("Mai bắt đầu *Trả lời tin nhắn hỏi size áo – Shopee 2*", "Ngọc duyệt …", "Vy nhờ Nhi hỗ trợ video").
- `#/queue` shows the boss's approval queue; the boss approves / requests changes / rejects and sees "Vì sao cần sếp duyệt?" with the matched rules.
- `#/org` shows every person's live status and current task.
- The P02 building shows live chips per floor (đang làm / đang chờ / giấy chờ duyệt).
- The sim panel has speed controls (pause, 1×, 30×, 120×) and seven scenario buttons.
- Typing "Làm banner sale 12.12 cho Shopee 1" in "Nhắn cho quản lý" creates a task that travels Manager → Thiết kế → worker → reviews.

## 2. Requirements
- **R1** `src/domain/**` is pure: no React, three, adapters, `Date.now()`, `Math.random()` (lint-enforced from P01-T04; this phase adds `Math.random` to the ban).
- **R2** The reducer handles every event type in `contracts.md` §2.2, is total (unknown id/type → skipped + warning), and idempotent on `seq`.
- **R3** Approval rule engine: required level = highest level among matching enabled rules, else `policy.approvals.defaultLevel`; returns matched rule ids.
- **R4** Review chain `every_level_up_to_required` creates reviews in order reviewer → dept_manager → boss; `required_only` creates one. The lead distributes reviewer-level items to the least-loaded reviewer of the department.
- **R5** Queues order by effective priority (`data-model.md` §2.5 formula); ties → older → lower id. No length limit.
- **R6** Staffing: temp cap from policy; at cap a hire archives the longest-idle temp idle ≥ `minIdleMinutesBeforeDrop`; if none qualifies, a manager-initiated hire becomes a boss-level review tagged `hire_over_cap`; a boss-issued hire proceeds. Core staff are never dropped. Archived people keep appearance and history.
- **R7** Help requests: timeout 30 sim-min, at most 2 rounds, then escalate to the department manager.
- **R8** Questions: at most `maxQuestionsPerTask` per task; `inPerson = true` when the target has ≥ `questionSeatThreshold` open questions.
- **R9** One active task per worker; a failed task is retried up to `maxRetries`, then `task.failed`.
- **R10** The simulator lives only in `src/adapters/sim/**`, is deterministic for a given seed (`?seed=`), and produces only events from the contract (plus `sim.scenario`).
- **R11** Sim clock: default 30×, speeds pause/1×/30×/120×; sim day 08:00–17:30 with lunch 12:00–13:00; `24_7` departments keep working at night, others go `resting`/`off_shift`.
- **R12** Seven scenarios (§3.6) can be triggered from the panel and each produces the described visible outcome within 60 real seconds at 30×.
- **R13** `#/activity`, `#/queue`, the intake box and live `#/org` statuses work at desktop width and 375 px, Vietnamese first, English keys matching.
- **R14** Boss commands (`review.decide`, `question.answer`, `intake.submit`, `task.set_priority`, `task.cancel`, `staff.hire`, `staff.dismiss`) go through `OfficeFeed.send` and resolve via `CommandButton` states.
- **R15** `LiveBadge` and the team-online indicator read the feed's `connection()` and the last `system.heartbeat`.
- **R16** Removability: the app builds and runs with the sim folder replaced by an empty module (`npm run check:sim-removable`), showing the static org and an empty feed.
- **R17** `ReplayFeed` plays a recorded event log; golden logs make the engine regression-testable.

## 3. Specs

### 3.1 Domain modules (`src/domain/`)
| File | Exports (all pure) |
|---|---|
| `events.ts` | zod schema per event payload, `OfficeEventSchema` (discriminated union, payload `.passthrough()`), `parseEvent(unknown)` |
| `commands.ts` | zod schema per command (`.strict()`), `CommandSchema` |
| `reducer.ts` | `initialState(config, now)`, `apply(state, event)`, `applyAll(state, events)` |
| `rules.ts` | `requiredLevel(task, rules, policy, ctx) → { level, matchedRuleIds }`; `ctx.crossDepartment` is computed by the caller |
| `reviews.ts` | `chainFor(level, policy) → ApprovalLevel[]`, `pickApprover(level, task, state) → EmployeeId`, `nextInChain(review, task, policy)` |
| `queue.ts` | `effectivePriority(item, now, policy)`, `sortQueue(items, now, policy)` |
| `staffing.ts` | `planHire(request, state, now) → { kind: 'hire' } \| { kind: 'hire_after_archive', archiveId } \| { kind: 'needs_boss' }`, `longestIdleTemp(state, now)` |
| `help.ts` | `pickHelper(specialty, state, excludeIds)`, `onHelpTimeout(help, policy) → 'retry' \| 'escalate'` |
| `questions.ts` | `canAsk(task, state, policy)`, `isInPerson(targetId, state, policy)` |
| `assign.ts` | `pickWorker(taskType, departmentId, state)` (idle + specialty match → least recently active; none → stays queued) |
| `selectors.ts` | from `data-model.md` §3 plus `activitySentenceParts(event, state)` |

Pick-approver rules: `reviewer` → least-loaded active reviewer in the task's department (ties → id), chosen by the lead (`actor` of `review.requested` distribution is the lead); `dept_manager` → the department's manager; `boss` → the owner avatar with the shorter pile (ties → first by id).

Person activity transitions done by the reducer (not by the feed): `task.started` → `working`; `review.started` → approver `reviewing`; `review.requested`/`task.handed_off`/`task.assigned` (cross-person) → courier `delivering` until the feed sends `person.activity`; `question.asked` → `asking` (or `waiting_answer` when `inPerson`); `help.accepted` → helper `helping`; `task.completed` with no other task → `idle` with `idleSince = at`.

### 3.2 Simulator architecture (`src/adapters/sim/`)
```
SimFeed.ts          implements OfficeFeed (kind 'sim'); owns clock, rng, brain; emits batches every tick
clock.ts            SimClock: now(), speed (0|1|30|120), advance(realDtMs) → simDtMs, isWorkHours(dept), isLunch()
rng.ts              mulberry32(seed), helpers: pick, weighted, range, chance
brain/
  tick.ts           one sim step (every 250 ms real): run generators → run agents → flush events
  generators.ts     intake (boss), customers (platform tasks), schedule (calendar tasks)
  agents.ts         manager, deptManager, lead, reviewer, worker step functions (each: state → events)
  work.ts           progress model, duration sampling, failure/retry
  odds.ts           decision odds table (§3.5)
  intakeParser.ts   keyword matcher: text → task type(s)
scenarios/          one file per scenario (§3.6): (ctx) => schedules events/forced conditions
content/vi/         titles.ts, customers.ts, products.ts, shops.ts, bossMessages.ts, notes.ts, questions.ts
controls.ts         simControls: setSpeed, pause, setSeed, runScenario, setTeamOnline (NOT commands)
ui/SimControlPanel.tsx   registered through officeExtensions.controlPanel
index.ts            the only export surface: createSimFeed(), SimControlPanel
```
- The brain uses the **same domain functions** as the reducer's consumers (`rules`, `reviews`, `staffing`, …) to decide what happens, then emits events. It never mutates `OfficeState` directly; it keeps its own state by applying its own events through `apply`.
- Tick: real 250 ms; sim dt = 250 ms × speed. At 120× one tick = 30 sim-seconds. Agents act on sim time, so results do not depend on frame rate.
- Determinism: all randomness from the seeded rng; iteration over records is sorted by id; the tick takes `(state, simNow, rng)` only. Wall time is used only to pace ticks.
- Seed: `?seed=<int>` in the URL hash query, default `20261110`. Shown in the panel with a "copy link" button.
- Heartbeat: `system.heartbeat {source:'sim'}` every 60 sim-seconds while "team online"; the "Đội offline" scenario stops heartbeats and stops processing commands (they stay `accepted`, applied when back online).
- Human owners are never simulated: boss-level reviews wait until a boss command arrives. Demo aid: panel toggle "Tự duyệt thay sếp sau 2 phút (demo)", default **off**.

### 3.3 Work flow the brain simulates
1. A task appears (intake / customer / schedule) → `task.created` (status `queued`, `requiredLevel` from rules).
2. Manager assigns to a department worker by specialty (`task.assigned`); customer tasks on `24_7` departments skip the manager and are assigned by the dept manager.
3. Worker starts (`task.started`), progresses (`task.progressed` every ~10% ), may ask one question, may request help (task type `needsHelpFrom`, 35% chance), may hand off (cross-department child task, e.g. post → image).
4. On finishing work: review chain per R4 (`review.requested` → `review.started` → `review.decided`, escalation events between levels). `reviewMode: 'when_important'` workers skip the reviewer level when the required level is `reviewer` and the task has tag `routine_draft`.
5. `changes_requested` → task back to `in_progress` at 60% progress, `attempts+1`. `rejected` → `task.cancelled`. Final approval → `task.completed`.
6. Idle people get `person.activity` (`idle`; `resting` at lunch and at night for office-hours departments).
7. Staffing: when a department's queue has > 6 queued tasks for 20 sim-min, the manager requests a temp hire (R6).

### 3.4 Task types seeded (`src/content/task-types.json`) and title templates (`src/adapters/sim/content/vi/titles.ts`)
Slots: `{shop}` (Shopee 1/2/3, Lazada 1, TikTok Shop 1), `{product}` (bình giữ nhiệt, áo thun cotton, kệ để giày, đèn bàn LED, túi tote vải, bộ hộp đựng thực phẩm, dép đi trong nhà, gối tựa lưng…), `{customer}` (chị Hoa, anh Tùng, khách "minh_anh92"…), `{n}`, `{month}`, `{quarter}`, `{event}` (12.12, Tết, Black Friday, 1.1).

| key | Title template (vi) | specialty | tags | priority | minutes | platforms |
|---|---|---|---|---|---|---|
| `cs.chat_faq` | Trả lời khách hỏi {product} còn hàng không – {shop} | customer_chat | faq_reply | normal | 3–8 | shopee, lazada, tiktok_shop |
| `cs.chat_size` | Tư vấn size {product} cho {customer} – {shop} | customer_chat | faq_reply | normal | 4–10 | shopee, tiktok_shop |
| `cs.chat_order_status` | Kiểm tra đơn hàng giao chậm của {customer} – {shop} | customer_chat | routine_draft | high | 5–12 | shopee, lazada |
| `cs.zalo_inbox` | Trả lời tin nhắn Zalo OA của {customer} | customer_chat | faq_reply | normal | 3–8 | zalo_oa |
| `cs.fb_comment` | Trả lời bình luận Facebook hỏi giá {product} | customer_chat | faq_reply, public_post | normal | 3–6 | facebook |
| `cs.review_positive` | Cảm ơn {n} đánh giá 5 sao – {shop} | review_reply | routine_draft | low | 6–15 | shopee, lazada, tiktok_shop |
| `cs.review_negative` | Trả lời đánh giá 1 sao về giao hàng chậm – {shop} | review_reply | public_post, angry_customer | high | 10–20 | shopee, lazada |
| `cs.refund_request` | Xử lý yêu cầu hoàn tiền của {customer} – {shop} | customer_chat | refund, money, angry_customer | urgent | 10–25 | shopee, lazada, tiktok_shop |
| `cs.exchange` | Hỗ trợ đổi {product} bị lỗi cho {customer} | customer_chat | money | high | 10–20 | shopee |
| `cs.follow_up` | Nhắn hỏi thăm {n} khách sau khi nhận hàng – {shop} | follow_up | routine_draft | low | 10–20 | shopee, zalo_oa |
| `cs.order_from_chat` | Tạo đơn từ tin nhắn của {customer} – Zalo | customer_chat | money | normal | 6–12 | zalo_oa |
| `cs.night_summary` | Tổng hợp tin nhắn ca đêm | follow_up | internal_note | low | 10–15 | – |
| `mkt.post_fb` | Viết bài Facebook giới thiệu {product} | copywriting | public_post | normal | 15–30 | facebook |
| `mkt.post_zalo` | Viết bài Zalo OA khuyến mãi {event} | copywriting | public_post | normal | 15–30 | zalo_oa |
| `mkt.caption_tiktok` | Viết caption TikTok cho video {product} | copywriting | public_post | normal | 8–15 | tiktok |
| `mkt.schedule_week` | Lên lịch đăng bài tuần này | social_scheduling | routine_draft | normal | 15–25 | facebook, zalo_oa, tiktok |
| `mkt.campaign_plan` | Lập kế hoạch chiến dịch sale {event} | promotions | campaign, cross_department | high | 30–60 | shopee, lazada, tiktok_shop |
| `mkt.promo_join` | Đăng ký chương trình Flash Sale {event} – {shop} | promotions | money, irreversible | high | 20–35 | shopee, lazada |
| `mkt.voucher` | Tạo mã giảm giá {n}% cho {shop} | promotions | money | normal | 10–20 | shopee, tiktok_shop |
| `mkt.ads_budget` | Đề xuất ngân sách quảng cáo tháng {month} | ads | money | high | 25–40 | facebook, tiktok_business |
| `mkt.ads_report` | Báo cáo hiệu quả quảng cáo tuần | reporting | internal_note | low | 20–30 | facebook, tiktok_business |
| `mkt.weekly_report` | Báo cáo doanh số theo kênh tuần này | reporting | internal_note | normal | 20–35 | – |
| `mkt.product_desc` | Viết lại mô tả {product} – {shop} | copywriting | routine_draft | low | 12–20 | shopee, lazada |
| `design.banner_set` | Thiết kế banner sale {event} – {shop} | image | public_post | high | 30–50 | shopee, lazada, tiktok_shop |
| `design.post_image` | Làm ảnh minh hoạ bài đăng {product} | image | routine_draft | normal | 15–30 | facebook, zalo_oa |
| `design.product_photos` | Chỉnh {n} ảnh sản phẩm {product} | product_photo | routine_draft | normal | 20–40 | shopee |
| `design.thumbnail` | Làm ảnh bìa video {product} | image | routine_draft | low | 10–20 | tiktok |
| `design.short_video` | Dựng video ngắn giới thiệu {product} | video | public_post | normal | 40–70 | tiktok, facebook |
| `design.video_subtitle` | Thêm phụ đề và nhạc cho video {product} | video | routine_draft | low | 15–25 | tiktok |
| `design.shop_decor` | Trang trí lại gian hàng {shop} dịp {event} | image | public_post, irreversible | high | 35–60 | shopee, lazada |
| `design.size_chart` | Vẽ bảng size cho {product} | image | routine_draft | low | 15–25 | shopee |
| `design.packaging_label` | Thiết kế tem dán hộp {product} | image | cross_department | normal | 25–40 | – |
| `acc.invoice` | Xuất hoá đơn cho đơn của {customer} | invoicing | money | normal | 8–15 | – |
| `acc.invoice_batch` | Xuất {n} hoá đơn điện tử trong ngày | invoicing | money | normal | 20–35 | – |
| `acc.reconcile` | Đối soát doanh thu {shop} tháng {month} | bookkeeping | money | high | 30–50 | shopee, lazada, tiktok_shop |
| `acc.ledger` | Ghi sổ chi phí tuần này | bookkeeping | internal_note | normal | 20–30 | – |
| `acc.vat_return` | Lập tờ khai thuế GTGT quý {quarter} | tax | tax, legal, irreversible | urgent | 45–90 | – |
| `acc.pit` | Tính thuế thu nhập cá nhân tháng {month} | tax | tax, money | high | 30–50 | – |
| `acc.revenue_report` | Báo cáo doanh thu tháng {month} | bookkeeping | internal_note | high | 25–40 | – |
| `acc.supplier_payment` | Đề nghị thanh toán nhà cung cấp {product} | bookkeeping | money, irreversible | high | 15–25 | – |
| `acc.refund_payout` | Chi hoàn tiền cho {customer} | invoicing | refund, money | urgent | 8–15 | – |
| `sys.hire_over_cap` | Đề nghị tuyển thêm nhân viên tạm cho {department} | – (manager) | hire_over_cap | high | – | – |
| `sys.connect_account` | Kết nối tài khoản {platform} mới | – (manager) | new_account, irreversible | high | – | – |

`needsHelpFrom`: `mkt.post_fb`/`mkt.post_zalo` → `image`; `mkt.caption_tiktok` → `video`; `mkt.campaign_plan` → `image`, `bookkeeping`; `cs.review_negative` → `copywriting`; `design.packaging_label` → `copywriting`. `carries`: chat → `phone`; writing/accounting → `laptop`; design image → `tablet`; video/product photo → `camera`; invoices/tax → `document`.

Generator weights by hour (per sim hour, at default): CS customer tasks 10–14 (night 3–5), marketing 3–4, design 2–3 (+handoffs), accounting 2 (×3 in the last 3 sim-days of a month and on VAT quarter-end), boss intake 1–2. Sim calendar starts Monday 08:00 of the current real month so month-end arrives within a demo.

### 3.5 Decision odds (`brain/odds.ts`, data table)
| Level | approve | changes | reject | review minutes |
|---|---|---|---|---|
| reviewer | 82% | 16% | 2% | 2–6 |
| dept_manager | 75% | 20% | 5% | 4–10 |
| boss | human (or demo auto: 85/12/3 after 2 real min) | | | – |
Second attempt after changes: approve +12 points. Work failure 4% per task (retry). Question chance 12% per task; answer time 2–5 min. Help accept 85%, help time 5–12 min.

### 3.6 Scenarios (`scenarios/*.ts`)
| key | Button (vi) | What it forces | Visible outcome |
|---|---|---|---|
| `angry_refund` | Khách giận đòi hoàn tiền | `cs.refund_request` urgent + `acc.refund_payout` handoff | item reaches the boss queue with rules `boss_sensitive`; urgent on top |
| `sale_1212` | Chiến dịch sale 12.12 | `mkt.campaign_plan` + 4 design + 3 marketing + 2 CS tasks, cross-department handoffs and help requests | burst across three floors |
| `month_end` | Cuối tháng kế toán | jumps accounting generator to month-end: reconcile ×5, VAT return, revenue report | accounting floor saturates; tax item to boss |
| `long_queue` | Hàng chờ duyệt dài | 12 reviews + 5 questions onto one dept manager | pile count 12; 5 people `waiting_answer` in person |
| `hire_temps` | Tuyển thêm người | manager hires until cap, then one over cap | `staff.hired` ×n, one `staff.archived (cap)` or a `hire_over_cap` boss review |
| `team_offline` | Đội offline | stops heartbeat + command processing (toggle) | LiveBadge/team indicator offline; commands queued |
| `boss_telegram` | Sếp nhắn Telegram | `intake.received` (telegram, voice 50%) with a random boss message | manager creates 1–2 tasks |
Each scenario emits `sim.scenario` first.

An eighth, **"Đông người"** (perf reference, shown in the panel under "Kiểm thử"): with seed `perf-1` it hires temps past the cap (cap ignored for this scenario only) until 80 people are active and keeps every department busy. `performance.md` measures against it.

### 3.7 Intake parser (sim only)
`intakeParser.parse(text) → TaskTypeKey[]`: lowercase, strip diacritics, keyword table (`banner|ảnh bìa` → design, `hoàn tiền|refund`, `thuế|vat|gtgt`, `bài đăng|viết bài|facebook|zalo`, `video|tiktok`, `đánh giá|review`, `hoá đơn`, `báo cáo`…), shop/platform detection (`shopee 1`), `gấp|khẩn` → urgent. No match → `mkt.weekly_report`-like generic task is **not** invented; instead the manager asks the boss a question ("Sếp muốn giao việc này cho phòng nào?"), exercising `question.answer`.

### 3.8 2D features
- **`features/activity`** `#/activity`: virtualised list of `state.log` newest first; sentence = i18n template per event type with slots (actor name, task title, target) built by `activitySentenceParts`; filters: department/floor, type group (việc, duyệt, hỏi & nhờ, nhân sự); click → person or task popover. Desktop: also a collapsible ticker overlay on `#/office`.
- **`features/queue`** `#/queue`: tab "Chờ sếp duyệt" (boss reviews + questions to owners, sorted by effective priority, each with task title, requester, department, age via `TimeAgo` on feed time, priority pill, "Vì sao cần sếp duyệt?" expandable list of matched rule labels) with `CommandButton`s Duyệt / Yêu cầu sửa (note required) / Từ chối; tab "Hàng chờ các phòng" read-only: per approver pile counts and top 5 items.
- **Intake box**: in the app header (desktop) and on `#/queue` top (phone): textarea "Nhắn cho quản lý…", send → `intake.submit`.
- **`#/org` live**: status pill, current task title, platform badge chip, pile count for approvers, temp badge, archived section (collapsed).
- **Floor chips in 3D**: `scene/render/FloorLabel` (from P02) gains three chips fed by `floorSummary(floorKey)`; drawn with drei `<Text>`, one per floor (not per person).
- Status → tone mapping extends `src/lib/status.ts` (`activityTone: Record<PersonRuntime['activity'], Tone>`).

### 3.9 Office store wiring
`src/office/store.ts`: `start()` → `feed.start(config)` → set state → `feed.subscribe(batch => set(applyAll))`; batches are applied at most once per animation frame. `sendCommand(cmd)` wraps `feed.send` and tracks `{commandId → status}` by watching `causedBy`. `useCommandStatus(id)` drives `CommandButton`.

## 4. Design choices
| Topic | Options | Choice | Reason | Revisit if |
|---|---|---|---|---|
| State model | CRUD snapshots · event-sourced reducer | **Event-sourced reducer** | Same input shape for sim and real system; replay and golden tests for free | Real system can only deliver snapshots → add a snapshot-diff adapter that synthesises events |
| Where the sim runs | Browser · Supabase edge cron · local Node process | **Browser** | No server, removable, works on GitHub Pages; each viewer has their own sim (acceptable for a demo) | Dad and son must watch the *same* sim → record a log and share via `ReplayFeed`, or move the brain to a worker writing `office_events` |
| Sim brain style | Scripted timelines · agent step functions + generators · LLM-generated | **Agent step functions + generators, seeded** | Emergent but deterministic; scenarios are small pushes on the same engine | Activity feels repetitive → add more content, not a new engine |
| Randomness | `Math.random` · seeded mulberry32 | **Seeded** | Reproducible demos and golden logs | – |
| Time scale | fixed 60× · selectable | **Pause/1×/30×/120×, default 30×** | Tasks of 5–60 sim-min take 10 s–2 min: watchable | P04 finds trips unreadable at 120× → cap or drop 120× |
| Review chain default | required level only · every level up to required | **Every level** (policy switch) | "Start strict, loosen later"; shows all three levels in the demo | Boss finds it slow → flip `policy.approvals.chain` |
| Boss decisions in sim | auto · human only · human with optional demo auto | **Human, optional demo auto (off)** | The boss queue must be real; auto helps unattended demos | – |
| Intake parsing | keyword matcher · LLM call | **Keyword matcher (sim only)** | No keys in the browser; real intake is after this phase | – |
| Task titles | i18n · sim content data | **Sim content (vi only)** | It is fake business data, like the MVP seed; real titles will come from real work | English demo needed → add `content/en` |
| Batching | per event · per frame | **Per animation frame** | 120× can emit dozens of events per tick | – |
| Sim start date | current real month · fixed date | **Fixed Monday 2026-11-02 08:00 ICT** | Deterministic golden logs; month-end rules fire at fixed sim dates | A demo needs "today" → derive it from a seed-independent `startIso` option |
| System requests (`sys.*`) | normal chain · straight to boss | **Straight to a boss review**; "request changes" cancels | R6: a hire over cap has no worker to rework it, and a department reviewer must not bounce it | Boss wants to negotiate a hire → add a comment thread, not a rework loop |
| Boss answers to unclear intake | ignore · re-parse with the answer | **Re-parse request + answer; fall back to a department named in the answer** | The question exists so the answer can route the work | Real intake (after this phase) replaces the keyword matcher |
| Worker on a boss review | held until decided · freed | **Freed** | Boss review is a human wait; holding workers stalled the company (CS lost 9 of 10 workers by hour 6) | Boss wants workers to stay on call → add a policy flag |
| Heartbeats in the log | logged · state only | **State only** (`lastHeartbeat`) | One per sim minute filled the 500-event activity ring (56% over five days) | A debug view needs them → read them from the feed, not the ring |
| Demo auto-approve delay | 2 sim minutes · 2 real minutes | **2 real minutes** at the current speed | 2 sim minutes is 4 s at 30×: the boss never sees the queue | – |
| Team online | connection only · connection + heartbeat | **Both** (stale after 3 min of feed time) | R15 | – |
| Command ids from the UI | counter · ULID | **Wall-clock ULID with crypto randomness**, outside the domain | A counter restarts on reload and collides with idempotency | – |
| Command permissions in the sim | trust the caller · enforce contract roles | **Enforce**: all commands boss-only, `forbidden` otherwise | Same behaviour the real worker will have (`contracts.md` §3) | – |
| Scenario `long_queue` seats | force `inPerson` · obey R8 | **Obey R8**: ask threshold + 5 questions so 5 sit | A scripted flag contradicted the domain rule | – |

## 5. Tasks
- [x] **P03-T01** Complete event/command schemas and the reducer. *Files:* `src/domain/{events,commands,reducer}.ts`, `src/domain/__tests__/reducer.test.ts`, `src/domain/__fixtures__/events/*.json`. *Steps:* zod payload schema for every type in `contracts.md` §2.2 and §3; `apply` case per type with the state effects listed there and the activity transitions in §3.1; skip-and-warn for unknown ids/types; ignore `seq ≤ state.seq`; ring buffer 500. *Acceptance:* one test per event type (fixture in → expected state slice); test "unknown id skipped", "duplicate seq ignored", "exhaustive switch" (`never` check compiles); `contracts.test.ts` version check passes.
- [x] **P03-T02 ∥** Approval rule engine. *Files:* `src/domain/rules.ts`, test. *Steps:* §2.6 of data-model; AND across present fields, any-of in arrays; highest level wins; default level. *Acceptance:* table-driven test with the seed rules: refund → boss (`boss_sensitive`), 2 500 000 ₫ → boss, public post → dept_manager, routine draft → reviewer, routine + refund → boss, no match → dept_manager, disabled rule ignored.
- [x] **P03-T03 ∥** Priority queue. *Files:* `src/domain/queue.ts`, test. *Acceptance:* tests: normal waiting 5 h ranks ≥ fresh high; low never passes a fresh high (cap 150 → 250 < 300); tie-breaks; 10 000 items sort < 20 ms.
- [x] **P03-T04 ∥** Review chain and approver picking. *Files:* `src/domain/reviews.ts`, test. *Acceptance:* boss-level task under `every_level_up_to_required` yields reviewer → dept_manager → boss in order; `required_only` yields one; least-loaded reviewer chosen; `changes_requested` at any level returns the task to the worker and restarts the chain; rejected stops it.
- [x] **P03-T05 ∥** Staffing, help, questions, assignment. *Files:* `src/domain/{staffing,help,questions,assign}.ts`, tests. *Acceptance:* tests for each branch of R6 (under cap; at cap with eligible idle temp; at cap none eligible + manager → `needs_boss`; boss-issued → hire), core never returned by `longestIdleTemp`; help round 1 timeout → retry with a different helper, round 2 → escalate; second question on a task refused; `inPerson` at threshold.
- [x] **P03-T06 ∥** Selectors. *Files:* `src/domain/selectors.ts`, test. *Steps:* implement the list in data-model §3 with memoisation (`reselect`-style manual memo on state slices). *Acceptance:* tests for `pileFor`, `bossQueue`, `floorSummary`, `whyLevel`.
- [x] **P03-T07** Sim clock, rng, SimFeed shell. *Files:* `src/adapters/sim/{clock,rng,SimFeed,controls,index}.ts`, tests; `src/office/feedRegistry.ts` (one line). *Steps:* implement `OfficeFeed`; tick timer; seq and id generation (ULID from rng + sim time, so deterministic); connection state; heartbeat; command intake with idempotency by `command.id`. *Acceptance:* test: two feeds with the same seed, advanced by manual `step()` 2 000 ticks, emit identical logs; speed change does not change the log for the same sim duration; `VITE_FEED=sim` selects it.
- [x] **P03-T08** Content and task types. *Files:* `src/content/task-types.json`, `src/adapters/sim/content/vi/*.ts`, `scripts/content-validate.mjs` (extend). *Steps:* the 43 rows of §3.4; ≥ 40 customer names, ≥ 30 products, ≥ 25 boss messages, ≥ 20 review notes ("Sửa lại lời xin lỗi cho chân thành hơn"), ≥ 15 questions. Natural Vietnamese with diacritics. *Acceptance:* validator passes (specialties, departments, platforms exist; every template slot is known); a test renders 500 titles with no `{` left.
- [x] **P03-T09** Brain: generators, agents, work model. *Files:* `src/adapters/sim/brain/*`, tests. *Steps:* §3.2–3.5; uses domain functions only. *Acceptance:* 8 sim-hours at seed default: ≥ 60 tasks created, every department has work, ≥ 1 review at each level, ≥ 1 help request, ≥ 1 cross-department handoff, no worker with 2 active tasks, no event rejected by `parseEvent`, night: only CS working.
- [x] **P03-T10** Scenarios and commands in the sim. *Files:* `src/adapters/sim/scenarios/*`, `brain/commands.ts`, `brain/intakeParser.ts`, tests. *Acceptance:* one test per scenario asserting the outcome column of §3.6 within 30 sim-min; tests for each command in `contracts.md` §3 incl. `already_decided` rejection and offline queueing; parser test with 20 Vietnamese phrases (with and without diacritics).
- [x] **P03-T11 ∥** ReplayFeed and golden logs. *Files:* `src/adapters/replay/ReplayFeed.ts`, `src/domain/__fixtures__/golden/day-seed-1.json`, `scripts/record-golden.mjs`, test. *Steps:* ReplayFeed plays a log at a given speed (`VITE_FEED=replay&log=…`), `send` acks `rejected: 'replay'`; golden test: replaying the log through `applyAll` matches a stored state hash; second test: SimFeed with seed 1 for one sim day reproduces the golden log byte-for-byte. *Acceptance:* both pass; `npm run golden:update` regenerates and the PR diff shows the change.
- [x] **P03-T12** Office store wiring and command tracking. *Files:* `src/office/{store,hooks,extensions}.ts`, `src/components/CommandButton.tsx` (adapter prop), `src/components/LiveBadge.tsx`, `TeamOnlineIndicator.tsx`. *Steps:* §3.9; LiveBadge/TeamOnline read the feed when on new routes (legacy routes keep the legacy store). *Acceptance:* unit test with a fake feed: command goes sending → queued → applied on the `causedBy` event; failed on `rejected`; rAF batching verified with fake timers.
- [x] **P03-T13 ∥** Activity feed. *Files:* `src/features/activity/*`, `src/i18n/{vi,en}/activity.ts`, router/nav entry. *Acceptance:* component test renders a sentence for every event type in both languages (no missing template); list stays ≤ 60 DOM rows with 500 events; 375 px screenshot has no horizontal scroll.
- [x] **P03-T14 ∥** Approval queue and intake box. *Files:* `src/features/queue/*`, `src/features/office/IntakeBox.tsx`, `src/i18n/{vi,en}/queue.ts`. *Acceptance:* e2e: run scenario `angry_refund` (via `window.__office_debug.sim.runScenario`), item appears in `#/queue` with the rule label, click Duyệt → button reaches "Đã áp dụng", item leaves; "Yêu cầu sửa" requires a note; intake "làm banner sale 12.12 cho shopee 1" creates a `design.banner_set` task visible in `#/activity`.
- [x] **P03-T15 ∥** Live org page and floor chips. *Files:* `src/features/org/*`, `src/scene/render/FloorLabel.tsx`, `src/lib/status.ts`. *Acceptance:* org rows update without refresh during a sim run (e2e waits for a status change); floor chips equal `floorSummary` (unit test of the mapping); draw calls added ≤ 1 text mesh per floor.
- [x] **P03-T16** Sim control panel. *Files:* `src/adapters/sim/ui/SimControlPanel.tsx`, `src/i18n/{vi,en}/sim.ts`, `src/features/office/OfficePage.tsx` (renders `officeExtensions.controlPanel` if present). *Steps:* speed buttons, sim date/time, seed + copy link, 7 scenario buttons, demo auto-approve toggle, on phone a bottom sheet under "Thêm". *Acceptance:* e2e: pause freezes the feed timestamp; 120× advances faster than 30×; every scenario button emits `sim.scenario`.
- [x] **P03-T17** Removability guard. *Files:* `eslint.config.js`, `scripts/check-sim-removable.mjs`, `package.json` (`check:sim-removable`), `ci.yml`. *Steps:* lint: only `src/office/feedRegistry.ts` may import `@/adapters/sim`; script runs `vite build` with `VITE_FEED=static` and an alias mapping `@/adapters/sim` to an empty stub, then a Playwright smoke: `#/office` and `#/org` render, no sim panel. *Acceptance:* script green in CI; adding an import of the sim in `src/scene` fails lint.
- [x] **P03-T18** Legacy coexistence and docs. *Files:* `src/app/AppLayout.tsx`, `docs/plan/contracts.md` (changelog v1.1 if payloads were refined), PR body. *Steps:* inbox badge in the new nav counts `bossQueue()`; confirm the legacy mock simulator still only runs on legacy routes (P01-T09). *Acceptance:* visiting `#/office` then `#/activity` never starts `startSimulator()` of `src/lib/mock/store.ts` (spy test).

## 6. Dependencies
- **Needs:** P01 (ports, domain types, config seed, office store shell, lint boundaries, CI, e2e harness, `StaticFeed`), P02 (`FloorLabel` and `floorKey` mapping for chips; only T15 and T16 touch P02 code).
- **Later phases rely on:** `OfficeState` + selectors (P04 director, P05 visuals), `PersonRuntime.activity/carrying/platformKey` (P04/P05), `simControls` + `window.__office_debug.sim` (P04 perf check, P05/P11 demo script), golden logs (all later regression tests), `task-types.json` (`carries`, platforms → P05 held items and badges), staffing events (P10 hire/dismiss UI), command tracking (P10).

## 7. Branch and PR
- Branch `stack/p03-engine-sim`, base `stack/p02-building`. (May be developed in parallel from `stack/p01-foundation` and restacked, `stacked-prs.md` §4.)
- Title: `[P03] Work engine & simulator`.
- Size note: if the diff passes ~2 500 lines, split into `p03a-engine` (T01–T06, T11) and `p03b-sim` (rest) and record it here.
- Description template:
```md
<stack map>
## What
Pure domain engine (rules, queues, review chain, staffing, help, questions) + removable simulator + activity feed, boss queue, intake box, live org, floor chips.
## Demo
1. npm run build && npm run preview → #/activity (feed moves), #/queue, #/org
2. Sim panel → "Khách giận đòi hoàn tiền" → approve in #/queue
3. Add ?seed=7 → different but repeatable day
## Requirements → evidence
R1 … R17: <test file or manual check per line>
## Contract
contracts.md version: <unchanged | v1.1 + changelog line>
## Numbers
events/sim-hour at 30×: … · bundle delta: … · unit tests: …
```

## 8. Review checklist
- [ ] `src/domain` has no forbidden imports or `Date.now`/`Math.random`/`new Date()` (lint passes; grep to confirm).
- [ ] Every event in `contracts.md` §2.2 has a schema, a reducer case and a test; every command has a schema and a sim handler test.
- [ ] The sim decides with domain functions, not private copies of the rules (no second priority or rule function).
- [ ] Same seed → same log (run the golden test twice; change the speed mid-run in the app and compare a recorded log).
- [ ] No import of `adapters/sim` outside `office/feedRegistry.ts`; `npm run check:sim-removable` passes.
- [ ] Boss-level items are never auto-decided unless the demo toggle is on.
- [ ] Vietnamese reads naturally (titles, feed sentences, panel); `en` keys match.
- [ ] `#/activity`, `#/queue`, `#/org` at 375 px: no horizontal scroll, buttons reachable by keyboard, `CommandButton` states visible.
- [ ] Legacy routes still work; only one simulator runs at a time.
- [ ] Policy numbers come from `policy.json` (no hard-coded 10, 30, 2 in the engine).

## 9. Risks and open questions
- **Engine/sim drift:** the sim could encode business rules the real system would not follow. Mitigation: rules live in `src/domain`; the sim only chooses *when* and *what*.
- **Event volume at 120×** may flood the reducer or the feed UI. Mitigation: rAF batching, 500-event ring, virtualised list; measure in T13.
- **Too strict feels stuck:** with every-level chains the boss queue can grow while the boss is away. The demo toggle and the `long_queue` visuals make this a feature; the policy switch loosens it.
- **Per-viewer sims differ** (dad and son see different days). Accepted for this phase; `ReplayFeed` is the sharing workaround.
- **Open:** real product categories and shop names for believable titles (Q in `questions-and-assumptions.md`); placeholders are general household/fashion goods.
- **Open:** should owners be able to answer on behalf of each other? Assumed yes (any `boss` role can decide any boss-level item).
