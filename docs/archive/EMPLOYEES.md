> **Superseded by [docs/plan/](../plan/00-overview.md) on 2026-11-10.** Kept for history only. Do not implement from this file. See docs/plan/00-audit.md for what was kept.

# AI Employee Specs

> **Behaviour is implemented in n8n, not in this repo.** This file describes what the employees and workflows *are*, so the dashboard can seed their definitions (`employees`, `workflows`, `workflow_steps`) and display them correctly. Treat the behaviour sections as reference for the n8n side.

Every employee is a **row in `employees`** (seeded) plus a set of n8n workflow parts that act under that identity.
The dashboard shows them all the same way: **name · role · scope · status · current task · current step · autonomy**.

## Shared rules (all employees)

| Rule | Detail |
|------|--------|
| **Statuses** | `idle` (free) · `working` · `waiting_boss` (needs you) · `blocked` (missing info or error) · `offline` (n8n down; set from the heartbeat, not by the employee) |
| **One task at a time** | Each employee has at most one `current_task_id`. More work waits in a queue (`tasks.status = queued`). Simpler for you to follow. |
| **Logs every step** | Every step calls `log_step(task_id, step_key, status, summary, output_ref?)`. Statuses: `pending → running → done / failed / stuck / skipped`. |
| **Autonomy** | `ask_first` (default) or `works_alone`. This only affects the employee's **risky steps** (flagged `risky=true` in `workflow_steps`). A task can also force approval with "ask before publishing" in Start work. |
| **Approval gate** | A gate step runs if `task.require_approval OR employee(risky step owner).autonomy = 'ask_first'`. Otherwise it is logged as `skipped` ("works alone"), so you can still see it was bypassed. |
| **Failure** | Up to 2 retries for transient errors, then `failed` with a human-readable `reason`. The task goes `blocked` and lands in the Inbox plus Telegram. |
| **Asking you** | When a brief is ambiguous: at most **one short question** per task. It is posted as an `approvals` row with `kind='question'`. Your answer resumes the task. |
| **Voice** | Customer-facing text follows the shop's reply rules (`shops.reply_rules`) and tone. Vietnamese by default for customers. |

---

## The team

### 1. Thu, Receptionist 🛎️
- **Mission:** turn your Telegram messages into well-formed tasks, and keep you informed.
- **Inputs:** Telegram text/voice from your chat ID only (other chat IDs are ignored and logged); `commands` rows from the dashboard.
- **Does:**
  1. Transcribes voice (speech-to-text).
  2. Classifies → `{workflow_key, shop_id, brief, require_approval}` with a confidence score.
  3. Confidence < 0.75 or a missing shop → asks one question (inline buttons where possible, e.g. pick a shop).
  4. Creates the task, replies "✅ Got it: *Review replies · Shop A* → Linh is on it (#142)".
  5. Sends the **daily standup** at 08:00 ICT: done yesterday / in progress / blocked / waiting for you.
  6. Forwards approval requests to Telegram with ✅ Approve · ✏️ Edit · ❌ Reject.
- **Never:** does the work itself, or publishes anything.
- **Risky steps:** none.

### 2. Mai, Chat Support 💬
- **Workflow:** `chat_reply`
- **Scope:** customer chat messages on all shops (product questions, order status, shipping).
- **Steps owned:** read message · draft reply · send reply *(risky)*.
- **Escalates (blocked + Inbox):** refunds, complaints that threaten a bad review, anything about money or legal issues, an order ID it can't find.
- **Note:** chat needs fast replies. I suggest making Mai the first employee you switch to `works_alone` once you trust the drafts. See open questions.

### 3. Linh, Review Replier ⭐
- **Workflow:** `review_reply` *(Phase 1)*
- **Scope:** new reviews on all shops, collected in batches (one task = one shop's new reviews).
- **Steps owned:** collect reviews · draft replies · post replies *(risky)*.
- **Rules:** 1–2★ reviews always get a personal apology plus a fix offer, never a template. 5★ reviews get short thanks with variety (no two replies alike in a batch).

### 4. Ha, Content Writer ✍️
- **Workflows:** `social_post` (write post, publish *(risky)*), `short_video` (write script).
- **Scope:** Zalo OA and Facebook Page posts, video scripts, captions.
- **Output:** text saved to Drive as `.md` plus an `artifacts` row.

### 5. Vy, Visual Producer 🎨
- **Workflows:** `social_post` (create image), `short_video` (generate video, captions + music, upload *(risky)*), `banner_set` (read brief, generate, resize per platform, replace on shop *(risky)*).
- **Providers:** behind interfaces `image.generate`, `video.generate`, `media.compose`. Swap the provider in one n8n sub-workflow. The dashboard only sees `artifacts.provider`.
- **Output:** files only in Drive at `/AI Team/{Shop}/{workflow}/{YYYY-MM-DD}/{task#}-{name}.{ext}`, plus an `artifacts` row. The dashboard previews them directly from Drive.

### 6. An, Reviewer (quality check) 🔍
- **Workflows:** QC step in **every** workflow, plus `price check` in `promo_join`.
- **Checks:** shop rules, tone, banned words, spelling, correct shop/product, image size per platform, price ≥ floor margin.
- **Result:** `pass` → next step. `fail` → sends the draft back to the owner with notes (max 2 loops, then blocked → Inbox).
- **Why one QC employee:** you see a single, consistent "gatekeeper" in every pipeline.

### 7. Bao, Promo Planner 🏷️
- **Workflow:** `promo_join`
- **Steps owned:** read rules · choose products & prices · submit entry *(risky)*.
- **Needs:** product cost / minimum price per SKU (see open questions). It never goes below your floor price.

### (Not an employee) Boss gate 👤
The approval step is shown as **"You"** in every pipeline, so the stepper reads like a real team handoff.

---

## Workflows (fixed steps)

`★` = risky step (gated by autonomy) · `👤` = boss approval gate

| Key | Name | Steps → owner |
|-----|------|---------------|
| `review_reply` | Reply to reviews | Collect reviews → Linh · Draft replies → Linh · Quality check → An · 👤 Approval → You · ★ Post replies → Linh |
| `chat_reply` | Answer a customer chat | Read message → Mai · Draft reply → Mai · Quality check → An · 👤 Approval (only if Mai asks first) · ★ Send reply → Mai |
| `social_post` | Zalo / Facebook post | Write post → Ha · Create image → Vy · Quality check → An · 👤 Approval · ★ Publish → Ha |
| `short_video` | Short product video | Write script → Ha · Generate video → Vy · Captions & music → Vy · Quality check → An · 👤 Approval · ★ Upload to shop → Vy |
| `banner_set` | Banner / image set | Read brief → Vy · Generate images → Vy · Resize per platform → Vy · Quality check → An · 👤 Approval · ★ Replace on shop → Vy |
| `promo_join` | Join a promotion | Read rules → Bao · Choose products & prices → Bao · Price check → An · 👤 Approval · ★ Submit entry → Bao |

Flat structure: Thu → one workflow → its steps. No agent calls another agent. A QC "fail" is a step loop inside the same workflow, not a sub-agent call.

## Boss actions on a waiting task
| Action | Effect |
|--------|--------|
| **Approve** | Gate `done` → risky step runs |
| **Request changes** (with note) | Sends the task back to the drafting step with your note; QC runs again |
| **Reject** | Task `cancelled`, reason stored |
| **Answer question** | Fills the missing info → task resumes |
| **Reassign** | Moves an unstarted / blocked step to another employee *who has that skill* (e.g. a draft step between Ha ↔ Linh). Only owners allowed by `workflow_steps.allowed_roles`. |
