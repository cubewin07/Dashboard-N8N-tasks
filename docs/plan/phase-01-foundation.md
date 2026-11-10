# P01: Foundation

## 1. Goal and demo
Put the skeleton of AI Office in place without changing what the old screens do: React 19, the 3D libraries (lazy-loaded), the pure domain types and schemas, the ports, config as data, the office store, CI for stacked PRs, and the first tests.
**Demo after merge:** the app opens on a new home **Văn phòng** (`#/`). On a desktop it shows a lazy-loaded 3D canvas with a ground plane and a "Toà nhà sẽ xuất hiện ở giai đoạn 2" note. **Sơ đồ** (`#/org`) lists the whole company from data: floor → department → people with role and specialties (28 core staff from `org.seed.json`). On a phone (≤ 768 px) the home shows the org list instead of the canvas. The old screens still work under a **Bản cũ** nav group.

## 2. Requirements
- **R1** React and react-dom are 19.x; all existing screens render and their flows work (login, overview, inbox approve, start-work wizard, library, settings).
- **R2** `three`, `@react-three/fiber` 9.x, `@react-three/drei` 10.x, `zustand`, `zod`, `ulid` are installed with **exact** versions (no `^`/`~`) for three/fiber/drei.
- **R3** `three` and R3F are never in the main bundle: `dist/assets/index-*.js` contains no `THREE.` / `WebGLRenderer` string; they load only in the lazy office-canvas chunk.
- **R4** `npm run test` passes with ≥ 1 real test per new pure module; `npm run test:e2e` passes (Playwright, Chromium).
- **R5** `.github/workflows/ci.yml` runs typecheck, lint, test, build, e2e and content validation on every `pull_request` (any base branch) and on push to `stack/**`.
- **R6** `src/domain/**` contains the types of `data-model.md` and zod schemas for config, the event envelope + catalogue (`contracts.md` §2) and commands (§3). `CONTRACT_VERSION === '1.0'` and a test compares it with `docs/plan/contracts.md`.
- **R7** ESLint fails on: (a) imports of `react`, `three`, `@react-three/*`, `@/adapters/**`, `@/office/**`, `@/features/**` from `src/domain/**`; (b) imports of `@/adapters/**` anywhere except `src/office/feedRegistry.ts`, `src/office/configStore.ts`, `src/app/providers.tsx`; (c) `Date.now()` / `new Date()` (no-arg) inside `src/domain/**` and `src/scene/{layout,nav,director}/**`.
- **R8** `src/ports/*.ts` hold the four interfaces of `contracts.md` §1, with no implementation.
- **R9** All config in `data-model.md` §2.1–2.9 exists as JSON in `src/content/` and `npm run content:validate` passes; breaking a file (e.g. unknown `roleKey`) makes it fail with a readable message.
- **R10** `LocalConfigSource.load()` returns the validated `OrgConfig` (bundled JSON merged with localStorage overrides); invalid overrides are ignored with a console warning, never a crash.
- **R11** The office store exposes `OfficeState` built by `StaticFeed.start(config)`: every active employee has a `PersonRuntime` with `activity: 'idle'`; no tasks.
- **R12** `#/org` renders floors top → bottom (boss floor first), departments, and people sorted by role `sortOrder`; all labels come from config `Label` (by current language) or i18n; works at 375 px with no horizontal scroll.
- **R13** `useDeviceTier()` returns `'full3d' | 'fallback'`: fallback when viewport ≤ 768 px, or WebGL2 is unavailable; a manual override (`localStorage['office.deviceTier']`) wins; a toggle exists in Settings.
- **R14** Legacy routes (`/inbox`, `/tasks`, `/tasks/:id`, `/start`, `/library`, `/team`, `/settings`, old overview at `/legacy`) still work; the legacy mock simulator timers run **only** while a legacy route is mounted.
- **R15** New nav labels exist in `vi` and `en`; no hard-coded strings.

## 3. Specs
### 3.1 Dependencies
| Package | Version rule | Note |
|---|---|---|
| `react`, `react-dom`, `@types/react`, `@types/react-dom` | latest 19.x, caret OK | Check Radix packages for React 19 peer warnings; bump them if needed |
| `three`, `@types/three` | exact, latest stable supported by drei 10 | Record in PR body |
| `@react-three/fiber` | exact 9.x | |
| `@react-three/drei` | exact 10.x | |
| `zustand` 5.x, `zod` 4.x (or latest 3.x if 4 conflicts), `ulid` | caret OK | |
| dev: `@playwright/test`, `@vitest/coverage-v8`, `jsdom`, `@testing-library/react` | caret OK | |

New scripts in `package.json`: `test` (`vitest run`), `test:watch`, `test:coverage`, `test:e2e` (`playwright test`), `content:validate` (`node scripts/content-validate.mjs`). `build` stays `tsc -b && vite build`.

### 3.2 Domain files (`src/domain/`)
| File | Contents |
|---|---|
| `primitives.ts` | `Label`, `Iso`, `ApprovalLevel`, `LEVEL_RANK`, `Priority`, `ModelTier`, id types |
| `ids.ts` | `newId(prefix, ulidFactory)`: the ULID factory is injected (no hidden clock/random in domain) |
| `config.ts` | Types + zod schemas: `Department`, `RoleDef`, `Specialty`, `Employee`, `Policy`, `ApprovalRule`, `Platform`, `Shop`, `TaskType`, `BuildingConfig`, `FloorTemplate`, `Slot`; `OrgConfig` = all of them; `parseOrgConfig(raw)` with cross-reference checks (role keys, department ids, specialties, platform keys, templates exist; ≤ `maxPerDepartment`) |
| `work.ts` | `Task`, `ReviewItem`, `Question`, `HelpRequest`, `IntakeMessage`, `PersonRuntime`, `OfficeState` |
| `events.ts` | `OfficeEvent` envelope schema, `EventType` union, payload schemas (`.passthrough()`), `parseEvent(raw)` returning `{ok, event} | {ok:false, reason}` |
| `commands.ts` | `Command` envelope, payload schemas (`.strict()`), `CommandAck` |
| `reducer.ts` | `initialState(config, now)`, `apply(state, event)`: skeleton handling `person.activity`, `config.changed`, `system.heartbeat`; unknown type or `seq ≤ state.seq` → returns state unchanged. Other events are filled in P03 |
| `selectors.ts` | `peopleByDepartment`, `orgTree(config)` (floors → departments → people; used by `#/org`) |
| `contract.ts` | `export const CONTRACT_VERSION = '1.0'` |
`AppearanceV1` and the catalogue types are added in P07b/P08b (not now).

### 3.3 Office layer (`src/office/`)
- `configStore.ts`: zustand store `{config, status: 'loading'|'ready'|'error', error}`; picks the `ConfigSource` (only `LocalConfigSource` now); `subscribe` keeps it live.
- `feedRegistry.ts`: `createFeed(): OfficeFeed` chosen by `import.meta.env.VITE_FEED` (`'static'` default in P01; P03 changes the default to `'sim'`).
- `store.ts`: zustand `useOffice` = `{state: OfficeState | null, connection, send(cmd)}`; `bootOffice()` loads config → `feed.start(config)` → subscribes → applies event batches through `apply`. Exposes `getState()` for transient reads in `useFrame` later.
- `hooks.ts`: `useOfficeSelector(selector)`, `useConfig()`, `useLang()`-aware `useLabel()` helper (`label[lang]`).
- `extensions.ts`: `officeExtensions = { controlPanel: null as ComponentType | null }`: slot a feed adapter may fill (the simulator in P03).
- `src/adapters/local/StaticFeed.ts`: `kind: 'replay'`-compatible minimal feed: `start` returns `initialState`, `subscribe` never fires, `send` returns `rejected: 'static_feed'`, `now()` = wall clock (allowed in adapters), connection always `live`.
- `src/adapters/local/LocalConfigSource.ts`: imports `src/content/*.json`, deep-merges `localStorage['office.config.overrides']` (schema `{v:1, patch}`), validates; `apply()` throws `ConfigError('not_implemented')` until P10.

### 3.4 Routes and nav
| Route | Screen | Nav label (vi / en) |
|---|---|---|
| `#/` | `OfficePage` (canvas or fallback) | Văn phòng / Office |
| `#/org` | `OrgPage` | Sơ đồ / Org chart |
| `#/legacy` | old `OverviewPage` | Bản cũ → Tổng quan / Classic → Overview |
| `#/inbox`, `#/tasks`, `#/tasks/:id`, `#/start`, `#/library`, `#/team` | unchanged | under **Bản cũ** group (collapsed by default) |
| `#/settings` | unchanged + device-tier toggle | Cài đặt |
Mobile tab bar: Văn phòng · Sơ đồ · Thêm (sheet with the rest). The "+ Giao việc" (Start work) button moves into the Bản cũ group.

### 3.5 Device gate
`src/app/deviceTier.ts`: `detectTier()` = override ?? (`matchMedia('(max-width: 768px)')` or no `WebGL2RenderingContext`/context creation fails → `'fallback'`, else `'full3d'`). `useDeviceTier()` re-evaluates on resize. `OfficePage` renders `<Suspense>` + `lazy(() => import('@/scene/OfficeCanvas'))` for `full3d`, and `<OrgList compact />` + a "Xem 3D" button for `fallback`.

### 3.6 Design tokens carried over from `docs/LAYOUT.md`
These stay the visual system for all 2D UI (already in `src/index.css`); the 3D palette (P02 `palette.ts`, P06a palette texture) is derived from them.
| Token | Choice |
|---|---|
| Font | **Be Vietnam Pro** (full Vietnamese diacritics); tabular numbers for times and counts |
| Base | Warm off-white `#FAF9F7` / surfaces `#FFFFFF` / ink `#1C1B19`; dark mode `#121211` / `#1B1A18` |
| Accent | Deep jade `#0F766E` (primary actions) |
| Status | Working = blue `#2563EB` · Needs you = amber `#D97706` · Blocked = red `#DC2626` · Done = green `#16A34A` · Idle = neutral grey · Offline = striped grey |
| Shape | 14 px card radius, 1 px hairline borders, very soft shadow only on hover/drawers |
| Motion | 150–200 ms ease-out; gentle pulse on the working dot; respects `prefers-reduced-motion` |
| Density | Roomy on the home, tighter in lists |
Principles kept: people first, one place for "needs you", progressive disclosure (card → drawer → page), live but quiet.
**Changed:** per-employee tints (`--emp-thu` … `--emp-bao`) remain only for legacy screens. New screens use **department swatches**: `Department.colorSwatch` is a key into `src/content/palette.json` (`{key, hex, softHex}`; seed: `cs` sky, `marketing` violet, `design` pink, `accounting` amber, management jade, boss ink/gold, leisure teal). `OrgPage` applies them via inline CSS variables (`--dept`, `--dept-soft`) set from data, the one allowed exception to "no ad-hoc colours".

### 3.7 Content files (`src/content/`)
`org.seed.json` (`departments`, `employees`, `shops` per `data-model.md` §4), `roles.json` (6 roles: owner, manager, dept_manager, lead, reviewer, worker), `specialties.json` (15), `platforms.json` (9), `approval-rules.json` (5 seed rules), `policy.json`, `task-types.json` (empty array now; P03 fills it), `building.json`, `palette.json`, `floor-templates/` (empty folder + `README`; P02 adds the templates, so in P01 the config schema accepts zero templates and `Department.floorTemplate` is checked only if templates exist).

## 4. Design choices
| Topic | Options | Choice | Reason | Revisit if |
|---|---|---|---|---|
| React version | stay 18 + R3F 8 · upgrade to 19 + R3F 9 | **React 19** | R3F 8 is maintenance-only; upgrading later means touching every 3D file | A Radix package breaks on 19 with no fix → pin that package's fork or replace the component |
| Boundary enforcement | convention · `eslint-plugin-boundaries` · built-in `no-restricted-imports` + `no-restricted-syntax` per `files` override | **built-in rules** | No new plugin; 3 overrides cover it | Rules become unreadable → adopt the plugin |
| Office state | TanStack Query · Redux · zustand | **zustand** | Transient reads in `useFrame`, tiny, event reducer plugs in directly | – |
| Config override storage (pre-Supabase) | none · localStorage patch | **localStorage patch, validated** | Lets P10 build the editor before/without Supabase | – |
| Home route | keep cards as home · new office home | **Office at `#/`, old overview at `#/legacy`** | The vision replaces the home; nothing is lost | – |
| Legacy simulator | delete now · leave global · confine | **confine to legacy routes** | Two simulators at once would confuse the demo; deleting now makes P01 huge | – |
| zod major | 3 · 4 | **4 if it installs cleanly** | Faster, smaller | Type issues with TS 5.9 → 3.x |

## 5. Tasks
- [x] **P01-T01** React 19 upgrade and 3D stack install. **Done 2026-11-10:** react/react-dom 19.3.1, three 0.187.0, @react-three/fiber 9.8.2, @react-three/drei 10.7.9, zustand 5.1.0, zod 4.6.7, ulid 3.0.2 (3D/state libraries pinned exactly); typecheck, lint and build pass with no code changes. Still to do by hand: click through the legacy screens once in the browser. Original task text: React 19 upgrade. *Files:* `package.json`, `package-lock.json`, any component with type errors. *Steps:* bump react/react-dom/types; bump Radix packages if peer warnings; fix `forwardRef`/`ref` typing changes; run all legacy flows. *Acceptance:* R1; `npm ls react` shows a single 19.x; typecheck/lint/build pass.
- [ ] **P01-T02** CI for PRs. *Files:* `.github/workflows/ci.yml`. *Steps:* triggers `pull_request` (no branch filter) + `push: branches: ['stack/**']`; Node 22, `npm ci`, typecheck, lint, `test`, `content:validate` (step added now, script lands in T06, so order T06 before enabling or use `--if-present`), build, `npx playwright install --with-deps chromium`, `test:e2e`; upload Playwright report on failure; write `dist` JS sizes to `$GITHUB_STEP_SUMMARY`. *Acceptance:* R5; a PR targeting `stack/p00-plan` triggers the workflow.
- [ ] **P01-T03** Domain types and schemas. *Files:* `src/domain/{primitives,ids,config,work,events,commands,reducer,selectors,contract}.ts`, `src/domain/__tests__/*.test.ts`, `src/domain/__fixtures__/events/*.json`. *Steps:* implement §3.2 from `data-model.md` and `contracts.md`; one valid + one invalid fixture per event type and command type; reducer skeleton tests (idempotent seq, unknown type skipped, unknown employee id skipped). *Acceptance:* R6; tests pass; contract-version test passes.
- [ ] **P01-T04** Lint boundaries. *Files:* `eslint.config.js`, `src/domain/__tests__/boundaries.test.ts` (optional grep-style test). *Steps:* add the three rule sets of R7 as `files` overrides; add ignores for `e2e`, `scripts`, `art`. *Acceptance:* R7: a temporary file `src/domain/x.ts` with `import 'react'` or `Date.now()` fails lint (show output in PR, then delete it).
- [ ] **P01-T05** ∥ Vitest + Playwright setup. *Files:* `vitest.config.ts` (jsdom for `*.test.tsx`, node otherwise; coverage v8 with thresholds for `src/domain/**` 90% lines), `playwright.config.ts` (webServer: `npm run build && npm run preview`, baseURL with `/Dashboard-N8N-tasks/`, Chromium with `--use-gl=swiftshader --enable-unsafe-swiftshader`, projects `desktop` 1440×900 and `phone` 375×812), `e2e/smoke.spec.ts`, `.gitignore` (playwright-report, test-results). *Acceptance:* R4; smoke: log in with demo credentials → home visible → `#/org` lists "Chăm sóc khách hàng"; phone project: no horizontal scroll (`scrollWidth ≤ clientWidth`).
- [ ] **P01-T06** Content seeds + validator. *Files:* `src/content/*.json` (§3.7), `scripts/content-validate.mjs`, `package.json`. *Steps:* write the seed from `data-model.md` §2 and §4 (28 employees, readable ids like `emp_thu`, `createdAt` fixed `2026-11-10T00:00:00Z`); the validator bundles/loads `parseOrgConfig` (run through `vite-node` or `tsx`) and prints each error with file + path. *Acceptance:* R9.
- [ ] **P01-T07** ∥ Ports. *Files:* `src/ports/{OfficeFeed,ConfigSource,AppearanceStore,AuthPort,index}.ts`. *Steps:* copy the interfaces from `contracts.md` §1; `AppearanceV1` typed as an opaque `unknown`-based placeholder exported from `src/domain/appearance.ts` (real type in P07b). *Acceptance:* R8; typecheck.
- [ ] **P01-T08** Local adapters + office store. *Files:* `src/adapters/local/{LocalConfigSource,StaticFeed}.ts`, `src/office/{configStore,feedRegistry,store,hooks,extensions}.ts`, tests beside them, `src/app/providers.tsx` (call `bootOffice()` once after auth). *Acceptance:* R10, R11; unit tests: bad override ignored; store has 28 idle people.
- [ ] **P01-T09** Confine the legacy simulator. *Files:* `src/app/RealtimeProvider.tsx`, `src/app/router.tsx`, `src/app/LegacyBoundary.tsx` (new). *Steps:* move `startSimulator()`/`stopSimulator()` out of the global provider into `LegacyBoundary`, a route wrapper mounted around all legacy routes (start on mount, stop on unmount); the inbox badge in the nav reads legacy data only inside the Bản cũ group. *Acceptance:* R14; unit/e2e check: on `#/org` for 30 s no legacy store `emit` occurs (spy via exported counter or `vi.useFakeTimers`).
- [ ] **P01-T10** Nav, routes, i18n. *Files:* `src/app/{router,AppLayout}.tsx`, `src/i18n/{vi,en}/common.ts`, `src/i18n/{vi,en}/office.ts`, `src/i18n/{vi,en}/org.ts`, `src/i18n/{vi,en}.ts`. *Steps:* §3.4; Bản cũ as a collapsible group (`aria-expanded`); mobile tab bar updated. *Acceptance:* R14, R15; keyboard can reach every nav item; 375 px screenshot in PR.
- [ ] **P01-T11** Device gate. *Files:* `src/app/deviceTier.ts` (+ test), `src/features/settings/SettingsPage.tsx` (toggle: Tự động / Luôn 3D / Luôn 2D), i18n. *Acceptance:* R13; unit test with mocked `matchMedia` and canvas context.
- [ ] **P01-T12** Org page. *Files:* `src/features/org/{OrgPage,OrgList,FloorSection,PersonRow}.tsx`, i18n. *Steps:* render `orgTree(config)`; person row = initials avatar on department swatch, name, role label, specialty chips, `core`/`temp` tag, model-tier dot; status pill from `PersonRuntime.activity` (all idle now); empty department state; skeleton while loading. *Acceptance:* R12; e2e asserts 4 department sections + management + boss floor, boss floor first.
- [ ] **P01-T13** Office page + lazy canvas placeholder. *Files:* `src/features/office/OfficePage.tsx`, `src/scene/OfficeCanvas.tsx`, i18n. *Steps:* `<Canvas>` with a ground plane, one hemisphere + one directional light, drei `OrbitControls` (temporary), overlay text from i18n; error boundary around the lazy import that falls back to the org list. *Acceptance:* R3 (grep the main chunk; put the grep in `e2e` or a `scripts/check-main-bundle.mjs` run in CI), canvas visible in e2e desktop project.
- [ ] **P01-T14** Docs touch-up. *Files:* `docs/plan/phase-01-foundation.md` (record exact versions + any choice made), `AGENTS.md` commands section (add `test:e2e`, `content:validate`). *Acceptance:* versions table filled.

Order: T01 → (T02, T05 ∥) → T03 → T04 → T06 → (T07 ∥) → T08 → T09 → T10 → T11 → T12 → T13 → T14.

## 6. Dependencies
- **Needs:** P00 (plan, conventions).
- **Later phases rely on:** domain types/schemas and `apply()` signature (P03 fills the reducer); `useOffice`/`useConfig` hooks (every UI and 3D file); `feedRegistry` + `officeExtensions.controlPanel` (P03 sim); `OfficeCanvas` as the single canvas (P02); `useDeviceTier` (P02, P08b, P11); `orgTree`/`OrgList` (fallback screens); `palette.json` (P02, P06a); `LegacyBoundary` (P11 deletes it with the legacy screens); CI + Playwright projects `desktop`/`phone`.

## 7. Branch and PR
- Branch `stack/p01-foundation` from `stack/p00-plan`. PR base `stack/p00-plan`. Title: `[P01] Foundation: React 19, domain, ports, config as data, CI`.
- Description template:
```md
<stack map>
## What
Skeleton for AI Office. New home (lazy 3D placeholder) + Sơ đồ from data. Legacy screens untouched under "Bản cũ".
## Versions pinned
react …, three …, @react-three/fiber …, @react-three/drei …, zustand …, zod …
## How to check
1. npm ci && npm run build && npm run preview
2. Log in (any email, 6+ char password) → Văn phòng shows the canvas; resize < 768px → org list
3. Sơ đồ lists 28 people on 7 floors; Bản cũ → Inbox still approves
## Evidence
- main chunk has no three (size table), lint boundary failure sample, 375px screenshot
## Contract
office-contract v1.0 implemented as zod (no change to the doc)
```

## 8. Review checklist
- [ ] Main bundle has no three/R3F; size did not grow by more than ~40 KB gz vs `main` (zustand + zod + new screens).
- [ ] Domain is pure: no React/three/adapter imports, no clock or randomness.
- [ ] Types match `data-model.md` field for field; event/command names match `contracts.md`.
- [ ] Lint boundary rules actually fail on a violation (evidence in PR).
- [ ] Seed JSON matches `data-model.md` §4 (28 people, one manager, one dept manager and one lead per department).
- [ ] Legacy flows work; legacy simulator silent outside legacy routes.
- [ ] No hard-coded strings; `en` keys match `vi`.
- [ ] CI runs on a PR whose base is not `main`.
- [ ] 375 px: nav, org page, settings toggle.

## 9. Risks and open questions
- React 19 may surface type breaks in generated shadcn components (`ref` as prop). Mitigation: fix in place; they are small.
- drei 10 pins a three range; pick the three version from drei's peer range, not "latest".
- Playwright WebGL in CI relies on SwiftShader flags; if the canvas test is flaky, assert on the `<canvas>` element and a `data-ready` attribute set after the first frame rather than on pixels.
- `task-types.json` and floor templates are empty in P01 by design; the validator must allow that.
