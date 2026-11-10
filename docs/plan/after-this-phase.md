# After this phase

What is still missing once P11 is merged, what P00–P11 already prepared for it, and what would be expensive to change. Nothing in this file is built by the current plan. P11-T14 updates it with what was actually built.

After P11 the building is a **complete front end with a fake brain**. Everything below replaces the fake brain with real work, one part at a time, while the 3D and 2D screens stay as they are.

## 1. The swap in one picture

```
 now:   SimFeed (browser) ──OfficeEvent──▶ reducer ──▶ store ──▶ 2D + 3D
 later: workers ──▶ Supabase office_events ──realtime──▶ SupabaseFeed ──OfficeEvent──▶ (same from here on)
        UI ──Command──▶ SupabaseFeed.send ──▶ commands table ──▶ workers
```
The worker runtime is **decided (boss, 2026-11-10): a dedicated worker service**, not n8n. Recommended shape: a TypeScript/Node service that imports this repo's pure `src/domain` rules (published as a small workspace package), talks to Supabase with the service role, and can run on the always-on machine or a small VPS. The contract is unchanged:

## 2. Real AI workers (queue, retries, cost and budgets)

**Left to build**
- A worker runtime that takes a task, runs the employee's model with its instructions and tools, and reports progress.
- A durable task queue with leases, retries (policy `work.maxRetries`, already data), dead-letter state → `task.blocked` with a readable reason.
- Cost metering per call (tokens, provider price) rolled up per employee, department and day; budgets with soft warning and hard stop; a "budget exceeded" approval rule tag (`over_budget` → boss).
- The manager AI: real classification of intake into `TaskType` + department + assignee (the simulator fakes this with templates).
- Watchdog: a step running past its expected duration becomes `task.blocked` (old plan D7).

**Already prepared**
- `OfficeEvent` catalogue covers the full life of a task, review, question, help request and staffing change (`contracts.md` §2). Workers only need to emit them.
- Domain rules are pure and shared: approval level (`domain/rules.ts`), priority with aging (`queue.ts`), staffing cap (`staffing.ts`), help rounds (`help.ts`). A worker service in TypeScript can import them; n8n can call them through one small function or re-implement from the tests.
- `Employee.modelTierOverride`, `RoleDef.modelTier`, `Employee.reviewMode`, `TaskType.durationMinutes` (becomes the watchdog hint).
- `config_audit` and the RPC write path; `app_users` roles.
- `system.heartbeat` event and the "team offline" indicator.

**Tables designed, not built**
```sql
office_events   (seq bigint identity pk, id text unique, at timestamptz, type text, actor jsonb,
                 caused_by text null, payload jsonb, v int)             -- append-only; realtime; boss select
commands        (id text pk, created_at, created_by uuid default auth.uid(), type text, payload jsonb,
                 status text check (status in ('pending','accepted','applied','failed')),
                 result text, processed_at)                             -- boss insert (with check), worker update
tasks           (id text pk, type_key, title, detail, department_id, assignee_id, requested_by jsonb,
                 channel, platform_key, shop_id, amount_vnd, tags text[], priority, status, progress,
                 required_level approval_level, matched_rule_ids text[], parent_task_id,
                 attempts int, lease_owner text, lease_until timestamptz,
                 created_at, started_at, finished_at)                   -- projection + work queue
reviews         (id, task_id, level, assignee_id, status, priority, note, created_at, decided_at, decided_by)
questions       (id, task_id, from_id, to_id, text, status, in_person bool, created_at, answered_at)
help_requests   (id, task_id, from_id, specialty, to_id, round, status, created_at, timeout_at)
intake_messages (id, channel, modality, from_user_id, text, audio_ref, transcript_confidence, at, task_ids text[])
employee_runtime(employee_id pk, activity, task_id, carrying, platform_key, idle_since, last_active_at)
usage_ledger    (id, at, employee_id, task_id, provider, model, input_tokens, output_tokens, cost_usd, cost_vnd)
budgets         (id, scope text check (scope in ('employee','department','company')), scope_id,
                 period text check (period in ('day','month')), limit_vnd, warn_at_pct, hard_stop bool)
```
`office_events` is the source of truth; the other runtime tables are projections maintained by the worker side (one SQL function `apply_event`, the successor of the old `log_step` idea: the only way runtime state is written).

**Carried over from the old n8n plan**
- Command delivery: `AFTER INSERT` trigger on `commands` → `pg_net` POST to the worker webhook, shared secret in **Supabase Vault** sent as a header; the worker re-reads the row with service_role. Pending commands are swept on worker start, so nothing is lost while the PC is off.
- Idempotency: a decision on an already-decided review fails with `already_decided` (Telegram and the app can race).
- Heartbeat every 60 s; stale for 3 min → "Đội ngũ đang nghỉ (máy tắt)"; commands show "Đã xếp hàng".

## 3. Model routing (several providers, per department or employee)

**Left:** provider adapters (Anthropic, OpenAI, Google, local models…), a routing table, fallbacks on error or rate limit, per-route price table for the ledger, an admin tab to edit routes, an evaluation habit before changing a route.

**Prepared:** `modelTier` on roles and the per-employee override are exactly the routing keys; Quản trị already edits them.

```sql
model_routes (id, scope text check (scope in ('tier','department','employee','task_type')), scope_key text,
              provider text, model text, params jsonb, fallback_route_id, enabled bool, "order" int)
model_prices (provider, model, input_per_mtok_usd, output_per_mtok_usd, effective_from)
```
Resolution order: task type → employee → department → tier. Keys for providers live only on the worker side (§8).

## 4. Intake: Telegram and in-app, text and voice

**Left:** Telegram bot (allow-list of chat ids, text + voice notes, inline buttons for approvals and for "which shop?" questions), speech-to-text, in-app voice (record in the browser → upload → transcribe on the worker side; the browser never holds a provider key), confirmation replies, the daily stand-up message at 08:00 ICT, approvals mirrored to Telegram.

**Prepared:** `intake.received` event with `channel` and `modality`; `IntakeMessage` entity; `intake.submit` command (text) and the Manager's request box; the manager character's "phone rings" visual; boss-level `review.decide` and `question.answer` commands are channel-neutral.

**To add to the contract:** `intake.submit` gains `modality: 'voice'` + `audioRef`; event `intake.transcribed {messageId, text, confidence}`; low confidence → a `question` to the boss.

## 5. Platforms, accounts, merged inbox, orders from chat

**Left**
- Connecting **many accounts at once** on Facebook, Instagram, Zalo OA, Zalo, TikTok, TikTok for Business, Shopee, Lazada, TikTok Shop. Each has its own OAuth/app review/partner process; several (Zalo personal, TikTok messaging, Shopee chat) are restricted or need partner approval. **Which platforms matter is undecided**, so each is one adapter behind a common interface, added when chosen.
- A merged inbox: conversations and comments from every account in one list, assignment to CS workers, reply with approval rules, SLA timers, follow-ups.
- Order creation from chat (draft order → confirm with customer → create on the marketplace or internal sheet), which touches money → boss-level rule at first.
- Media: generated images and videos live **only in Google Drive**; the app previews them read-only with a Google token kept in memory (old D6). The frozen Library screen (`VITE_FEATURE_LIBRARY`) returns here.

**Prepared:** platforms and shops are data (`platforms`, `shops`, editable in Quản trị, 9 platform rows seeded); tasks carry `platformKey` and `shopId`; platform badges on characters; the `new_account` tag already routes to the boss; `connected_accounts` is the natural home of the "new account connection needs the boss" rule.

```sql
connected_accounts (id, platform_key, shop_id null, display_name, external_id, status, scopes text[],
                    secret_ref text,            -- pointer into the secret store, never the token itself
                    connected_by uuid, connected_at, expires_at, last_sync_at)
conversations (id, account_id, kind text check (kind in ('chat','comment','review')), customer jsonb,
               subject, status, assignee_id, last_message_at, unread int)
messages      (id, conversation_id, direction, text, attachments jsonb, at, sent_by_employee_id, external_id)
orders_draft  (id, conversation_id, shop_id, items jsonb, total_vnd, status, created_by_employee_id, approved_review_id)
artifacts     (id, task_id, type, title, drive_file_id, drive_url, mime, size_bytes, width, height, duration_sec, provider, created_at)
```

## 6. Department work

| Department | Work to build | Notes |
|---|---|---|
| **Chăm sóc khách hàng** | 24/7 chat replies, review replies (1–2★ always personal apology + fix, 5★ varied thanks), follow-ups, escalation of refunds/complaints | Depends on §5. The old `review_reply` and `chat_reply` step lists (archived `EMPLOYEES.md`) are the starting task recipes |
| **Marketing** | Content writing, review, scheduling social posts, promotions, reports | Old `social_post`, `promo_join`; publishing is `public_post` → dept manager; promotions touching price → boss |
| **Thiết kế** | Product images, banner sets per platform size, short videos | Provider interfaces `image.generate`, `video.generate`, `media.compose`; outputs to Drive + `artifacts`; this is where cross-department help requests matter most |
| **Kế toán** | Invoices, revenue, ledgers, tax reports | Everything tagged `money`/`tax` → boss at first. Needs real data sources (marketplace settlements, bank statements) and Vietnamese e-invoice rules; highest risk, do last |

Each real task recipe = a `TaskType` row (already data) + a worker recipe (prompt, tools, steps) + rule tags. The simulator's Vietnamese task texts show the intended scope and can be reused as test fixtures.

## 7. Boss instructions, skills, knowledge, permissions, audit, secrets

**Left**
- **Instructions and skills:** per company, department, role and employee; versioned; some stored **on a local computer** → a small local agent/sync that publishes them to the worker (or the worker runs on that computer); the boss edits text in the app or drops files in a folder.
- **Business knowledge:** products, prices and floor prices, shop reply rules, policies, FAQs; retrieval for workers; a "what did the worker read?" trace per task.
- **Audit log:** every action by every worker and human, immutable, searchable, exportable.
- **Per-agent permissions:** which tools, accounts, shops, amounts and data each employee may use; enforced on the worker side, displayed in the app.
- **Secrets:** platform tokens, provider keys, Telegram token.

**Prepared:** `config_audit` (structure and viewer are the seed of the audit log); capability-based roles (`RoleDef.caps`) extend naturally to tool permissions; approval rules as the human-in-the-loop layer; RPC-only writes; the rule that the browser holds only public values.

```sql
instructions (id, scope, scope_key, title, body_md, version, active, source text check (source in ('app','local_sync')), updated_by, updated_at)
skills       (id, key, title, description, body_ref, version, allowed_role_keys text[], allowed_employee_ids text[])
knowledge    (id, kind, title, body_md, source_ref, tags text[], embedding vector, updated_at)
permissions  (id, subject_kind, subject_key, resource_kind, resource_key, actions text[], limit_vnd)
audit_log    (id bigint identity pk, at, actor_kind, actor_id, action, entity, entity_id, task_id, before jsonb, after jsonb, meta jsonb)  -- append-only, no update/delete grants
```
**Secret handling rules (unchanged in spirit):** secrets never enter this repo, the browser, chat, `VITE_*` variables or any table the browser can select. They live in the worker's secret store (Supabase Vault / n8n credentials / OS keychain on the local computer). Tables store only a `secret_ref`. The service_role key exists only on the worker.

## 8. `SupabaseFeed` swap procedure (the 3D is not touched)

1. Migrations: `office_events`, `commands`, projections (§2), RLS (boss select; boss insert on `commands` with `with check`; nothing for anon; stylist nothing), realtime publication.
2. Implement `src/adapters/supabase/SupabaseFeed.ts` against `OfficeFeed`:
   - `start(config)`: build the snapshot by selecting the projection tables (or by replaying `office_events` since the last snapshot row) → `OfficeState`; return `seq`.
   - `subscribe`: realtime on `office_events` (`seq > lastSeq`), zod-validate, batch per animation frame; on reconnect, fetch the gap by `seq` (the reducer already ignores duplicates).
   - `send`: insert into `commands`; ack when the row is `accepted`; `CommandButton` follows the row status.
   - `now()`: server time offset; `connection()`: realtime state + heartbeat age.
3. Record a day of real events and run it through `ReplayFeed` in tests (contract test: every event validates, the reducer never throws, the director produces a plan for every person).
4. Set `VITE_FEED=supabase` for a preview; compare with the simulator side by side.
5. Follow `removing-the-simulator.md` (delete `src/adapters/sim/`, one registry line, the settings link). The `no-sim` CI job is the regression test.
6. Sim time disappears: the feed clock is wall time. Because domain code never called `Date.now()`, nothing else changes; idle behaviour (lunch nap, night rest) reads the same clock.

Files touched outside `src/adapters/**`: `src/office/feedRegistry.ts` (one line), settings (link removal). Nothing under `src/scene/**`, `src/domain/**` or the 2D features.

## 9. Runbook notes carried over
- **Supabase free tier pauses** after about 7 days idle. With real workers the heartbeat keeps it awake while the PC is on. PC off for a week → dashboard → Restore.
- **Google OAuth app stays in "Testing"** (only listed test users; `drive.readonly` is a restricted scope and publishing would need verification). The connected Google account must see the workers' Drive folder.
- **Workers only run while their machine is on.** The app shows "team offline" and queues commands. Moving the worker service to a VPS later: `docker compose` → repoint the Cloudflare Tunnel hostname. Nothing changes in this repo.
- **n8n repo:** it was planned against CONTRACT v0.2 (now archived) and is **no longer the worker runtime**. Useful n8n flows can remain as tools the worker service calls (webhooks), but nothing in the contract depends on n8n.

## 10. Expensive to change later (ranked)

| # | Built now | Why it is expensive later | How this plan reduces the risk |
|---|---|---|---|
| 1 | **Appearance schema + skeleton + shape-key names + palette convention** | Every garment, hair and animation is authored against them; changing the rig or a shape key means re-exporting the whole catalogue and migrating every saved look | Generators are scripts (re-runnable), `AppearanceV1.v` + `migrateAppearance`, unknown items fall back to defaults, the rig is chosen in a spike (P07a) before any garment is made |
| 2 | **Event envelope and event type names** | Stored forever in `office_events`; every worker and the reducer depend on them | Versioned envelope (`v`), unknown types skipped, payloads `.passthrough()`, additive-only rule, replay fixtures as contract tests |
| 3 | **`ApprovalLevel` = exactly three ordered levels** | Enum in SQL, rules, chain logic, pile visuals, Telegram buttons | Roles map to levels through capabilities, so more *roles* are free; a fourth *level* would be a major contract bump. Confirm three is right (question for the boss) |
| 4 | **ID scheme and stable keys** (`emp_`, `dep_`, slugs) | IDs spread into events, looks, audit rows, worker memory | Opaque prefixed strings from day one; keys immutable (enforced by `validateConfig`) |
| 5 | **Supabase role model + RLS + RPC-only writes** | Every later table follows the pattern; loosening it later is a security review of everything | Decided once in P09 with pgTAP tests; later tables copy the template |
| 6 | **Capability-based roles** | Engine, simulator and admin all read `caps`; renaming a capability touches all three | Small fixed capability list, documented; custom roles are data |
| 7 | **Feed time vs wall time** (domain never reads the clock) | If violated, the real feed shows wrong ages, aging and idle times, and the bug is spread thin | Lint rule + tests from P01; `now` only via the feed |
| 8 | **Scale, units, floor height, template grid** (metres, 4.0 m, 0.5 m cells) | All layouts, nav grids, furniture sizes and camera presets assume them | Fixed in `00-overview.md` §5.5 before any asset exists; templates are data |
| 9 | **Single-browser simulator (no shared sim state)** | If "everyone sees the same fake day" becomes a requirement, the sim must move server-side | `ReplayFeed` gives shared playback cheaply; the real feed makes it moot |
| 10 | **React 19 + R3F 9 + drei 10** | Major upgrades of the 3D stack touch every scene component | Pinned versions; scene logic (layout, nav, director) is pure TS with no three imports; only `render/` and `camera/` would change |
| 11 | **HashRouter URLs** (`#/office`, `#/queue`…) | Bookmarks, Telegram deep links later | Routes finalised in P11 with redirects from old hashes; moving off GitHub Pages later allows path routing with a redirect map |
| 12 | **Config table shapes** (columns vs `def jsonb`) | Workers will query them | Mixed model with promotion path (P09 D1); seed generated from JSON |

## 11. Suggested order for what comes next

1. **Scaffold the dedicated worker service** (decided runtime): repo, Supabase service-role access, shared `domain` package, `office_events` + `commands` tables.
2. **Feed swap skeleton:** `office_events` + `commands` + `SupabaseFeed`, driven by a trivial worker that replays simulator output into Supabase. Proves the pipe end to end with zero AI.
3. **Manager + one department end to end** (Customer Service review replies on one Shopee shop): real intake in-app text → real task → real draft → reviewer → boss approval → post. Includes the first platform adapter, the ledger and budgets.
4. **Telegram** text, then voice; approvals mirrored.
5. **Instructions, knowledge, permissions, audit log** (needed before giving workers more reach).
6. **Marketing + Design** with Drive media and cross-department help.
7. **More platforms and the merged inbox**, in the order the boss ranks them; order creation from chat.
8. **Accounting** last.
9. Remove the simulator (or keep it as a demo mode behind a flag, the boss's choice).
