# Boss Dashboard: Implementation Plan

> Scope of **this repo**: the boss dashboard (React) + the Supabase schema it reads.
> n8n workflows live in a separate repo. The two meet only at the Supabase contract (`docs/CONTRACT.md`).

Related docs:
- `docs/EMPLOYEES.md`: the AI employee specs (roles, scope, steps, autonomy)
- `docs/LAYOUT.md`: screens, layout, design direction
- `docs/CONTRACT.md`: tables, enums, realtime channels, command flow (the contract with n8n)
- `docs/OPEN-QUESTIONS.md`: decisions I still need from you

---

## 1. Architecture (inside your constraints)

Live URL: **https://cubewin07.github.io/Dashboard-N8N-tasks/** (repo `cubewin07/Dashboard-N8N-tasks`, public).

```
 ┌──────────────┐  anon key + boss JWT   ┌──────────────────────────────┐
 │  Dashboard   │ ─────── read ────────▶ │          Supabase            │
 │ (GitHub Pages│ ◀──── realtime ─────── │  Auth + Postgres + RLS       │
 │  React SPA)  │ ── insert `commands` ─▶│  Realtime                    │
 └──────┬───────┘                        │  Vault (n8n shared secret)   │
        │ Google OAuth2 (read-only,      └──────┬──────────────▲────────┘
        │ token in memory)  DB webhook on new command│         │ service_role writes
        ▼                   header X-Boss-Secret     ▼         │ (tasks, steps, artifacts…)
 ┌──────────────┐                        ┌─────────────────────┴────────┐
 │ Google Drive │ ◀──── uploads files ── │ n8n (Windows PC, CF Tunnel)  │──▶ Telegram, LLM,
 │ (all media)  │                        └──────────────────────────────┘    shop platforms
 └──────────────┘
```

### Key decisions (short reasons)

| # | Decision | Why |
|---|----------|-----|
| D1 | **The browser never writes state directly.** It can only `INSERT` into `commands` (approve, reject, start workflow, set autonomy…). n8n carries out every state change. | Covers "no privileged writes from the browser". Telegram buttons produce the same `commands` rows, so approvals behave the same from either place. |
| D2 | **Command delivery:** a Postgres trigger (`pg_net`) POSTs each new command to the n8n webhook. The shared secret is kept in **Supabase Vault** and sent as the `X-Boss-Secret` header. n8n checks the header, then also re-reads the row with service_role. | The secret never reaches the browser. If the PC is off, commands stay `pending`, and n8n picks them up on boot with a sweep: `status='pending'`. Nothing gets lost. |
| D3 | **One logging mechanism:** n8n has a single sub-workflow, `log_step`, that upserts `task_steps` and appends to `events`. The dashboard reads only those tables. | A step that never calls `log_step` shows up as a gap in the stepper. That makes the bug visible. |
| D4 | **Workflow definitions live in the DB** (`workflows`, `workflow_steps`). n8n reads them; the dashboard renders them before a run starts. | Steps are fixed and visible, and the "preview before start" screen comes from the same source n8n uses. |
| D5 | **Heartbeat row** (`system_status`): n8n updates it every 60s. If it is more than 3 min old, the dashboard shows "Team offline (PC is off)". | Explains silent periods so they don't look like a broken app. |
| D6 | **All images and videos live only in Google Drive.** n8n uploads them and writes an `artifacts` row (`drive_file_id`, mime, size…). The dashboard has a **"Connect Google Drive"** button that uses Google OAuth2 in the browser (Google Identity Services *token* flow, scope `drive.readonly`). Only the public OAuth **Client ID** is configured. There is no client secret, and the access token is kept **in memory only** (never in Supabase or localStorage) and silently re-requested when it expires. Images load as `files/{id}?alt=media` blobs or via `thumbnailLink`. Videos play in the Drive preview iframe (`/file/d/{id}/preview`). Every item has "Open in Drive". | You chose Drive as the only media store. Supabase stays small (free tier), and the token never leaves the browser. Read-only scope means the dashboard can't damage Drive. |
| D7 | **Watchdog:** n8n runs a cron every 5 min. Any step `running` longer than its `timeout_minutes` becomes `stuck` with a reason, and the boss gets a Telegram alert. | Nothing fails silently. |
| D8 | **HashRouter** (`/#/tasks/123`) and Vite `base: '/<repo>/'`. | GitHub Pages serves from a subpath and has no SPA fallback. HashRouter avoids the 404.html workaround. |
| D9 | **Vietnamese is the default UI language.** All text lives in `src/i18n/vi.ts` (source of truth, typed keys). `en.ts` must have the same keys, and a language switch sits in Settings. DB rows store keys (`role_key`, `step.key`). Display labels come from i18n, with a fallback to the DB `label`. Dates are stored UTC and rendered with `Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })`. | Your dad uses it. Text stays in one place, so English is a switch rather than a rewrite. |
| D10 | **Login page with Supabase Auth (email + password).** Every route except `/login` sits behind an `AuthGuard`. **RLS:** every table is `SELECT`-only for `authenticated` users whose `auth.uid()` is listed in `app_admins`. `commands` additionally allows `INSERT` with a `WITH CHECK` on type/payload. `anon` gets nothing. Public sign-ups are **disabled**, and the boss user is created in the Supabase dashboard. Includes a "Forgot password" email flow. | One boss login. Logged-out visitors see nothing. |
| D11 | **Starter data is seeded in the first migrations**: 7 employees, 6 workflows with their fixed steps, and 5 placeholder shops (Shopee ×3, Lazada ×1, TikTok Shop ×1). Later additions come from new migrations or n8n upserts (same tables). Each workflow has a nullable `n8n_workflow_ref` (n8n workflow ID or webhook path), so n8n can link its implementation to it. The dashboard shows a workflow as **"Not connected yet"** until n8n fills that field and sets `enabled = true`. | Start simple and grow without changing the dashboard. |

### Dashboard stack

- **React 18 + Vite + TypeScript**
- **Tailwind v4 + shadcn/ui** (Radix primitives, accessible). Skills for both are already installed in this repo.
- **TanStack Query** for server state; Supabase Realtime events patch the query cache
- **supabase-js v2** (auth, queries, realtime, storage signed URLs)
- **React Router (HashRouter)**, **date-fns-tz**, **lucide-react** icons, **motion** for subtle transitions
- **Google Identity Services** (`accounts.google.com/gsi/client`) + Drive REST v3 via `fetch` (no heavy gapi client)
- Deploy with a **GitHub Actions** workflow that builds `/dist` and publishes to Pages. `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_GOOGLE_CLIENT_ID` come from repo **variables** (all three are public by design and are not secrets).

### Repo layout

```
/supabase/migrations/     SQL migrations (run from the Mac via Supabase CLI)
/supabase/seed.sql        employees, workflows, workflow_steps, shops
/src
  /app                    router, providers, auth guard, realtime provider
  /features
    /overview             Team floor
    /inbox                Needs you (approvals, blocked, questions)
    /tasks                list + task detail (stepper, history)
    /start                Start work wizard
    /library              produced files
    /team                 employee profiles + autonomy
  /components/ui          shadcn components
  /components             StatusPill, StepDots, EmployeeAvatar, LiveBadge, TimeAgo…
  /lib                    supabase.ts, commands.ts (typed command senders), time.ts, drive.ts (OAuth + Drive fetch)
  /i18n                   vi.ts (default, all strings), en.ts, index.ts
/docs
.env.example              VITE_SUPABASE_URL=, VITE_SUPABASE_ANON_KEY=, VITE_GOOGLE_CLIENT_ID=
```

---

## 2. Phases (stop after each one so you can test)

### Pre-phase ✅ (done): planning
- Docs (`PLAN`, `CONTRACT`, `EMPLOYEES`, `LAYOUT`, `OPEN-QUESTIONS`), `AGENTS.md`, `CLAUDE.md`, `.gitignore`, `.env.example`. Committed and pushed.

### Phase 0: Foundations (½ day of your time for setup)
- Scaffold Vite app, tokens, Vietnamese i18n, app shell, **login page (Supabase Auth)**, GitHub Pages deploy via Actions.
- Migrations: core tables, enums, RLS, realtime publication, `commands` webhook trigger, **starter seed** (employees, workflows + steps, placeholder shops).
- **You:** create the boss user in Supabase, disable sign-ups, link the CLI and run `supabase db push`, add repo variables, enable Pages (source: GitHub Actions).
- ✅ Test: open https://cubewin07.github.io/Dashboard-N8N-tasks/. Logged out you see only the Vietnamese login page. Logged in you see the app shell with 7 employee cards (idle) and a green **Trực tuyến** (Live) badge.

### Phase 1: Receptionist + Review replies, full round trip
- Dashboard: Overview (employee cards live), Inbox (approve / request changes / reject), Task detail stepper, Start work (review_reply only), offline/disconnected banners.
- Contract: `commands` webhook trigger + Vault secret, `log_step` spec for the n8n side.
- n8n side (other repo): Thu (Telegram voice/text → task), Linh + An pipeline, approvals on Telegram.
- ✅ Test: voice note "reply to new reviews on Shop A" → Thu confirms → Linh's card goes *Working* live → approval shows in Inbox **and** Telegram → approve in one place → the other updates → replies posted → task *Done*.

### Phase 2: The other workers
- Mai (chat), Ha + Vy (posts), Bao + An (promos). Start-work wizard for all workflows. Team page with the autonomy switch. Daily standup view.
- **Connect Google Drive** (OAuth2 button in Settings and top bar). Image previews inside approvals (e.g. post image).
- **You:** create a Google Cloud OAuth Client ID (click-by-click steps provided), add yourself as a test user, add `VITE_GOOGLE_CLIENT_ID`.
- ✅ Test: each workflow end to end once, with one of them switched to "works alone". Approve a post while seeing its Drive image.

### Phase 3: Outputs & Library
- Library over `artifacts` rows: Drive thumbnails, filters (shop / workflow / type / date), image lightbox, video in the Drive preview player, "Open in Drive".
- ✅ Test: n8n produces a banner set → all sizes appear in the Library live → open in Drive.

### Phase 4: Polish
- English translation (switch), keyboard shortcuts, mobile layout pass, empty states, runbook (Supabase pause, moving n8n to a VPS).

---

## 3. Runbook notes (to be expanded)
- **Supabase free tier pauses after about 7 days without activity.** The n8n heartbeat writes every minute, which keeps it awake while the PC is on. If the PC is off for more than a week: Supabase dashboard → project → **Restore**.
- **Google OAuth app in "Testing" mode:** only listed test users can connect, which is what we want. `drive.readonly` is a restricted scope, so publishing the app would need Google verification. Stay in Testing. The Google account you connect must be able to see the n8n Drive folder (same account, or the folder shared with it).
- **n8n only runs while the PC is on.** The dashboard shows "Team offline" and queues commands. To move to a VPS later: export workflows → `docker compose` on a VPS → point the Cloudflare Tunnel hostname at it. Nothing changes in this repo.
