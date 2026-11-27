# Removing the simulator

The simulator (`src/adapters/sim/`) drives the building until the real worker service does. It is a plug-in: the 3D scene, the domain and the 2D screens never import it. This page lists the exact steps to take it out, and the test that proves nothing else breaks (P11-T09, requirement R5).

## How it is wired today

| Piece | Where | What it does |
|---|---|---|
| The only import | `src/office/feedRegistry.ts` → `createFeed()` | `await import('@/adapters/sim')` when the feed is `sim` (the default). Lazy chunk `sim-*.js`, about 29 KB gzip. |
| Optional extensions | `src/office/extensions.ts` | `controlPanel`, `simControls`, `tourControls`. The registry fills them from the sim module; screens render them only when set. |
| Sim i18n | `src/i18n/{vi,en}/sim.ts` | Labels of the control panel and scenarios. |
| Stand-in | `src/adapters/_nosim/index.ts` | Exports `NullFeed` as `SimFeed`, no panel, no controls. |
| Null feed | `src/adapters/local/NullFeed.ts` | Empty office from the config: everyone idle at their desk, no events, every command refused with `no_feed`. |
| Build switch | `vite.config.ts` | `VITE_FEED=none` (or `VITE_SIM_STUB=1`) aliases `@/adapters/sim` to `_nosim` and stubs the sim i18n. |
| Guard rails | `src/office/__tests__/simBoundary.test.ts`, ESLint `no-restricted-imports` | No file outside the registry and `adapters/sim/**` may import the sim. |
| Regression test | CI job `no-sim` | Builds with `VITE_FEED=none`, runs `e2e/smoke.spec.ts` + `e2e/no-sim.spec.ts`, then `scripts/check-sim-removable.mjs --dist` (no sim code in any chunk). |

Locally: `npm run check:sim-removable` (build + scan) and `VITE_FEED=none npx playwright test e2e/smoke.spec.ts e2e/no-sim.spec.ts`.

## Steps

1. **Implement `SupabaseFeed`** against `OfficeFeed` as described in `after-this-phase.md` §8 (projections snapshot, realtime events by `seq`, `send` inserts into `commands`, wall-clock `now()`). Contract-test it with a recorded day through `ReplayFeed`.
2. **Register it and make it the default.** In `src/office/feedRegistry.ts` add the `supabase` case and set `VITE_FEED=supabase` in the deploy workflow (`.github/workflows/deploy.yml`) and in `.env.example`. Compare it side by side with the sim on a preview.
3. **Delete the simulator.**
   - `rm -r src/adapters/sim`
   - In `src/office/feedRegistry.ts`: delete the `if (resolved === 'sim') { … }` block and the `SimModuleExports` interface; change the default from `'sim'` to `'supabase'`.
   - Delete `src/adapters/_nosim/` and the alias + `simStubPlugin` in `vite.config.ts` (nothing to alias any more).
4. **Delete the sim i18n and links.**
   - `src/i18n/vi/sim.ts`, `src/i18n/en/sim.ts` and their two lines each in `src/i18n/vi.ts` / `src/i18n/en.ts`.
   - The simulator link in Settings (`src/features/settings/`), which shows only when `officeExtensions.controlPanel` is set.
   - Optionally `simControls` / `controlPanel` from `src/office/extensions.ts`, the `__office_debug.sim` field and the `kind === 'sim'` branches in `src/office/store.ts` (staff-event persistence and debug controls), once the real feed persists its own hires.
5. **Delete or port the sim-only tests and scripts:** `src/adapters/sim/**/__tests__` (gone with the folder), `e2e/p03-engine-sim.spec.ts`, `e2e/fixtures/record-scenarios.mjs`, `scripts/record-golden.mjs`, and the title-template check in `scripts/content-validate.mjs` (it already skips when the file is missing). The specs that drive scenes through `__office_debug.sim` (`e2e/office-life`, `office-art`, `office-legend`, `office-lighting`) switch to replay logs (`?feed=replay&log=…`).
6. **Run the regression test.** `npm run typecheck && npm run lint && npm run test && npm run build`, then the `no-sim` job (or locally: `VITE_FEED=none npx playwright test e2e/smoke.spec.ts e2e/no-sim.spec.ts`). Once the sim is gone the job can drop `VITE_FEED=none` and become the plain smoke run.

## What is touched, and what is not

- **Touched:** `src/adapters/**`, `src/office/feedRegistry.ts`, `src/office/extensions.ts` and `src/office/store.ts` (optional clean-up), `src/i18n/{vi,en}.ts` and the two `sim.ts` files, the settings link, `vite.config.ts`, CI/deploy env, sim-only tests and scripts.
- **Not touched:** anything under `src/scene/**`, `src/domain/**`, or `src/features/**` except the settings link. If a step seems to need a change there, the boundary was broken somewhere: fix the boundary, not the scene.

The guided tour (`officeExtensions.tourControls`) keeps working: steps that ask the sim for a scenario or a speed are skipped when no sim is present.
