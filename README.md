# AI Office

A 3D low-poly company building in the browser where AI employees are characters: they walk, work at desks, queue for approvals, chat, sleep and play. Each department has a floor, the boss floor is on top, and a simulator drives everything until real AI workers are connected. Phones get a 2D view (org list, approval queue, activity feed, wardrobe).

Live: https://cubewin07.github.io/Dashboard-N8N-tasks/

## Plan

**The current plan is [`docs/plan/`](docs/plan/00-overview.md).** Everything in `docs/archive/` is history.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173/Dashboard-N8N-tasks/
npm run typecheck && npm run lint && npm run build
```

Stack: TypeScript, React, Vite, three.js via React Three Fiber + drei, Zustand, Tailwind + shadcn/ui. Agent rules: [`AGENTS.md`](AGENTS.md). Work lands as stacked PRs: [`docs/plan/stacked-prs.md`](docs/plan/stacked-prs.md).
