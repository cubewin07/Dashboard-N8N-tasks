# AI Office: plan overview

> **`docs/plan/` is the only current plan.** Older docs (`docs/PLAN.md`, `docs/CONTRACT.md`, `docs/EMPLOYEES.md`, `docs/LAYOUT.md`, `docs/MVP-NOTES.md`, `docs/OPEN-QUESTIONS.md`) are under audit (`00-audit.md`). Once that is approved they move to `docs/archive/`. Where they disagree with this folder, this folder wins.

Status: **draft v1 (2026-11-10)**. Nothing in this plan is built yet.

## 1. What we are building

"AI Office" turns the boss dashboard into a **3D low-poly company building** in the browser. AI employees are characters who walk, work at desks, queue, chat, sleep and play. Each department has its own floor. The boss floor is always on top. Leisure floors hold the lounge, games and sleeping pods. Elevators and stairs connect the floors.

During this phase a **simulator** (a fake "brain") drives everything, so the boss's dad can see the vision before any real AI is connected. Later the real AI workers drive the same building. **The 3D code never knows which one is behind it.**

Viewed mostly on a Mac Studio (full 3D). Phones get a 2D fallback: org list, approval queue, activity feed and the appearance editor ("Tủ đồ").

## 2. Architecture

### 2.1 The one idea: ports and adapters with an event-sourced office state

```
                  ┌───────────────────────── src/adapters ─────────────────────────┐
                  │  sim/ (REMOVABLE)        local/            supabase/ (P09)       │
                  │  SimFeed + brain        LocalConfig       SupabaseConfig         │
                  │  scenario panel         LocalAppearance   SupabaseAppearance     │
                  │                                           (later) SupabaseFeed   │
                  └──────┬──────────────────────┬───────────────────────┬───────────┘
                         │ implements           │ implements            │
                  ┌──────▼──────────────────────▼───────────────────────▼───────────┐
 src/ports        │ OfficeFeed     ConfigSource     AppearanceStore     AuthPort      │
                  └──────┬──────────────────────────────────────────────────────────┘
                         │ OfficeEvent stream (zod-validated, versioned)  ▲ Command
                  ┌──────▼──────────────────────────────────────────────┴───────────┐
 src/domain       │ pure TS: types, event reducer, selectors, approval rules,        │
 (no React/three) │ priority queue + aging, staffing cap, help-request rules         │
                  └──────┬──────────────────────────────────────────────────────────┘
                         │ OfficeState (snapshot)
                  ┌──────▼──────────────┐
 src/office       │ zustand store +     │  ← the ONLY thing UI and 3D read
                  │ feed registry       │
                  └───┬─────────────┬───┘
                      │             │
       ┌──────────────▼───┐   ┌─────▼───────────────────────────────────────────────┐
 src/  │ features/ (2D UI) │   │ src/scene (3D)                                      │
       │ org, queue,       │   │  layout/   pure TS: building + floor layouts         │
       │ activity, wardrobe│   │  director/ pure TS: state → intents → action plans   │
       │ admin, overlays   │   │  nav/      pure TS: grid A*, building route graph,   │
       └───────────────────┘   │            elevator scheduler                        │
                               │  render/   r3f components (building, people, fx)     │
                               │  camera/   camera modes                              │
                               └──────────────────────────────────────────────────────┘
```

Rules that make the simulator swappable and removable:
1. **The 3D scene and the 2D UI read only `src/office` (store + selectors).** They never import from `src/adapters/**`. ESLint `no-restricted-imports` enforces this (P01-T04).
2. **The domain is pure.** `src/domain/**` imports no React, no three, no adapters, and never calls `Date.now()`. Time comes in from the feed's clock (`now` is part of every event and command).
3. **Everything that changes the office is an `OfficeEvent`** (`contracts.md` §2). The simulator emits them in the browser. The real system will later write the same events to Supabase and a `SupabaseFeed` will stream them. Same reducer, same 3D.
4. **Everything the UI asks for is a `Command`** (`contracts.md` §3), sent through `OfficeFeed.send()`. The simulator answers with events. Later the worker service answers the same commands.
5. **The simulator lives only in `src/adapters/sim/`**. It plugs in through one line in `src/office/feedRegistry.ts`, and its control panel mounts through the extension slot `officeExtensions.controlPanel`. Removing it = delete the folder + that line (P11-T09 proves it with a test build).
6. **Configuration is data** (departments, roles, employees, specialties, platforms, approval rules, caps, floor templates, wardrobe catalogue). It is loaded through `ConfigSource`: bundled JSON in `src/content/` first, Supabase from P09. Adding a department, role, employee, platform or wardrobe item needs no code change.

### 2.2 How a state change becomes movement

```
OfficeEvent ──reducer──▶ OfficeState ──director.deriveIntent()──▶ Intent per employee
   (domain)                (store)          (pure, 10 Hz tick)        e.g. DeliverDocument{to, floor}
                                                   │
                                     planner.plan(intent, layout, nav) ──▶ ActionPlan
                                                   │   [walk(path), callElevator, ride, walk, drop(doc), return]
                                                   ▼
                                    render/ (per frame): animate along the plan, pick animation clip,
                                    show held item, desk status, pile counts, icons
```

- The director is the only place where "what the business is doing" turns into "what the character does". It is deterministic and unit-tested.
- **Movement semantics (decided):** only idle employees wander. **Elevators carry work trips** (handoffs, deliveries, going for approval, questions). **Idle trips to leisure floors use the stairs.** So an elevator ride always means real work. See `phase-05` D3.

### 2.3 Tech stack

| Area | Choice | Why (short) |
|---|---|---|
| App | React **19**, Vite, TypeScript strict (existing app, React upgraded in P01) | R3F v9 and drei v10 need React 19. The app is small, so the upgrade is cheap now and expensive later. |
| 3D | three.js + **@react-three/fiber 9** + **@react-three/drei 10** | Most mature React 3D stack; fits the existing React app; huge example base for agents. |
| 3D text | troika-three-text (via drei `<Text>`) + bundled Be Vietnam Pro TTF | SDF text with full Vietnamese diacritics; no DOM overlays per character. |
| State | **zustand** (office store) + TanStack Query (Supabase reads in 2D screens, existing) | zustand allows transient subscriptions in `useFrame` without React re-renders. |
| Validation | **zod** | Events/commands/config/appearance come from outside later; validate at the edge. |
| Navigation | Custom grid A* per floor + building route graph (pure TS) | Floors are flat rectangles generated from templates; ~200 lines, deterministic, testable. Recast is overkill. Revisit if floors become irregular. |
| Assets | glTF/GLB, one shared **palette texture** (low-poly "colormap" style), `@gltf-transform/cli` (meshopt), Blender 4.x headless Python scripts | Consistent look across mixed sources; tiny textures; enables merging a character into 1 draw call. |
| Tests | Vitest (unit), Playwright (E2E smoke + 375px screenshots) | Vitest already configured but has 0 tests; Playwright headless Chromium renders WebGL via SwiftShader. |
| Backend (P09) | Supabase: Auth, Postgres, RLS, Realtime | Already chosen by the old plan; needed for the sister account and shared appearance/config. |
| Hosting | GitHub Pages via Actions, HashRouter, `base: '/Dashboard-N8N-tasks/'` | Unchanged. All asset URLs go through `import.meta.env.BASE_URL`. |

Pin exact versions at install time (no `^` for three/r3f/drei, since their minor versions break APIs). Record them in `package.json` and in the P01 PR description.

### 2.4 Folder structure (target after P11)

```
src/
  app/                router, providers, AppLayout, auth (roles from P08), device gate
  domain/             PURE. org.ts, work.ts, rules.ts, queue.ts, staffing.ts, help.ts,
                      events.ts (zod), commands.ts (zod), reducer.ts, selectors.ts, ids.ts, time.ts
  ports/              interfaces only: OfficeFeed.ts, ConfigSource.ts, AppearanceStore.ts, AuthPort.ts
  adapters/
    sim/              REMOVABLE simulator: SimFeed.ts, brain/, scenarios/, content/vi/, rng.ts, clock.ts,
                      ui/SimControlPanel.tsx
    local/            LocalConfigSource (bundled JSON + localStorage overrides), LocalAppearanceStore,
                      LocalAuth (demo accounts)
    supabase/         (P09) client.ts, SupabaseConfigSource, SupabaseAppearanceStore, SupabaseAuth
  office/             store.ts (zustand), hooks.ts, feedRegistry.ts, extensions.ts, configStore.ts
  scene/              3D only
    layout/           PURE: buildingLayout.ts, floorLayout.ts, templates loader, slot allocation
    nav/              PURE: grid.ts, astar.ts, routeGraph.ts, elevator.ts
    director/         PURE: intents.ts, planner.ts, idleBrain.ts, director.ts
    render/           r3f: Building, Floor, Furniture, Person, Elevator, DeskStatus, DocPile,
                      WaitingSeats, PlatformBadge, Decor
    characters/       appearance → assembled mesh (P07), animation library, LOD
    camera/           CameraRig, modes (overview, free, floor, follow)
    OfficeCanvas.tsx  the single <Canvas>
  features/
    office/           OfficePage (canvas + overlays: floor picker, people list, details drawer, camera bar)
    org/ queue/ activity/ wardrobe/ admin/      2D screens (also the phone fallback)
    legacy/…          existing MVP screens stay where they are until P11 (see 00-audit.md)
  content/            DATA: org.seed.json, roles.json, specialties.json, platforms.json,
                      approval-rules.json, policy.json, floor-templates/*.json, catalog/*.json
  i18n/               vi (source of truth) + en, split per feature (existing pattern)
public/assets/        models/*.glb, textures/palette.png, anim/library.glb, thumbs/*.webp, fonts/
art/                  blender/ (headless Python generators + shared lib), STYLE-GUIDE.md,
                      sources/ (download manifests, NOT the downloaded zips), LICENSES.md
scripts/              node: assets-optimize.mjs, catalog-validate.mjs, licences-check.mjs,
                      thumbs-render.mjs, size-budget.mjs
e2e/                  Playwright specs
supabase/migrations/  (P09)
docs/plan/            this plan
```

## 3. Glossary

| Term | Meaning |
|---|---|
| **Boss** | A human user with role `boss` (the owner and his son). Approves `boss`-level items. Has a desk avatar on the top floor. |
| **Manager** (Quản lý) | One building-wide AI employee. Takes requests from the boss (Telegram/in-app, text/voice) and assigns tasks to the right employee. Office on the Management floor. |
| **Department manager** (Trưởng phòng) | One per department, `model_tier: strong`. Approves `dept_manager`-level items and manages workers. |
| **Lead** (Trưởng nhóm) | One per department. Runs the review desk: distributes reviews to reviewers, handles reviewer escalations. `model_tier: standard`. |
| **Reviewer** (Kiểm duyệt) | Several per department, `model_tier: cheap`. Handle `reviewer`-level reviews. |
| **Worker** (Nhân viên) | Does tasks. Has specialties. |
| **Core staff / Temp staff** | Core = fixed, never auto-dropped. Temp = created/dismissed by boss or manager; capped (`policy.tempCap`, default 10). Dropped = **archived** (look and history kept). |
| **Specialty** | A skill key (e.g. `image`, `video`, `copywriting`, `tax`). Workers ask other specialists for help through **help requests**. |
| **Platform** | Data row (`facebook`, `zalo_oa`, `shopee`, …) with label, colour and placeholder badge. Never an enum in code. |
| **Approval level** | `reviewer` < `dept_manager` < `boss`. Chosen by **approval rules** (data). |
| **Review item / document** | An item waiting for review or approval. Shown as a paper on the approver's **desk pile** with a count. |
| **Question** | A synchronous ask (worker → lead/manager). If the target's queue is long, the worker **sits in a waiting seat** outside their room. |
| **OfficeEvent** | Versioned, validated record of something that happened (`contracts.md`). The only input to the office state. |
| **Command** | Versioned request from the UI (approve, hire, request…). Only output of the UI. |
| **Feed** | An `OfficeFeed` implementation: `SimFeed` now, `SupabaseFeed` later. |
| **Sim time** | Simulated clock (default 30× real time, pausable). All domain timestamps are feed time. |
| **Intent / ActionPlan** | Director output: what a character wants to do / the concrete steps (walk, ride, sit, animate). |
| **Floor template** | JSON describing a floor type's zones and furniture slots (department, management, boss, lobby-café, games-rest). |
| **Palette texture** | One shared 256×256 colour atlas used by all low-poly models (`assets.md`). |
| **Appearance doc** | Versioned JSON describing one employee's look (body sliders, face, hair, outfit, accessories, colours). |
| **Stack / layer** | One phase branch + PR in the stacked PR chain (`stacked-prs.md`). |

## 4. Phases

Each phase ends with a runnable app and a demo. Full detail is in each `phase-NN-*.md`.

| Phase | Branch | Demo after merge | Needs |
|---|---|---|---|
| **P00** Plan & audit | `stack/p00-plan` | Plan docs; after approval, old plans archived and agent instructions point here | – |
| **P01** Foundation | `stack/p01-foundation` | New home `#/office`: org list built from data (departments → floors → people). React 19, CI on PRs, first tests, ports, domain types | P00 |
| **P02** Building blockout & cameras | `stack/p02-building` | A procedural 3D building from data: lobby, department floors, leisure, management, boss on top, elevator shaft, stairs. Orbit/zoom, free mode, floor focus | P01 |
| **P03** Work engine & simulator | `stack/p03-engine-sim` | A living company in 2D: activity feed, approval queue (boss can approve), Vietnamese tasks, handoffs, 3 approval levels, help requests, temp-staff cap, scenario buttons, speed control. 3D floors show live counters | P01 |
| **P04** People & navigation | `stack/p04-people` | Placeholder characters on every floor: sit at desks when working, wander when idle, ride the elevator for real work trips, take stairs to leisure floors. People list + follow camera | P02, P03 |
| **P05** Office life & visual language | `stack/p05-office-life` | Readable scene: desk status, held items, paper piles with counts, waiting seats, platform badges, idle chats/games/sleep/nap time, decorative life | P04 |
| **P06a** Environment assets | `stack/p06a-env-assets` | (binaries + generator scripts) furniture, building kit, decor GLBs, palette, licence ledger | P05 (slot list) |
| **P06b** Environment art pass | `stack/p06b-env-art` | Blockout replaced by real low-poly art; distinct boss floor; lighting | P06a |
| **P07a** Character assets | `stack/p07a-char-assets` | (binaries + scripts) base body with shape keys, shared skeleton, animation library, starter clothing set | P05 |
| **P07b** Character system | `stack/p07b-characters` | Capsules replaced by real people with body sliders, assembled to 1 draw call each, animated | P07a |
| **P08a** Wardrobe catalogue assets | `stack/p08a-wardrobe-assets` | (binaries + scripts) the fashion catalogue: 80+ items, thumbnails | P07b |
| **P08b** Wardrobe & roles | `stack/p08b-wardrobe` | Fashion-game editor (desktop and phone), per-employee appearance saved locally, demo `stylist` account limited to the wardrobe | P08a |
| **P09** Supabase backend | `stack/p09-supabase` | Real logins (boss ×2, stylist), config and appearance stored in Supabase with RLS; simulator still drives activity | P08b |
| **P10** Boss controls | `stack/p10-boss-controls` | Boss edits departments (a new floor appears), roles, specialties, employees (hire/dismiss/archive), caps, approval rules | P09 |
| **P11** Polish, performance & handover | `stack/p11-polish` | Smooth on Mac Studio with 60+ people, complete phone fallback, a11y/i18n pass, legacy screens retired, demo script for dad, simulator-removal proof, `after-this-phase.md` updated | P10 |

### Dependency graph

```
P00 ─▶ P01 ─┬─▶ P02 ─┐
            └─▶ P03 ─┴─▶ P04 ─▶ P05 ─┬─▶ P06a ─▶ P06b ─┐
                                     └─▶ P07a ─▶ P07b ─┴─▶ P08a ─▶ P08b ─▶ P09 ─▶ P10 ─▶ P11
```
The **stack order** is linear (the row in the table). The **logical** graph above shows what can be built in parallel: P02 ∥ P03, and P06a/b ∥ P07a/b. Parallel work branches from the latest common ancestor and is rebased into stack position before its PR opens (`stacked-prs.md` §4).

Visible milestones for dad: **P02** (a building), **P04** (people moving), **P05** (it reads like a company), **P07b** (real-looking people), **P08b** (fashion game).

## 5. Conventions (every phase)

All rules in `AGENTS.md` still apply unless changed here. Changes to `AGENTS.md` itself happen in P00-T05.

1. **Language:** UI Vietnamese first (`src/i18n/vi/*`, natural Vietnamese with full diacritics), `en` with identical keys (type-enforced). DB/config stores keys; labels come from config `label: {vi, en}` for data-defined things (departments, roles, platforms, catalogue items) and from i18n for UI chrome.
2. **Time:** domain timestamps are ISO strings in feed time (sim time now). Display through `src/lib/time.ts` (`vi-VN`, `Asia/Ho_Chi_Minh`). Domain code never calls `Date.now()`/`new Date()` (lint rule, P01-T04).
3. **IDs:** string IDs with prefixes: `dep_`, `emp_`, `role_` (role *keys* are slugs), `task_`, `rev_`, `q_`, `help_`, `evt_`, `cmd_` + ULID. Config slugs (`key`) are lowercase snake_case and stable forever.
4. **Boundaries (lint-enforced):** `domain` imports nothing app-specific; `scene/{layout,nav,director}` import only `domain`; `scene/render` imports `office` + `scene/*`; nothing imports `adapters/**` except `office/feedRegistry.ts`, `office/configStore.ts` and `app/providers.tsx`.
5. **3D:** units are metres; +Y up; floor height 4.0 m; floor origin at its south-west corner; front (cutaway) side faces −Z. One `<Canvas>` in the app. No per-character React state updates in `useFrame` (use refs and transient zustand subscriptions). No `drei <Html>` per character (perf); use instanced sprites and SDF text.
6. **Colours:** UI colours only from tokens in `src/index.css`. 3D colours come from the palette texture or `src/scene/render/palette.ts` (which mirrors tokens). No ad-hoc hex in components.
7. **Assets:** every file in `public/assets/**` has a row in `art/LICENSES.md` and `public/assets/credits.json` (source URL, author, licence, date, modifications). CI fails otherwise (`scripts/licences-check.mjs`, P06a). Licences allowed: CC0, CC-BY 4.0 (with credit). Not allowed: NC, ND, SA, "personal use", unknown, Mixamo raw files, ripped game assets.
8. **Accessibility:** 2D screens follow existing rules. The 3D view has a keyboard-reachable people list and floor picker, and every 3D-only fact (status, pile counts) is also available in 2D panels.
9. **Writes:** the browser still never writes *operational* state; it sends Commands. **Amended rule (decided, see `contracts.md` §5):** *configuration* (org edits, appearance) is written through role-checked Postgres RPCs in P09+, because there is no worker to process those commands yet and they are owner edits, not work.
10. **Commits:** small, meaningful commits; Conventional Commit messages (`feat(scene): …`). Never commit `.env*` except `.env.example`.

## 6. Definition of done (every PR)

- [ ] `npm run typecheck && npm run lint && npm run test && npm run build` pass locally and in CI (`.github/workflows/ci.yml`, P01).
- [ ] `npm run test:e2e` passes (from P01): app boots, `#/office` renders, phone fallback at 375×812 has no horizontal scroll.
- [ ] The app runs from this branch alone (`npm run build && npm run preview`) and shows the phase demo.
- [ ] Every requirement of the phase has a passing test or a written manual check in the PR description.
- [ ] No hard-coded user-facing strings; `vi` and `en` keys match.
- [ ] Boundary lint rules pass; no import from `adapters/**` outside allowed files.
- [ ] Contract changes (events, commands, config schema, appearance schema, SQL) bump the version in `contracts.md` and add a changelog line.
- [ ] Asset PRs: licence ledger complete, size budget script passes (`assets.md` §6).
- [ ] Perf budget not regressed (from P04: `performance.md` §2 scene check).
- [ ] Reviewer checklist in the phase file ticked by the reviewing agent.
- [ ] `docs/plan/` updated if a decision changed (append to the phase file's "Design choices" with date).

## 7. Cross-phase interface register (authoritative)

Phase files were written in parallel. **Where a phase file names one of these things differently, this table wins**, and the agent fixes the phase file in the same PR.

| Thing | Decision | Introduced | Used by |
|---|---|---|---|
| Feed selection | `VITE_FEED = static \| sim \| replay \| none`. Default `static` in P01–P02, **`sim` from P03**. `none` aliases the sim folder to `src/adapters/_nosim` (NullFeed) for the removal proof. URL override `?feed=replay&log=<name>` in e2e builds | P01, P03 | P11-T09, tests |
| `ReplayFeed` | `src/adapters/replay/ReplayFeed.ts`; golden logs are JSON Lines in `src/domain/__fixtures__/golden/*.jsonl`; refresh with `npm run golden:update` | P03-T11 | testing.md |
| Debug hook | One object: `window.__office_debug` with `{ getState, renderer, stats, floors, sim, director, camera, characters }`, present only when `import.meta.env.DEV` or `VITE_DEBUG=1` (CI e2e sets it) | P02 (renderer/stats/getState), P03 (sim), P04 (director/camera), P07b (characters) | perf:check, e2e, P11 |
| Canvas ready marker | `[data-office-canvas][data-ready="true"]` | P02 | e2e |
| Extension slots | `officeExtensions.controlPanel` (sim panel) and `officeExtensions.tourControls` (demo tour) | P01 (registry), P03, P11 | – |
| Floor geometry | All templates 24 × 14 m, grid 0.5 m, shared core at the east end; floor keys `lobby_cafe`, `<department key>`, `<key>#2` (annex), `games_rest`, `management`, `boss` | P02 | P04–P06b |
| Slots | Each slot carries `footprint` (blocked cells) and `approach` (cell a person stands on to use it); doors are 2 cells wide; `lobby_cafe` has an `entrance` slot; `boss` has `boss_desk`. `FloorLabel` component and the floor fade/visibility API live in `src/scene/render/` and `src/scene/camera/viewStore.ts` | P02 | P03 (floor chips), P04 (nav) |
| `PersonVisual` | Props `{ employeeId, transformRef, actionRef, carrying, selected, lodHint }` + pick proxy capsule. `actionRef.current` is a **pose key** from the list below | P04 | P05, P07b |
| Pose / animation keys | One list in `src/scene/director/poses.ts`: `stand, walk, carry_walk, wait_stand, wait_elevator, ride, sit, sit_work, sit_read, sit_phone, wait_seat, talk, listen, stuck, done, greet, coffee, tea, sofa, nap_desk, sleep_bed, play_pingpong, play_arcade, play_boardgame, karaoke`. P04 implements the first block for capsules; P05 adds idle keys (referenced by `src/content/idle-behaviours.json`); P07a's `anim/library.glb` must contain a clip per key (`assets.md` §8.2 clip names map to keys in `src/scene/characters/clipMap.ts`); unknown key → `stand` | P04, P05, P07a/b | – |
| Movement vs sim speed | Walking does not scale linearly with sim speed (factor 1 / 1.6 / 3 at 1× / 30× / 120×) and trips fast-forward when state moves on. **2D counts follow events immediately; the 3D pile shows `pileFor(id).length − inTransit(id)`** and snaps to the state count when a trip is fast-forwarded or off-screen | P04, P05 | – |
| Furniture dimensions | Seat height 0.45 m, desk 0.74 m, bed 0.40 m, walk speed 1.3 m/s | P02 blockout | P06a, P07a |
| Tint and AO | Vertex-colour attributes `TINT` (R/G/B = primary/secondary/accent) and `AO`; materials `M_Palette`, `M_Glass`, `M_Emissive`, `M_Face` only; face cells in `textures/face_atlas.png` (512 px, 8 × 8), mapped by `src/content/catalog/face-atlas.json` | P06a, P07a | P06b, P07b, P08a |
| Anchors | GLB empties (`_seat`, `_stand`, `_pile`, `_screen`, `_hand_r`, …) are extracted to `public/assets/manifest.json`; rig attach bones `Attach_Head/HandL/HandR/Neck/Back/WristL` | P06a, P07a | P06b, P07b |
| Asset byte budgets | Environment ≤ 8 MB, characters + animation ≤ 6 MB, wardrobe + thumbnails ≤ 15 MB because garments exist per base (total ≤ 30 MB incl. fonts) | assets.md | P06a, P07a, P08a |
| Body base | `AppearanceV1.base: 'female' \| 'male'` (decided by the boss 2026-11-10: **separate bases**). Two meshes `body_female.glb` / `body_male.glb`, one shared skeleton, same shape-key names. Every garment is fitted **per base** by the pipeline (`<item>_f.glb`, `<item>_m.glb`); an item may support one base only (`bases` field) | data-model §2.10–2.11 | P07a/b, P08a/b |
| Roles table | `src/app/roles.ts` (`can()`, `routeAccess`) is the only place role access is decided | P08b | P09, P10 |
| Config writes | `ConfigChange` type declared in P01; `ConfigSource.apply`, `applyConfigChange`, `validateConfig` implemented in **P10**; P09 ships read + realtime + `save_appearance` | P01, P09, P10 | – |
| Contract versions | v1.0 through P08b, v1.1 in P09 (SQL + RPCs), v1.2 in P10 (`ConfigChange`) | – | – |
| Perf reference scene | Sim scenario **"Đông người"** (seed `perf-1`, pads to 80 people) provided by P03; measured by `npm run perf:check` from P04 | P03, P04 | performance.md |
| Final routes | `/` (office), `/org`, `/queue`, `/activity`, `/wardrobe`, `/admin`, `/settings`, `/credits`; legacy screens under `/legacy/*` until P11-T07 | P01 → P11 | – |

## 8. Supporting documents

| File | Contents |
|---|---|
| `00-audit.md` | Old plans, what to keep/merge/archive, proposed actions (awaiting approval) |
| `data-model.md` | Every entity, config file format, seed org, SQL sketch for P09 |
| `contracts.md` | Ports, OfficeEvent catalogue, Commands, versioning, write rules |
| `assets.md` | Art style guide, sourcing and licences, Blender pipeline, budgets, what the human must do |
| `performance.md` | Budgets, techniques, how to measure |
| `testing.md` | Test layers, tooling, fixtures, what each phase must test |
| `stacked-prs.md` | Branching, rebasing, reviewing and merging the stack |
| `after-this-phase.md` | What is left after P11, and what built now is expensive to change |
| `questions-and-assumptions.md` | Open questions ranked by impact, all assumptions |
| `phase-NN-*.md` | One per phase/PR |

## 9. How an agent picks up a task

1. Read this file, then `data-model.md`, `contracts.md`, the phase file, and the supporting doc the task names.
2. Check out the phase branch (`stacked-prs.md` §2). Tasks inside one phase are ordered; tasks marked **∥** can run in parallel within that phase.
3. Check §7 (interface register) for any name your task touches.
4. Do one task = one or more commits whose message starts with the task ID: `feat(domain): P03-T02 approval rule engine`.
5. Run the task's acceptance test and the DoD commands before pushing.
6. If the plan is wrong or ambiguous, make the smallest reasonable decision, record it under the phase's "Design choices" with the date, and flag it in the PR description. Do not block.
