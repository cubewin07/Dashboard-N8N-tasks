# Testing

Goal: the parts that are hard to see with your eyes (rules, queues, contracts, layout, paths, determinism) are covered by fast tests; the parts you *can* see (3D look, motion) are covered by a few smoke tests, screenshots and a human checklist.

## 1. Layers

| Layer | What it covers | Where | Tool |
|---|---|---|---|
| **Unit: domain** | reducer (every event type), approval rule engine, priority + aging, staffing cap/drop order, help-request rounds/timeouts, selectors | `src/domain/__tests__/` | Vitest (node) |
| **Unit: layout** | floor order, boss on top, annexes, desk generation, seat allocation | `src/scene/layout/__tests__/` | Vitest |
| **Unit: nav** | grid from layout, A* (shortest, blocked, unreachable), route graph across floors, elevator scheduler | `src/scene/nav/__tests__/` | Vitest |
| **Unit: director** | state → intent table, planner output per intent, idle brain choices (seeded), "only idle wander", "elevator = work, stairs = leisure" | `src/scene/director/__tests__/` | Vitest |
| **Contract** | zod schemas accept valid and reject invalid fixtures for every event/command; `CONTRACT_VERSION` equals the version in `contracts.md`; config JSON and appearance docs parse; `migrateAppearance` upgrades old fixtures | `src/domain/__tests__/contracts.test.ts`, fixtures in `src/domain/__fixtures__/` | Vitest |
| **Simulator determinism** | same seed + same commands → identical event log (golden files); every scenario reaches its expected end state; no domain invariant broken over a 3-sim-day run | `src/adapters/sim/__tests__/`, golden logs in `src/adapters/sim/__fixtures__/golden/*.jsonl` | Vitest |
| **Adapter** | `LocalConfigSource` overrides, `LocalAppearanceStore`, `ReplayFeed`; from P09 Supabase adapters against a local Supabase (`supabase start`) or mocked client | beside each adapter | Vitest |
| **Component (few)** | 2D screens with logic: approval queue actions, wardrobe slot rules (fullbody hides top/bottom), org editor validation, device gate | `src/features/**/__tests__/` | Vitest + jsdom + Testing Library |
| **E2E smoke** | app boots, login, home canvas ready, key flows per phase, phone fallback at 375 × 812 with no horizontal scroll | `e2e/*.spec.ts` | Playwright (Chromium) |
| **Perf check** (from P04) | draw calls, triangles, frame time for the standard scene | `e2e/perf.spec.ts` + `scripts/perf-report.mjs` | Playwright + `window.__office_debug` |
| **Static checks** | typecheck, lint (incl. boundary rules), content/catalogue/licence validators, size budgets | scripts | tsc, ESLint, node scripts |
| **Human checklist** | look, motion, "does it read like a company" | end of each phase file / PR body | the boss |

Not unit-tested: r3f render components (`src/scene/render/**`, `camera/**`). Keep logic out of them; they are checked by e2e smoke, screenshots and review.

## 2. Tooling and commands

| Command | Does | Added in |
|---|---|---|
| `npm run test` | `vitest run` (all unit/contract/component tests) | P01 |
| `npm run test:watch` | Vitest watch | P01 |
| `npm run test:coverage` | coverage (v8) with thresholds (§3) | P01 |
| `npm run test:e2e` | Playwright: builds, serves `vite preview`, runs projects `desktop` (1440 × 900) and `phone` (375 × 812) | P01 |
| `npm run content:validate` | validates `src/content/**/*.json` with the zod schemas + cross-references | P01 |
| `npm run assets:check` | licence ledger complete, size budgets, catalogue ↔ files consistency | P06a (catalogue part P08a) |
| `npm run perf:check` | runs `e2e/perf.spec.ts` and prints the budget table | P04 |

Playwright config essentials: `webServer: { command: 'npm run build && npm run preview -- --port 4173', url: 'http://localhost:4173/Dashboard-N8N-tasks/' }`; Chromium launch args `--use-gl=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist` so WebGL2 works headless; build env `VITE_E2E=1` (exposes `window.__office_debug` and `window.__office_debug`); `retries: 1` in CI; traces on first retry.

E2E conventions:
- Wait for `[data-office-canvas][data-ready="true"]`, never for timeouts.
- Screenshots are **artifacts for humans**, not pixel assertions (SwiftShader output differs from a real GPU). Assert on DOM, `__office_debug` numbers and store state through `window.__office_debug.getState()`.
- Deterministic scenes: e2e runs the app with `?feed=replay&log=<name>` (ReplayFeed, §5) or `?seed=42&speed=0` (paused sim) so screenshots are comparable between runs.
- Phone project: assert no `<canvas>` on the home, `document.documentElement.scrollWidth <= clientWidth` on every fallback screen.

## 3. Coverage expectations

| Path | Lines |
|---|---|
| `src/domain/**` | ≥ 90 % |
| `src/scene/layout/**`, `src/scene/nav/**`, `src/scene/director/**` | ≥ 90 % |
| `src/adapters/sim/brain/**` | ≥ 80 % (plus golden logs) |
| `src/adapters/{local,supabase}/**` | ≥ 70 % |
| `src/features/**` | no threshold; test the logic-heavy components listed in §1 |
| `src/scene/render/**`, `src/scene/camera/**`, `src/scene/characters/**` | excluded from thresholds (pure helpers inside them, e.g. mesh-merge maths, should be split out and tested) |
Thresholds are enforced per-glob in `vitest.config.ts` from the phase that creates the folder. Every numbered requirement (`R#`) in a phase file must map to a test or to a line in the PR's manual check list.

## 4. What each phase adds

| Phase | Must add |
|---|---|
| **P01** | Vitest + Playwright setup; schema fixtures (1 valid + 1 invalid per event/command type); reducer skeleton tests; contract-version test; `LocalConfigSource` + store tests; device-gate test; lint boundary proof; e2e smoke (login → home → `#/org`) on desktop and phone; main-bundle-has-no-three check |
| **P02** | layout tests (order, boss on top, 40 departments, annex at 17, stable seats); template validation; view-store URL tests; e2e: canvas ready, 3 camera-mode screenshots, draw calls ≤ 150 |
| **P03** | reducer tests for every event; rule-engine table tests (each seed rule + strictest-wins + default); priority/aging tests with injected time; staffing cap tests (drop longest idle, never core, over-cap → boss review); help-request tests (timeout, 2 rounds, escalate); simulator golden logs for seed 42 and each scenario; invariants run (3 sim days); `ReplayFeed`; component tests for queue approve/reject; e2e: activity appears, boss approves an item |
| **P04** | nav grid/A*/route-graph/elevator tests; director intent table tests; "idle only wanders" and "elevator = work" property tests over a golden log; follow-camera view-store test; e2e with replay log: people present, one elevator trip completes; **perf check introduced** |
| **P05** | selectors for piles/waiting seats; director tests for deliver/ask/wait/idle activities, lunch nap and night shift by calendar; e2e replay "long queue" shows pile count and occupied waiting seats (via `__office_debug`) |
| **P06a** | `assets:check` (licences, sizes); generator scripts dry-run test (`--check` lists outputs without Blender) |
| **P06b** | slot → asset table completeness (every `SlotType` has a model or explicit blockout fallback); e2e screenshots per floor type; perf check still green |
| **P07a** | rig/clip manifest validation (required bones, required clips, shape-key names on body and every garment) |
| **P07b** | appearance → morph/scale mapping tests; mesh-assembly helper tests (merged vertex count, hidden slots); `generateAppearance` determinism; perf check with 60 real characters |
| **P08a** | `catalog-validate` (ids unique, files + thumbs exist, slots valid, credits) wired into `assets:check` |
| **P08b** | wardrobe rules component tests; `migrateAppearance` fixtures; `LocalAppearanceStore`; role gating tests (stylist sees only wardrobe); e2e on phone: change a top, reload, still there |
| **P09** | RLS tests (SQL or script against local Supabase: anon sees nothing, stylist cannot call boss RPCs, optimistic-concurrency conflict on `save_appearance`); adapter tests; e2e with mocked Supabase env still green; seed-SQL generator idempotency |
| **P10** | config-change validation tests (cannot remove last dept manager, role caps, rule editor); layout reacts to add/remove department; e2e: add department → new floor; hire over cap → boss approval item |
| **P11** | simulator-removal build test (build with `src/adapters/sim` deleted on a temp copy + `VITE_FEED=replay`); full-day replay soak for memory growth; a11y pass on fallback screens (axe via Playwright); final perf table |

## 5. Fixtures and `ReplayFeed`

- **Schema fixtures:** `src/domain/__fixtures__/events/<type>.valid.json` / `.invalid.json`, same for `commands/`, `config/` (a minimal org and the full seed), `appearance/` (one per version).
- **State builders:** `src/domain/__fixtures__/builders.ts`: `makeConfig(overrides)`, `makeState()`, `ev.taskCreated({...})` helpers with a fake clock (`t(minutes)` → ISO) and a counter-based id factory, so tests never touch real time or randomness.
- **Golden logs:** JSON Lines of `OfficeEvent`s produced by the simulator with a fixed seed: `seed42-day1.jsonl`, plus one per scenario (`long-queue.jsonl`, `cross-dept-help.jsonl`, `hire-over-cap.jsonl`, `angry-customer.jsonl`…). Regenerate with `npm run golden:update` (P03) **only** when behaviour changes on purpose; the PR must say why the diff is expected.
- **`ReplayFeed`** (`src/adapters/replay/ReplayFeed.ts`, P03): implements `OfficeFeed`, plays a golden log at a given speed (or all at once with `speed=0`), rejects commands. Used by (a) director/nav property tests, (b) e2e deterministic scenes, (c) the simulator-removal proof in P11 (the app still runs with only a replay log), (d) demos without the simulator.

## 6. CI wiring

`.github/workflows/ci.yml` (see `stacked-prs.md` §8), jobs in order: **static** (typecheck, lint, `content:validate`, `assets:check` when present) → **unit** (`test:coverage`, thresholds) → **build** (bundle size table in the job summary; fails if the main chunk contains three) → **e2e** (Playwright desktop + phone; uploads report, screenshots and the perf table as artifacts). Runs on every PR regardless of base branch and on pushes to `stack/**`. Time budget: under 8 minutes; if e2e passes 5 minutes, split the perf spec into a separate job.

## 7. Human test checklist (end of each phase)

Each phase PR ends with a checklist the boss can run in 5–10 minutes on the Mac Studio and a phone. Format:

```md
## Kiểm tra nhanh (P0X)
Chuẩn bị: mở <URL hoặc lệnh>, đăng nhập bằng <tài khoản demo>.
| # | Làm gì | Phải thấy gì | OK? |
|---|--------|--------------|-----|
| 1 | Mở trang chủ trên Mac | Toà nhà 8 tầng, tầng Sếp trên cùng | ☐ |
| 2 | Bấm vào tầng Marketing | Camera lướt tới, các tầng trên mờ đi | ☐ |
| 3 | Mở trên điện thoại | Danh sách phòng ban, không có 3D, không cuộn ngang | ☐ |
Nếu sai: ghi số dòng + chụp màn hình vào PR.
```
Rules: steps are actions and visible results, no technical words; at most 10 rows; includes one phone row; written in Vietnamese (the reader is the boss and his dad).
