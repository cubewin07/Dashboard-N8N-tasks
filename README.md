# AI Office

A 3D low-poly company building in the browser where AI employees are characters: they walk, work at desks, queue for approvals, chat, sleep and play. Each department has a floor, the boss floor is on top, and a simulator drives everything until real AI workers are connected. Phones get a 2D view (Sơ đồ, Duyệt, Hoạt động, Tủ đồ) with 3D on request. The UI is Vietnamese, with English in Cài đặt.

Live: https://cubewin07.github.io/Dashboard-N8N-tasks/

## Showing it

Follow [`docs/plan/demo-script.md`](docs/plan/demo-script.md): ten minutes, starting with **Chế độ trình diễn**, a guided tour that runs by itself.

## Plan and status

**The current plan is [`docs/plan/`](docs/plan/00-overview.md).** Phases P00–P11 are built. What was built differently and what comes next (real AI workers, Telegram, platforms): [`docs/plan/after-this-phase.md`](docs/plan/after-this-phase.md). Release review and human test checklist: [`docs/plan/release-checklist.md`](docs/plan/release-checklist.md). `docs/archive/` is history.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173/Dashboard-N8N-tasks/
npm run typecheck && npm run lint && npm run test && npm run build
npm run test:e2e   # Playwright, desktop + 375 px phone
```

Without Supabase env values the app runs on local config and the demo accounts shown on the login page. With `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (public values only) it uses real logins: see [`docs/plan/runbook-supabase.md`](docs/plan/runbook-supabase.md).

Stack: TypeScript, React 19, Vite, three.js via React Three Fiber + drei, Zustand, zod, Tailwind v4 + shadcn/ui, Supabase. Agent rules: [`AGENTS.md`](AGENTS.md). Work lands as stacked PRs: [`docs/plan/stacked-prs.md`](docs/plan/stacked-prs.md). Asset credits: in the app under Cài đặt → Giới thiệu → Ghi công, and [`art/LICENSES.md`](art/LICENSES.md).
