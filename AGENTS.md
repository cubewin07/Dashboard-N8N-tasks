# AGENTS.md

Guidance for any coding agent (Claude Code, Codex, Cursor…) working in this repository.

## What this repo is

The **boss dashboard** for a team of AI "employees" that run 7 online shops (Shopee, TikTok Shop, Lazada, Zalo, Facebook).

- **This repo = React dashboard + Supabase schema. Nothing else.**
- **All work happens in n8n** (separate repo, runs on a Windows PC behind a Cloudflare Tunnel): Telegram, LLM calls, shop platforms, Google Drive, image/video generation, retries, watchdogs.
- **The dashboard only talks to Supabase** (reads state, subscribes to realtime, inserts rows into `commands`), **plus read-only Google Drive** to preview media. It never calls n8n, Telegram or any shop API.
- Live URL: https://cubewin07.github.io/Dashboard-N8N-tasks/ (repo `cubewin07/Dashboard-N8N-tasks`).
- **UI language: Vietnamese by default** (English as a secondary switch).
- The boundary between the two repos is `docs/CONTRACT.md`. Treat it as an API: if you change a table, enum or payload, bump the contract version and list the change at the top of that file.

Read before working: `docs/PLAN.md` (architecture + phases), `docs/CONTRACT.md` (schema + commands), `docs/LAYOUT.md` (screens + design), `docs/EMPLOYEES.md` (what the employees and workflows are, as data to display).

## Stack

React 18 · Vite · TypeScript (strict) · Tailwind CSS v4 · shadcn/ui (Radix) · TanStack Query · supabase-js v2 · React Router **HashRouter** · date-fns-tz · lucide-react · motion · Google Identity Services (OAuth2 token flow) + Drive REST v3 via `fetch`
Hosting: GitHub Pages (static, served from a repo subpath) via GitHub Actions.
DB: Supabase (Auth, Postgres, RLS, Realtime; no Storage, media lives in Google Drive). Migrations in `supabase/migrations/`, applied from the Mac with the Supabase CLI.

## Commands

```bash
npm install
npm run dev          # local dev server
npm run build        # typecheck + production build into dist/
npm run lint
npm run typecheck
npm run test         # vitest
supabase migration new <name>   # create a migration
supabase db push                # apply migrations (Mac only, by the human)
supabase gen types typescript --linked > src/lib/database.types.ts
```

## Repo layout

```
supabase/migrations/   SQL migrations, numbered, never edited after being applied
supabase/seed.sql      employees, workflows, workflow_steps (the definitions n8n reads)
src/app/               router, providers, AuthGuard, RealtimeProvider
src/features/<area>/   overview, inbox, tasks, start, library, team (pages + hooks + local components)
src/components/ui/     shadcn components (generated; edit sparingly)
src/components/        shared domain components (StatusPill, StepDots, EmployeeAvatar, LiveBadge…)
src/lib/               supabase.ts, commands.ts, time.ts, drive.ts, database.types.ts
src/i18n/              vi.ts (default, source of truth), en.ts, index.ts
docs/                  plan, contract, layout, employees, open questions
```

## Hard rules (security & architecture)

1. **Only public values in the browser.** The only env vars are `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_GOOGLE_CLIENT_ID`. Never add a service_role key, n8n URL, webhook secret, Google client secret or any other key to this repo or to `VITE_*` vars.
2. **Google Drive is read-only and token-in-memory.** Use the GIS token flow with scope `https://www.googleapis.com/auth/drive.readonly`. Keep the access token in memory (React context) only. Never persist it to localStorage, sessionStorage, cookies or Supabase. Never write to Drive from the dashboard. Media is never stored in Supabase.
3. **The browser never writes state.** The only allowed write is `INSERT INTO commands` through the typed helpers in `src/lib/commands.ts`. Never `update`/`delete` tasks, approvals, employees, etc. from the client. n8n applies every change.
4. **Auth gate + RLS on every table.** Every route except `/login` is behind `AuthGuard` (Supabase Auth, email + password, no sign-up UI). Every new table needs, in the same migration: `enable row level security`, a boss-only `select` policy (`exists (select 1 from app_admins where user_id = auth.uid())`) and nothing for `anon`. `commands` is the only table with an `insert` policy (and a `with check`).
5. **Secrets stay out of git.** Only `.env.example` with empty values gets committed. Never ask the human to paste a secret into chat. Tell them where to put it.
6. **Timestamps:** store `timestamptz` (UTC). Display through `src/lib/time.ts` (`vi-VN`, `Asia/Ho_Chi_Minh`). Never use `toLocaleString()` without the timezone.
7. **All UI text lives in `src/i18n/vi.ts`** (default language). `en.ts` must have the same keys (enforced by type). No hard-coded user-facing strings in components. DB stores keys, and labels come from i18n. Write natural Vietnamese with full diacritics, not machine-literal translations.
8. **GitHub Pages compatibility:** use HashRouter, keep Vite `base: '/Dashboard-N8N-tasks/'`, use relative asset imports, and no server-only features.
9. **Seed data via migrations.** Starter employees, workflows, steps and shops are inserted by migrations (idempotent `insert … on conflict do nothing`). The UI must handle any number of rows, plus workflows that are not yet linked to n8n (`n8n_workflow_ref is null` → shown as "Chưa kết nối" and not startable).
10. **Realtime is required, not optional.** Any screen showing live state must update without a refresh, and the global `LiveBadge` must reflect the connection state. On reconnect, invalidate queries.

## Coding conventions

- Data access lives in feature hooks (`useTasks`, `useEmployees`…) built on TanStack Query. Components stay presentational.
- Realtime events patch the query cache centrally in `RealtimeProvider`. Don't open ad-hoc channels in components.
- Generate DB types and use them (`Tables<'tasks'>`). No `any`.
- Commands: every action button uses `CommandButton`, which shows *sending → queued → applied / failed*, driven by the command row's realtime `status`. Show "Queued: team offline" when the n8n heartbeat is stale.
- Status, colour and label mappings live in one place (`src/lib/status.ts`). Never re-derive them per component.
- Accessible by default: semantic HTML, labelled inputs, visible focus, keyboard reachable, `prefers-reduced-motion` respected.
- Follow the design tokens in `docs/LAYOUT.md` (Be Vietnam Pro, warm neutrals, jade accent, status colours, per-employee tints). Don't introduce new colours ad hoc. Add them as tokens.
- Keep components small. Co-locate feature code. Avoid premature abstractions.

## Migrations

- One concern per migration, named `NNNN_description.sql`. Never edit an applied migration. Add a new one instead.
- Each migration must include RLS policies, realtime publication changes (`alter publication supabase_realtime add table …`) and indexes for the queries the dashboard runs.
- Changing anything n8n reads or writes = a contract change → update `docs/CONTRACT.md`.
- The agent writes migrations. **The human runs `supabase db push`.** Give exact instructions.

## Working process

- Work in the phase order in `docs/PLAN.md`. **Stop at the end of each phase** with a short test checklist for the human.
- Make design decisions yourself and record notable ones briefly in `docs/PLAN.md` → "Key decisions". Ask only when a missing decision truly blocks the work.
- For anything the human must do manually (Supabase dashboard, GitHub Pages, secrets), give click-by-click steps.
- Definition of done for a change: `npm run typecheck && npm run lint && npm run build` pass, no hard-coded strings (Vietnamese in `vi.ts`, matching key in `en.ts`), no new table without RLS, realtime works for affected screens, and the change looks right on mobile width (375px).
- Commit only when asked. Never commit `.env*` files except `.env.example`.
