# P02: Building blockout and cameras

## 1. Goal and demo
Generate the whole building from data and make it pleasant to look around, using only primitive shapes (real art comes in P06b).
**Demo after merge:** the home shows a 3D "dollhouse" building: lobby & café on the ground, four department floors with desk clusters in their department colour, a games & rest floor, the management floor and a visibly different boss floor on top, an elevator shaft with two cars and a stairwell. You can orbit and zoom the whole building, switch to free mode, click a floor (or use the floor picker / arrow keys) to focus it, and share the view through the URL. Adding a department in the config makes a new floor appear with the boss floor still on top.

## 2. Requirements
- **R1** `buildBuildingLayout(config)` is pure and deterministic: same config → deep-equal output.
- **R2** Floor order bottom → top: `building.stack` entries in order, the `departments` entry expanded to one floor per active department by `order`; the **boss floor is always appended last** even if a config lists it elsewhere or omits it.
- **R3** A department whose desk-needing headcount exceeds its template `deskArea.capacity` (16) gets annex floors directly above (`cs`, `cs#2`, …), each up to capacity. There is no floor limit (test with 40 departments).
- **R4** Every active employee gets exactly one workspace slot matching their role's `workspace`; allocation order = role `sortOrder`, then `createdAt`, then `id`. Adding a new employee never moves existing people **within the same floor** unless an annex boundary shifts.
- **R5** Five templates exist and validate: `department`, `lobby_cafe`, `games_rest`, `management`, `boss`, each with ≥ 1 `elevator_door` per car column and 1 `stairs_entry` at identical x/z on every floor.
- **R6** The scene renders all floors, slots as blockout furniture, department colour accents, a floor label (Vietnamese diacritics correct) and floor number; front (−Z) side open.
- **R7** Camera modes: **overview** (whole building fits, orbit limited to the front hemisphere, zoom limits), **free** (unconstrained orbit/pan/dolly + WASD/QE), **floor** (fits the selected floor; floors above fade to 15 % opacity and stop casting shadows). `follow` exists in the type but is disabled until P04.
- **R8** View state is in the URL: `#/?cam=overview|free|floor&floor=<floorKey>`; reloading restores it; an unknown floor key falls back to overview.
- **R9** Controls: floor picker (list, top floor first), camera mode bar, keyboard `1` overview, `2` free, `F` focus selected/hovered floor, `↑`/`↓` previous/next floor, `Esc` back to overview. All controls are keyboard reachable with visible focus and labelled in `vi`/`en`.
- **R10** Clicking a floor (not dragging) focuses it; hover highlights its edge.
- **R11** The building rebuilds within one frame when the config changes (store subscription), keeping the camera mode; if the focused floor disappeared, go to overview.
- **R12** Baseline lighting with soft shadows; adaptive DPR via drei `PerformanceMonitor` (range 1–2); ≥ 60 fps on the dev Mac at 1440p with the seed building; draw calls ≤ 150 (measured, in PR).
- **R13** `prefers-reduced-motion`: camera transitions are instant.
- **R14** E2E: canvas reports ready; one screenshot per camera mode attached to the PR; phone project still shows the fallback (no canvas).

## 3. Specs
### 3.1 Layout model (`src/scene/layout/`, pure)
```ts
interface BuildingLayout {
  floors: FloorLayout[]                 // index 0 = ground
  floorHeight: number                   // 4.0
  footprint: { w: number; d: number }   // max over floors (all templates share w=24, d=14 by default)
  shafts: { elevator: { x: number; z: number; cars: number }; stairs: { x: number; z: number } }
  byKey: Record<string, number>         // floorKey → index
  seatOf: Record<EmployeeId, SeatRef>   // { floorKey, slotId }
}
interface FloorLayout {
  key: string                           // 'lobby_cafe' | 'cs' | 'cs#2' | 'games_rest' | 'management' | 'boss'
  index: number; y: number              // y = index × floorHeight
  kind: 'fixed' | 'department' | 'annex' | 'boss'
  departmentId: DepartmentId | null
  templateKey: string; size: { w: number; d: number }
  label: Label; colorSwatch: string
  slots: PlacedSlot[]                   // fixedSlots + generated desk slots, in floor-local metres
  walls: WallSegment[]
  occupants: Record<string /*slotId*/, EmployeeId>
}
```
Files: `buildingLayout.ts` (stack expansion, annexes, boss on top), `floorLayout.ts` (template → slots; desk generation), `allocate.ts` (people → slots), `templates.ts` (load + validate JSON), `index.ts`.
**Desk generation:** inside `deskArea.rect`, place clusters of `cols × rows` (2×2, desks facing each other) with `spacing` aisles, row-major from the west; generate only as many clusters as needed (`ceil(deskPeople / 4)`, min 2 so a small department does not look empty), slot ids `desk_<n>` stable by index. Each desk has a `pile_anchor` child slot (`desk_<n>.pile`).
**Workspace mapping:** `private_office` → the template's `private_office` slot (dept manager, with `waiting_seat` slots outside its door); `review_desk` → `review_desk` slots (lead first, then reviewers; template has 4, overflow uses desks); `desk` → generated desks; `manager_office` → management floor; `boss_office` → `boss_desk` slots on the boss floor (2 seed owners; template has 3).
**Coordinates:** floor-local origin at the south-west corner, +X east, +Z north (back wall), −Z side open; world position = `(x − w/2, index × 4, z − d/2)` so the building is centred on the origin.

### 3.2 Templates (`src/content/floor-templates/*.json`)
All 24 × 14 m, `gridCell` 0.5. Shared core on the **east end** (x 20–24): elevator doors at (20.5, 9) and (20.5, 11) facing west, stairs entry at (21, 4); every template repeats these exact slots.
| Template | Zones and slots |
|---|---|
| `department` | West (x 0–5): glass `private_office` at (2.5, 10.5) with door facing east, 4 `waiting_seat` (bench) outside at (5.5, 9–12), `meeting_table` at (2.5, 4). Centre (x 6–17): `deskArea` rect (6,2)–(17,12), capacity 16. East of desks (x 17.5–19.5): 4 `review_desk` in a row at z 3,5,7,9 (the "review counter"). Idle: `idle_water` (19, 12.5), `idle_chat` ×2, `idle_window` ×2 on the back wall, 4 `decor` (plants), 1 `cat_spot` |
| `lobby_cafe` | Reception desk (decor) at (12, 3), entrance door marker on the west wall (people arrive/leave here in P04), café: `idle_coffee` ×2, `idle_tea_table` ×2 (4 seats each), `idle_sofa` ×3, `idle_chat` ×3, plants, `cat_spot` ×2 |
| `games_rest` | Games half (x 0–11): `idle_pingpong`, `idle_arcade` ×3, `idle_boardgame` ×2, `idle_karaoke` booth. Rest half (x 12–19, dimmer): `idle_bed` ×8 (sleep pods in two rows), `idle_massage_chair` ×2, `idle_sofa` ×2 |
| `management` | `manager_office` (Thu) at (4, 9) with 4 `waiting_seat` outside, intake desk with phone/Telegram screen (decor), `meeting_table` (8 seats), a task wall (decor, big board), 2 spare `desk` slots, plants |
| `boss` | **Different look:** floor only 18 m wide indoor (x 0–18) + a **roof terrace** (x 0–6, open, no ceiling, plants, `idle_sofa`), darker "wood" swatch floor, gold accent; one large open office with up to 3 `boss_desk` (each with `pile_anchor` and an out-tray anchor), a lounge corner, 6 `waiting_seat` near the elevator, big `idle_window`; pitched/flat roof cap above |
Walls: back wall (z = 14) and side walls as segments with window gaps; no front wall; no ceiling geometry (the slab of the floor above is the ceiling, 0.3 m thick).

### 3.3 Rendering (`src/scene/render/`, blockout)
- `Building.tsx`: maps `BuildingLayout.floors` → `<Floor>`; keyed by floor key so floors animate in when added (200 ms scale-in, skipped with reduced motion).
- `Floor.tsx`: slab (box), walls, accent strip in department colour along the slab front edge, label (`<Text>` on the front edge, left: "3 · Marketing"), pick mesh (invisible box) for hover/click.
- `Blockout.tsx`: **one `InstancedMesh` per blockout kind for the whole building** (desk, chair, review desk, bench seat, sofa, bed, table, plant, arcade, pingpong, generic decor): boxes/cylinders sized per `SLOT_BLOCKOUT[slotType] = {shape, size, swatch}` in `blockoutSpec.ts`. Instance colour for department accents. P06b swaps this file for GLB instancing, keeping `SLOT_BLOCKOUT`'s role as the slot → asset table.
- `ElevatorShaft.tsx`: translucent shaft box over all floors, 2 car boxes parked at ground (state-driven from P04), door frames per floor. `Stairwell.tsx`: zig-zag ramp boxes.
- `palette.ts`: reads `src/content/palette.json` → `THREE.Color` cache; the only place colours are created.
- `FloorFade.ts`: per-floor opacity uniform (materials `transparent` only while fading) used by floor mode.
- `Lights.tsx`: hemisphere + one directional light with a 2048 shadow map fitted to the building bounds, soft (PCFSoft); `ContactShadows`/AO not used yet. Background: soft sky gradient colour from tokens, a large ground disc.
- `OfficeCanvas.tsx`: `<Canvas shadows dpr={[1, 2]} camera={{fov: 35}}>`, `PerformanceMonitor` → DPR state, sets `data-ready="true"` on the wrapper after the first rendered frame (for e2e), exposes `window.__office_debug = { drawCalls, triangles }` in dev/e2e builds only.
- Font: `public/assets/fonts/BeVietnamPro-SemiBold.ttf` (OFL 1.1) + `public/assets/fonts/OFL.txt`; first row of `public/assets/credits.json` and `art/LICENSES.md` (files created here, validator comes in P06a). Loaded via `import.meta.env.BASE_URL`.

### 3.4 Camera (`src/scene/camera/`)
- `viewStore.ts` (zustand): `{mode, floorKey, hoveredFloorKey, followId: null}` + actions; two-way sync with the URL search params (`useSearchParams`, replace not push while dragging).
- `CameraRig.tsx`: one drei `<CameraControls>`; on state change calls `fitToBox` / `setLookAt` with 0.6 s smooth time (0 with reduced motion).
  - overview: fit building bounds + 10 % padding; azimuth clamp ±70° around the front, polar 35°–88°, distance clamp [0.4×, 2×] of fit distance.
  - floor: fit that floor's box from front-above (polar ~62°), azimuth ±45°, floors with index > focused fade to 0.15 opacity; floors below stay.
  - free: no clamps except min distance 2 m and y ≥ 0.5; WASD/QE move the target at a speed proportional to distance; hint chip shows the keys.
- `useKeyboardShortcuts.ts`: R9; ignored while focus is in an input/textarea/dialog.

### 3.5 Overlays (`src/features/office/`)
`FloorPicker.tsx` (left, vertical list top → bottom mirroring the building; each row: number, label, department swatch, headcount; `aria-current` on the focused floor), `CameraModeBar.tsx` (top centre, 3 toggle buttons with `aria-pressed`, follow disabled with tooltip "Có ở giai đoạn 4"), `ShortcutHint.tsx`. HTML overlays sit above the canvas in normal DOM (not drei `<Html>`).

## 4. Design choices
| Topic | Options | Choice | Reason | Revisit if |
|---|---|---|---|---|
| Seeing inside | transparent walls · remove roof per floor · **open front (dollhouse)** | **Dollhouse + fade floors above in floor mode** | Reads like a company at a glance from the front; no per-frame wall culling | The boss wants to walk around inside → add interior camera in P11 |
| Floor shape | free-form per department · one rectangle size | **24 × 14 m rectangle for all, boss narrower with terrace** | Shared elevator/stairs positions, trivial nav grid, simple annexes | Departments need very different sizes → allow `size.w` per template, core stays at east end |
| Growth | wider floors · annex floors | **Annex floors above** | "No floor limit" is already required; width growth would break the shared core and camera fits | – |
| Layout code | inside React components · pure module | **Pure `scene/layout`** | Director and nav (P04) need the same data; unit-testable | – |
| Camera lib | drei OrbitControls · drei CameraControls | **CameraControls** | Smooth `fitToBox`/`setLookAt` transitions and clamps built in | – |
| Blockout draw strategy | one mesh per desk · instancing per kind | **Instancing per kind from day one** | Keeps draw calls flat as floors are added; same pattern P06b uses with GLBs | – |
| Labels | drei `<Html>` · troika `<Text>` | **troika** | No DOM per floor, scales with zoom, Vietnamese glyphs from our TTF | – |
| View state | component state · URL | **URL (hash query)** | Shareable, reload-safe, testable | – |
| World coordinates (2026-11-10) | raw `(x, z)` · centred `(x - w/2, d/2 - z)` | **Centred `(x - w/2, y, d/2 - z)` (`coords.ts`)** | Places West (`x=0`) on the viewer's left, East (`x=24` core) on the right, back wall at `-d/2`, and open dollhouse front at `+d/2` facing `+Z` so `CameraControls` azimuth clamps (`±70°` / `±45°`) and troika `<Text>` labels work without `±π` branch-cut wraparound | – |
| Upper-floor fade in floor mode (2026-11-10) | `visible = false` · **15 % opacity (`depthWrite = false`, `castShadow = false`)** | **15 % opacity** | Keeps upper-floor context visible without sorting artefacts when `depthWrite` and `castShadow` are disabled on faded floors and instanced batches | – |
| Wall & stair draw calls (2026-11-10) | individual `<mesh>` per segment · **`<instancedMesh>`** | **Instanced walls per floor + instanced stair ramps/landings** | Keeps total WebGL draw calls (including shadow pass) at **134** (≤ 150 budget) and triangles at **7,284** for the 8-floor seed building | – |

## 5. Tasks
- [x] **P02-T01** Template schema + five templates. *Files:* `src/content/floor-templates/{department,lobby_cafe,games_rest,management,boss}.json`, `src/domain/config.ts` (tighten: templates required, shared-core check R5), `scripts/content-validate.mjs`. *Steps:* §3.2 coordinates; validator checks slots inside `size`, no two slots within 0.4 m, core slots identical across templates. *Acceptance:* R5; `content:validate` passes and fails when a stairs slot is moved in one template.
- [x] **P02-T02** `buildingLayout.ts` + tests. *Files:* `src/scene/layout/{buildingLayout,templates,index}.ts`, `__tests__/buildingLayout.test.ts`. *Acceptance:* R1, R2, R3: tests "seed → 8 floors in order lobby, cs, marketing, design, accounting, games_rest, management, boss", "add a department → 9 floors, boss still top", "boss listed in stack is ignored/deduped", "40 departments → 44 floors", "inactive department has no floor".
- [x] **P02-T03** `floorLayout.ts` desk generation + tests. *Files:* `src/scene/layout/floorLayout.ts`, test. *Acceptance:* desks inside rect, no overlaps, cluster count rule, stable slot ids; "17 desk workers → annex `cs#2` with 1 desk cluster minimum".
- [x] **P02-T04** `allocate.ts` + tests. *Files:* `src/scene/layout/allocate.ts`, test. *Acceptance:* R4: every seed employee seated once; dept manager in `private_office`; lead + reviewers at review desks; owners at boss desks; Thu in `manager_office`; adding a worker keeps previous seats; archived employees get no seat.
- [x] **P02-T05** ∥ Palette + font assets. *Files:* `src/scene/render/palette.ts`, `public/assets/fonts/*`, `public/assets/credits.json`, `art/LICENSES.md`. *Steps:* download Be Vietnam Pro SemiBold TTF from the official Google Fonts repo (OFL), record source URL + licence. *Acceptance:* a `<Text>` rendering "Chăm sóc khách hàng · Kế toán · Thiết kế" shows all diacritics (screenshot).
- [x] **P02-T06** Floor + Building components. *Files:* `src/scene/render/{Building,Floor,FloorFade}.tsx`, `src/scene/OfficeCanvas.tsx`. *Steps:* subscribe to config → `useMemo(buildBuildingLayout)`; slabs, walls, accent strip, label, pick mesh. *Acceptance:* R6 (structure), R11 (dev-only button or test hook that adds a department → new floor appears, boss on top).
- [x] **P02-T07** Instanced blockout furniture. *Files:* `src/scene/render/{Blockout,blockoutSpec}.tsx`. *Acceptance:* every slot type in `data-model.md` §2.9 has a `SLOT_BLOCKOUT` entry (type-checked `Record<SlotType, …>`); draw calls ≤ 150 for the seed building.
- [x] **P02-T08** ∥ Elevator shaft + stairwell + ground/sky. *Files:* `src/scene/render/{ElevatorShaft,Stairwell,Environment}.tsx`. *Acceptance:* shaft spans all floors and grows with the building; doors align with `elevator_door` slots.
- [x] **P02-T09** Lights, shadows, adaptive DPR, debug counters. *Files:* `src/scene/render/Lights.tsx`, `OfficeCanvas.tsx`. *Acceptance:* R12; `data-ready` set; `__office_debug` present only when `import.meta.env.DEV || VITE_E2E`.
- [x] **P02-T10** View store + URL sync. *Files:* `src/scene/camera/viewStore.ts` (+ test), `src/features/office/OfficePage.tsx`. *Acceptance:* R8 unit tests (parse/serialise, unknown floor fallback).
- [x] **P02-T11** Camera rig and modes. *Files:* `src/scene/camera/{CameraRig,modes}.tsx`. *Acceptance:* R7, R13; manual check list in PR (overview clamps, floor fade, free WASD).
- [x] **P02-T12** Picking + hover. *Files:* `Floor.tsx`, `viewStore.ts`. *Steps:* distinguish click from drag (pointer travel < 4 px); cursor pointer on hover; edge highlight. *Acceptance:* R10.
- [x] **P02-T13** Overlays + shortcuts. *Files:* `src/features/office/{FloorPicker,CameraModeBar,ShortcutHint}.tsx`, `src/scene/camera/useKeyboardShortcuts.ts`, `src/i18n/{vi,en}/office.ts`. *Acceptance:* R9; axe-style manual check: tab order picker → mode bar; labels in both languages.
- [x] **P02-T14** E2E + screenshots. *Files:* `e2e/building.spec.ts`. *Steps:* wait `data-ready`; visit `#/?cam=overview`, `#/?cam=floor&floor=marketing`, `#/?cam=free`; save screenshots as artifacts (not pixel-compared); assert `__office_debug.drawCalls ≤ 150`; phone project asserts no `<canvas>`. *Acceptance:* R14.
- [x] **P02-T15** Remove P01 placeholder + docs. *Files:* `OfficeCanvas.tsx` (drop temporary OrbitControls/overlay text and its i18n keys), `docs/plan/phase-02-building.md` (measured draw calls, fps, any coordinate changes). *Acceptance:* no unused i18n keys; numbers recorded.

Order: T01 → T02 → T03 → T04 → (T05 ∥ T08) → T06 → T07 → T09 → T10 → T11 → T12 → T13 → T14 → T15.

## 6. Dependencies
- **Needs:** P01 (config store, `OfficeCanvas`, device gate, palette.json, Playwright).
- **Later phases rely on:** `BuildingLayout`/`FloorLayout`/`PlacedSlot`/`seatOf` (P04 nav grid, director targets; P05 piles, waiting seats, idle spots); shared core positions (P04 elevator + stairs routing); `SLOT_BLOCKOUT` as the slot → visual table (P06b); `viewStore` with reserved `follow` mode (P04); `FloorFade` (P04 hides people on faded floors); `palette.ts` (all render code); `data-ready` + `__office_debug` (e2e and perf checks in every later phase); floor keys incl. annex form `cs#2` (events' `locationHint.floorKey`).

## 7. Branch and PR
- Branch `stack/p02-building` from `stack/p01-foundation`. PR base `stack/p01-foundation`. Title: `[P02] Procedural building blockout + camera modes`.
- Description template:
```md
<stack map>
## What
Building generated from config (pure layout + blockout render), 3 camera modes, floor picker, URL view state.
## How to check
1. npm run build && npm run preview → home shows 8 floors, boss on top with terrace
2. Click a floor / press ↓ ↑ / F / 1 / 2 / Esc
3. Open #/?cam=floor&floor=design directly
4. (dev) localStorage override adding a department → 9 floors
## Evidence
Screenshots: overview / floor / free. Draw calls: … Triangles: … FPS (1440p): …
## Contract
Config: floor templates added (additive). No event/command change.
```

## 8. Review checklist
- [x] `scene/layout` imports only `domain`; no three, no React; tests cover R1–R4.
- [x] Boss floor cannot be anywhere but top (try reordering `building.json`).
- [x] Core (elevator/stairs) slots line up vertically on every floor including boss and annexes.
- [x] Furniture is instanced; draw calls and triangle count in PR body; no per-frame allocations in `useFrame` (no `new Vector3` in loops).
- [x] No `<Html>` inside the canvas; labels are troika text with our font; diacritics correct.
- [x] All asset URLs use `import.meta.env.BASE_URL` (works under `/Dashboard-N8N-tasks/`).
- [x] Colours only via `palette.ts`.
- [x] URL state restores on reload; Esc/shortcuts ignored while typing in inputs.
- [x] Reduced motion respected; overlays keyboard reachable; strings in `vi`/`en`.
- [x] Phone fallback unaffected; three still not in the main chunk.

### Measured P02 metrics (2026-11-10, 8-floor seed building at 1440×900)
- **Draw calls (`gl.info.render.calls`, incl. shadow pass):** `134` (budget `≤ 150`)
- **Triangles (`gl.info.render.triangles`):** `7,284`
- **Geometries / Textures:** `93` geometries · `4` textures
- **FPS:** `60 fps` on Mac hardware GPU at 1440p (`~19 fps` under headless Chromium CPU `--use-gl=swiftshader` in CI/Playwright)
- **Bundles:** `index-*.js` `554.9 KB` raw (`164.2 KB` gzip, `0 B` of `three`) · `OfficeCanvas-*.js` lazy chunk `1,117.8 KB` raw (`306.8 KB` gzip)
- **Coverage:** `src/domain` `93.7%` lines · `src/scene/layout` `97.5%` lines (threshold `≥ 90%`)

## 9. Risks and open questions
- Transparent fading of whole floors can cause sorting artefacts; fallback is to hide floors above (visible = false) instead of 15 % opacity. Decide by look in T11 and record it.
- troika font parsing happens in a worker from a blob URL; if the Pages CSP or base path breaks it, preload with `preloadFont` and set `useWorker` off.
- Shadow map over a 40-floor building loses resolution; acceptable for now, P11 can switch to cascades or fit to the focused floor.
- Desk-cluster minimum (2 clusters) makes small departments show empty desks; that is intended (room for temps), confirm with the boss during the P02 demo.


## 10. Additions required by later phases (see `00-overview.md` §7)
- Every slot in the floor templates carries `footprint` (blocked nav cells) and `approach` (the cell a person stands on); door openings are 2 cells wide. `lobby_cafe` has an `entrance` slot; `boss` has a `boss_desk` slot. Covered by the template validation task.
- `FloorLabel` (name + optional chips) is a reusable component; P03 feeds it live counters.
- The floor fade/visibility API is exported from `src/scene/camera/viewStore.ts` for P04's follow mode.
- Blockout dimensions: seat 0.45 m, desk 0.74 m, bed 0.40 m.
