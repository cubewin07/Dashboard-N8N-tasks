# MVP UI notes (mock data, no backend)

Goal: a clickable UI for the boss to approve **before** wiring Supabase and Google. Branch `feat/mvp-ui`.

## How the mock works
- `src/lib/mock/seed.ts` holds demo rows shaped exactly like `docs/CONTRACT.md` (7 employees, 6 workflows, 5 shops, tasks in every state, approvals, artifacts, events).
- `src/lib/mock/store.ts` is an in-memory stand-in for **Supabase + n8n**:
  - reads (`read.*`) are what `src/lib/api.ts` calls;
  - `subscribe()` emits a table name on each change. `RealtimeProvider` invalidates `[table]` queries, just as it will on Supabase realtime events;
  - `insertCommand()` is the only write. A fake n8n moves it `pending → accepted → applied/failed` and applies the effect (approve, reject, start task…);
  - a simulator moves one running task forward every ~9 s, so the team looks alive;
  - demo controls (Settings → Chế độ demo): team offline (stale heartbeat, commands stay queued), realtime reconnecting/offline.
- Login accepts any email plus a password of 6+ characters. "Connect Google Drive" is simulated, and previews are generated placeholder images (`src/lib/drive.ts`).

## Swapping in the real backend later (Phase 0+)
Only these files change: `src/lib/api.ts` (supabase selects), `src/lib/commands.ts` (insert into `commands`), `src/app/RealtimeProvider.tsx` (one supabase channel), `src/app/auth.tsx` (Supabase Auth), `src/app/drive.tsx` + `src/lib/drive.ts` (GIS token flow + Drive fetch). Screens and hooks stay as they are.

## Key decisions taken in the MVP (to copy into PLAN.md "Key decisions")
- **i18n split per feature:** `src/i18n/vi.ts` / `en.ts` aggregate `src/i18n/{vi,en}/<feature>.ts`. `en` files are typed `typeof vi`, so keys must match. This lets features be built in parallel without editing one giant file.
- **Shared query hooks** live in `src/hooks/queries.ts`. Query keys start with the table name, so realtime can invalidate by prefix.
- **Inbox deep links:** `#/inbox?item=approval-<id>` or `#/inbox?item=task-<id>`.
- **Event lines:** when `events.data` is null, show `events.message` as written by n8n. Otherwise build the line from `type` + `data.step_key` with i18n templates.

## Proposed contract additions (v0.3, not applied yet)
1. `approvals.created_at timestamptz default now()`: the Inbox shows "4 phút trước" and sorts by it.
2. `approvals.payload` shapes (see `src/lib/payloads.ts`): `review_replies`, `images` (artifact ids), `post`, `question`, `generic`, each with `prepared_by` / `checked_by`.
3. `events.data.step_key` for step events, so the dashboard can render localized lines.
