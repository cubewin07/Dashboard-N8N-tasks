# Dashboard ⇄ n8n Contract (via Supabase)

Version: **v0.2 (draft)**. Changes require bumping the version and updating both repos.
All timestamps are `timestamptz` in UTC. IDs are `bigint identity` unless noted.

### Changelog
- **v0.2:** Media lives only in Google Drive: removed `artifacts.thumb_path` and the Storage bucket, and added Drive metadata columns. Added `workflows.n8n_workflow_ref`. Employees use `role_key` (labels come from dashboard i18n). Starter rows are seeded by migrations.
- **v0.1:** Initial draft.

## Who writes what

| Table | Dashboard (boss JWT) | n8n (service_role) |
|-------|---------------------|--------------------|
| `commands` | INSERT, SELECT | SELECT, UPDATE status |
| all other tables | SELECT only | full |

## Tables (summary)

```
app_admins      (user_id uuid pk)                                  -- who counts as "boss"
shops           (id, name, platform enum(shopee|lazada|tiktok_shop), handle, reply_rules text, active bool)
employees       (key text pk: thu|mai|linh|ha|vy|an|bao, name, role_key, color, scope text[],
                 status emp_status, current_task_id, current_step_key, autonomy autonomy_mode,
                 status_since timestamptz)
workflows       (key text pk, name, icon, description, enabled bool,
                 n8n_workflow_ref text null)      -- set by n8n when its implementation is linked
workflow_steps  (workflow_key, position int, key, label, owner_key, kind step_kind,
                 risky bool, timeout_minutes int, allowed_owner_keys text[])
tasks           (id, workflow_key, shop_id, brief, require_approval bool, status task_status,
                 source enum(telegram|dashboard|schedule), current_step_key,
                 blocked_reason text, created_at, updated_at, finished_at)
task_steps      (id, task_id, step_key, position, owner_key, status step_status,
                 summary text, output jsonb, started_at, finished_at, error text, attempt int)
approvals       (id, task_id, step_key, kind enum(approval|question), title, payload jsonb,
                 status enum(open|approved|changes_requested|rejected|answered|expired),
                 resolved_via enum(dashboard|telegram), resolved_at, note)
artifacts       (id, task_id, shop_id, workflow_key, owner_key, type enum(image|video|text),
                 title, drive_file_id, drive_url, drive_folder_id, mime, size_bytes,
                 width, height, duration_sec, provider, created_at)
events          (id, at, task_id, actor text, type text, message text, data jsonb)  -- append-only
commands        (id uuid, created_at, created_by uuid default auth.uid(),
                 type command_type, payload jsonb, status enum(pending|accepted|applied|failed),
                 result text, processed_at)
system_status   (id=1, n8n_heartbeat_at, n8n_version, note)
```

### Enums
- `emp_status`: idle, working, waiting_boss, blocked
- `task_status`: queued, running, waiting_boss, blocked, done, failed, cancelled
- `step_status`: pending, running, done, failed, stuck, skipped
- `step_kind`: work, qc, approval
- `autonomy_mode`: ask_first, works_alone
- `command_type`: start_task, approve, request_changes, reject, answer, reassign, set_autonomy, retry_step, cancel_task

## Command payloads

| type | payload |
|------|---------|
| `start_task` | `{workflow_key, shop_id, brief?, require_approval}` |
| `approve` | `{approval_id, edits?: {...}}` |
| `request_changes` | `{approval_id, note}` |
| `reject` | `{approval_id, note?}` |
| `answer` | `{approval_id, answer}` |
| `reassign` | `{task_id, step_key, to_owner_key}` |
| `set_autonomy` | `{employee_key, autonomy}` |
| `retry_step` / `cancel_task` | `{task_id, step_key?}` |

Delivery: an `AFTER INSERT` trigger on `commands` calls `net.http_post(<n8n webhook url>, headers: {X-Boss-Secret: vault('n8n_secret')}, body: {command_id})`.
n8n: verify the header → load the row via service_role → `accepted` → apply → `applied` / `failed` (with `result`).
On startup, n8n processes every command still `pending`.
**Idempotency:** an approval that is already resolved returns `failed: "already resolved via telegram"`. This prevents a double approval from Telegram and the dashboard.

## `log_step` (n8n sub-workflow, the only way steps are written)
Input: `{task_id, step_key, status, summary?, output?, error?}`.
Effects, in one RPC (`log_step` SQL function, `security definer`, called with service_role):
1. upsert `task_steps`
2. update `tasks.current_step_key/status` and `employees.status/current_task_id/current_step_key`
3. insert into `events`

## Realtime
Publication `supabase_realtime` includes: `employees, tasks, task_steps, approvals, artifacts, events, commands, system_status`.
The dashboard subscribes to one channel and patches the TanStack Query cache. On reconnect it refetches everything.

## Seed data (owned by this repo's migrations)
- `employees`: the 7 employees from `docs/EMPLOYEES.md`, all `idle`, `ask_first`
- `workflows` + `workflow_steps`: the 6 workflows with fixed steps, `enabled = false`, `n8n_workflow_ref = null`
- `shops`: 5 placeholder shops: Shopee ×3, Lazada ×1, TikTok Shop ×1 (real store names filled in later by SQL or n8n upsert)

n8n may later **upsert** into `shops`, `workflows` and `workflow_steps` (e.g. to set `n8n_workflow_ref` and `enabled = true`). New workflows can be added by migration or by n8n. The dashboard renders whatever exists.

## Media (Google Drive only)
- n8n uploads every file to Drive at `/AI Team/{Shop}/{workflow}/{YYYY-MM-DD}/{task#}-{name}.{ext}` and inserts an `artifacts` row. **No media is stored in Supabase.**
- The dashboard reads files directly from Drive with the boss's own Google OAuth token (`drive.readonly`, browser-only, in memory).
- Requirement on the n8n side: the Drive folder must be readable by the Google account the boss connects in the dashboard.
