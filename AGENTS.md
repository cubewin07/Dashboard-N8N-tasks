# AGENTS.md

Guidance for any coding agent (Claude Code, Codex, Cursor…) working in this repository.

> **The current plan is `docs/plan/` and nothing else.** Start at `docs/plan/00-overview.md`, then read the phase file for your task. `docs/archive/` is history: never implement from it.

## What this repo is

**AI Office**: a 3D low-poly company building in the browser where AI employees are characters (walking, working, queueing, chatting, sleeping, playing), plus a 2D fallback for phones (org list, approval queue, activity feed, wardrobe).

- A **simulator** drives the building now. A dedicated worker service with real AI will drive it later through the same contract (`docs/plan/contracts.md`). The 3D code must never know which one is behind it.
- This repo = React app + config data + (from P09) Supabase schema. No AI calls, no platform APIs, no Telegram here.
- Live URL: https://cubewin07.github.io/Dashboard-N8N-tasks/ (repo `cubewin07/Dashboard-N8N-tasks`).
- **UI language: Vietnamese by default** (English as a secondary switch).

Read before working: `docs/plan/00-overview.md` (architecture, conventions, interface register §7, definition of done §6), `docs/plan/data-model.md`, `docs/plan/contracts.md`, your `docs/plan/phase-NN-*.md`, and `docs/plan/stacked-prs.md`.

## Stack

TypeScript (strict) · React 19 · Vite · three.js via React Three Fiber 9 + drei 10 · Zustand (office store) · zod · TanStack Query · Tailwind CSS v4 · shadcn/ui (Radix) · React Router **HashRouter** · date-fns-tz · lucide-react · motion · Vitest · Playwright · Supabase (Auth, Postgres, RLS, Realtime; from P09) · Blender headless + glTF-Transform for assets.
Hosting: GitHub Pages (static, served from a repo subpath) via GitHub Actions.

## Commands

```bash
npm install
npm run dev              # local dev server
npm run build            # typecheck + production build into dist/
npm run lint
npm run typecheck
npm run test             # vitest unit tests
npm run test:coverage    # vitest with coverage thresholds (src/domain >= 90%)
npm run test:e2e         # playwright desktop + phone E2E tests
npm run content:validate # validate src/content/*.json against OrgConfigSchema
# added by the phases that introduce them (see docs/plan/testing.md, assets.md):
# npm run catalog:validate · art:build · assets:optimize · assets:check · perf:check
```

## Repo layout

Target layout: `docs/plan/00-overview.md` §2.4. Short form:

```
src/domain/     PURE business rules, events, commands (no React, no three, no Date.now)
src/ports/      interfaces: OfficeFeed, ConfigSource, AppearanceStore, AuthPort
src/adapters/   sim/ (removable simulator) · local/ · replay/ · supabase/ (P09)
src/office/     zustand store + feed registry: the ONLY thing UI and 3D read
src/scene/      3D: layout/ nav/ director/ (pure TS) · render/ characters/ camera/ (r3f)
src/features/   2D screens (office overlays, org, queue, activity, wardrobe, admin)
src/content/    config as data (org seed, roles, rules, platforms, floor templates, catalogue)
public/assets/  GLBs, palette, animation library, thumbnails, fonts
art/            Blender generator scripts, style guide, licence ledger
docs/plan/      the plan (current) · docs/archive/ (history)
```

## Hard rules

1. **Only public values in the browser.** The only env vars are `VITE_*` public values (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_CLIENT_ID`, feature flags). Never a service_role key, webhook secret or provider key.
2. **Google Drive is read-only and token-in-memory** (frozen Library code; unchanged rule).
3. **Writes** (`docs/plan/contracts.md` §5): operational state changes only through `OfficeFeed.send(Command)`. Config and appearance go through `ConfigSource` / `AppearanceStore` (role-checked RPCs on Supabase). No other writes.
4. **Auth gate + RLS on every table.** Roles: `boss` (everything) and `stylist` (appearance only). No sign-up UI. Every new table gets RLS in the same migration; nothing for `anon`; no direct insert/update/delete policies.
5. **Secrets stay out of git and out of chat.** Only `.env.example` with empty values is committed.
6. **Time:** domain timestamps are feed time (ISO, UTC). Display through `src/lib/time.ts` (`vi-VN`, `Asia/Ho_Chi_Minh`). Domain code never calls `Date.now()`.
7. **All UI text lives in `src/i18n/vi/*`**, with identical keys in `en`. Data-defined names (departments, roles, platforms, items) carry `label: {vi, en}` in config. Natural Vietnamese with full diacritics.
8. **GitHub Pages compatibility:** HashRouter, Vite `base: '/Dashboard-N8N-tasks/'`, asset URLs through `import.meta.env.BASE_URL`, no server-only features.
9. **Config is data.** Departments, roles, employees, specialties, platforms, approval rules, caps, floor templates and wardrobe items live in `src/content/` (seeded to Supabase from P09). Adding one must not need a code change.
10. **Boundaries (lint-enforced):** UI and 3D read only `src/office`. Nothing imports `src/adapters/**` except the registry files. The simulator lives only in `src/adapters/sim/` and must stay removable.
11. **3D rules:** metres, +Y up, one `<Canvas>` (the wardrobe preview is the single exception), no per-frame React state, no per-character DOM overlays, budgets in `docs/plan/performance.md`.
12. **Assets:** CC0 or CC-BY 4.0 only, every file listed in `art/LICENSES.md` and `public/assets/credits.json`, palette-texture style per `docs/plan/assets.md`. AI-generated models are allowed (agent-written Blender generator scripts, or a text/image-to-3D tool) under the same rules: licence recorded, palette style, budgets.
13. **Live state updates without refresh**, and the global `LiveBadge` reflects the feed connection.

## Coding conventions

- Components stay presentational; state comes from `src/office` hooks and selectors.
- Generate and use types; no `any`. Validate external data with zod at the edge.
- Status/colour/label mappings live in one place. UI colours only from tokens in `src/index.css`; 3D colours from the palette.
- Accessible by default: semantic HTML, labelled inputs, visible focus, keyboard reachable, `prefers-reduced-motion` respected. Every 3D-only fact is also available in 2D.
- Keep components small. Co-locate feature code. Avoid premature abstractions.

## Working process

- Work in stacked PRs, one branch per phase (`docs/plan/stacked-prs.md`). Commit in small meaningful steps; start commit subjects with the task ID where one applies (`feat(domain): P03-T02 …`).
- Definition of done: `docs/plan/00-overview.md` §6. In short: typecheck, lint, test, build and e2e pass; the branch runs on its own and shows the phase demo; no hard-coded strings; contract changes bump the version.
- **Stop at the end of each phase** with a short test checklist for the human.
- Make design decisions yourself and record them in the phase file's "Design choices" with the date. Ask only when a missing decision truly blocks the work.
- For anything the human must do manually (Supabase dashboard, GitHub settings, secrets), give click-by-click steps.
