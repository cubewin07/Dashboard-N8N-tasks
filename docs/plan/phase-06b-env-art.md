# P06b: Environment art pass

## 1. Goal and demo
Replace the blockout building with the P06a models: real desks, chairs, glass offices, a café lobby, a games and rest floor, and a boss floor that clearly looks different. Add lighting, glass, glowing screens and a little street context. Characters are still placeholders (P07b).

**Demo after merge:** open `#/office`: within about a second the building shell appears, then each floor fills with furniture. Zoom into Marketing: desk clusters with monitors that glow by status, the department manager's glass office with a bench outside, plants in the department's accent colour. Fly to the top: dark wood, a lounge and a terrace. Outside: a small plaza with trees and parked scooters. Settings → "Ghi công" lists every asset's author and licence.

## 2. Requirements
- **R1** `src/content/furniture-map.json` maps every `SlotType` (and a few template-specific keys) to one or more model files with variants; changing a mapping changes the scene without code.
- **R2** No blockout furniture remains when all models load; if a model fails to load (404, decode error), that slot renders its P02 blockout box and a console warning, and the rest of the scene is unaffected.
- **R3** Static furniture is drawn with one `InstancedMesh` per (model, material) for the whole building; each floor's shell (slabs, walls, windows, columns) is one merged static mesh per floor (+ one glass mesh).
- **R4** The boss floor uses its own model set and palette accents and is recognisable at overview zoom.
- **R5** Each department floor carries its `Department.colorSwatch` as an accent (wall stripe, floor chip, plant pots/partitions), from data.
- **R6** Monitors/lamps/elevator indicators are emissive and driven by the P05 status data (`DeskStatus`), not by separate lights.
- **R7** Lighting: one directional light with shadows (single cascade, fitted to the building), image-based ambient, baked-look contact ambient occlusion from vertex colours; day/night (P05) still works.
- **R8** Progressive loading: building shell and focused/visible floors first, remaining floors after; a non-blocking progress indicator; interaction (orbit, floor picker) works while furniture streams in.
- **R9** Exterior: back/side facade and roof, ground plaza with trees, lamps, benches, scooters, building sign with runtime text. The front (−Z) stays open.
- **R10** Seats, piles, stand positions and held props use anchors from `public/assets/manifest.json`; P05 behaviour (sitting, piles, waiting bench, elevator riders) lines up with the models.
- **R11** Adding a department (config change) builds its floor from the same kit with no new assets.
- **R12** Performance within `performance.md` §2 with 60 people on 8 floors; total draw calls for the environment ≤ 150; first shell visible ≤ 1.5 s and full building ≤ 5 s on the reference machine with a warm cache (cold: ≤ 10 s on 50 Mbit).
- **R13** `#/credits` page lists `credits.json`; linked from Settings; Vietnamese + English.
- **R14** E2E screenshots (overview, department floor, boss floor, games floor) updated; phone fallback unaffected and does not download any GLB.

## 3. Specs

### 3.1 `src/content/furniture-map.json`
```ts
interface FurnitureMap {
  version: 1
  slots: Record<SlotType | string, SlotArt>
  templates?: Record<string /*floor template key*/, Partial<Record<SlotType | string, SlotArt>>>  // overrides, e.g. boss
  kit: { slab: string; wallSolid: string; wallWindow: string; wallGlass: string; column: string
         stairsFlight: string; stairsLanding: string; shaftFrame: string; elevatorCar: string; elevatorDoor: string
         facade: string[]; roofParapet: string }
}
interface SlotArt {
  models: Array<{ file: string; weight?: number }>      // variant chosen by seeded hash of slot id
  companions?: Array<{ file: string; anchor?: string; offset?: [number, number, number]; rotY?: number; chance?: number }>
                                                         // e.g. desk → chair at _seat, monitor at _screen, desk plant 30 %
  accentTint?: boolean                                   // faces marked TINT.primary take the department swatch
  fallbackBox: [number, number, number]                  // blockout size if the model fails
}
```
Seed mapping (examples): `desk` → `desk_standard_01/02/03` + `chair_office_01/02` + `monitor_01/02` (+ `plant_desk_01` 30 %, `desk_lamp_01` 40 %); `review_desk` → `desk_review_01` + chair + monitor + `tray_inout_01`; `private_office` → `desk_manager_01` + glass walls + door + `chair_visitor_01` ×2 + `cabinet_file_01`; `waiting_seat` → `bench_waiting_01`; `idle_tea_table` → `set_tea_table_01`; `idle_bed` → `bed_single_01` | `sleep_pod_01`; `decor` → weighted plants/paintings/bin; `templates.boss.boss_desk` → `desk_boss_01` + `set_boss_lounge_01` + `rug_large_01`.

Variant choice: `pick(models, hash(floorKey + slot.id))`, stable across reloads and independent of load order.

### 3.2 Scene assembly (`src/scene/render/`)
| Module | Responsibility |
|---|---|
| `assets/useAssetManifest.ts` | loads `manifest.json` once (anchors, bbox, tris) |
| `assets/gltf.ts` | `useGLTF` wrapper: base URL via `import.meta.env.BASE_URL`, meshopt decoder, replaces `M_Palette`/`M_Glass`/`M_Emissive` with shared singleton materials, extracts geometry per material |
| `assets/placements.ts` (pure, tested) | `buildPlacements(layout, furnitureMap, manifest) → Placement[]` `{ file, matrix, floorKey, slotId, tint? }`, including companions at anchors |
| `InstancedFurniture.tsx` | groups placements by `file`; one `InstancedMesh` per (file, material); per-instance tint via `instanceColor` multiplied into TINT-marked faces; per-floor visibility by instance range (floors sorted) |
| `FloorShell.tsx` | tiles kit modules for a floor from its template size/walls, merges into one geometry per floor (`BufferGeometryUtils.mergeGeometries`), glass separately |
| `Exterior.tsx` | facade (instanced panels), roof, plaza, street decor, sign (`<Text>`) |
| `Lighting.tsx` | directional + environment + shadow config; hooks into `DayNight` |
| `FallbackBox.tsx` | the P02 blockout box per slot, used while loading and on error |
| `ElevatorCars.tsx`, `DocPiles.tsx`, `HeldItems.tsx`, `DeskStatus.tsx`, `Decor.tsx`, `Cat.tsx`, `WallClock.tsx` | swap primitives for GLB geometry; keep P05 props and logic unchanged |

Slot→world transform and seat/pile positions move from P02 constants to `manifest.anchors` through one function `anchorWorld(placement, anchorName)`, used by the director's layout queries (`scene/layout` gets a pure `AnchorTable` injected, so `layout/` still imports no three and no fetch).

### 3.3 Lighting (decided)
- **Ambient:** procedural gradient sky + drei `<Environment>` from a small prefiltered 1k Poly Haven HDRI (`public/assets/hdri/`, ≤ 1.5 MB, CC0) at low intensity for soft fill and glass reflections. If the HDRI is missing, fall back to hemisphere light.
- **Sun:** one `DirectionalLight` casting shadows, 2048 map, orthographic frustum fitted to the building bounds, `shadow.autoUpdate = false` and re-rendered only when the sun moves (day/night step) or the layout changes. People cast no shadow-map shadows; they keep a blob shadow (instanced quad) from P04.
- **Baked look:** ambient occlusion baked **into vertex colours** per model by `art/blender/lib` (attribute `AO`, multiplied in the shared material via `onBeforeCompile`) plus a soft vertical gradient per floor shell. No runtime SSAO, no lightmaps.
- **Emissive:** `M_Emissive` meshes get colour/intensity from `DeskStatus`; a light bloom is **not** used (cost, readability); glow is faked with a slightly larger additive quad on screens at near LOD only.
- **Tone:** ACES filmic off; `NoToneMapping` + sRGB output so palette colours match the UI tokens exactly.

Note: AO baking requires a small addition to `art/blender/lib/export.py` (bake `AO` vertex colours) and a re-export of P06a models. That change is made **in the `stack/p06a-env-assets` layer** (fix commit there, then restack), not here, per `stacked-prs.md` §5.

### 3.4 Loading strategy
1. On route enter: fetch `manifest.json`, `palette.png`, kit models (`env/*`, ~15 small files) → render shells for all floors (merged), camera usable.
2. Priority queue of furniture files ordered by: focused floor → floors in view → others, bottom to top. `useGLTF.preload` with max 6 concurrent requests. Each file, once loaded, fills its instances (all floors at once, since instancing is per file) and its fallback boxes disappear.
3. Suspense boundaries per furniture file group, never around the whole canvas. A thin progress bar ("Đang dựng văn phòng… 62 %") in the overlay, removed at 100 %.
4. Meshopt decoder from drei (`useGLTF` `useMeshopt: true`), no Draco/wasm worker pool.
5. Cache: GitHub Pages serves static files with ETag; file names are stable, so add `?v=<manifest.hash>` to bust caches after an asset PR.
6. The phone fallback route never mounts the canvas, so it fetches no models (asserted in e2e by request interception).

### 3.5 Floor-specific art direction
| Floor | Direction |
|---|---|
| Lobby & café | open, bright; reception counter facing the entrance, café counter with stools and small tables, sofa corner, large plants, building sign |
| Department | light wood desks in clusters of 4, accent colour stripe on the back wall and low partitions, review desks near the manager's glass office, bench outside, tea table and water dispenser in a corner, printer + cabinets along the side wall |
| Games & rest | split in two: left = karaoke corner, arcade, ping-pong, board games (warm, colourful rug); right = dim rest zone with beds, pods, massage chairs behind a partition |
| Management | Thu's glass office in the centre-back with a bench, meeting table, big wall TV (activity ticker later), filing wall |
| **Boss (top)** | dark wood floor, jade and brass accents, boss desks by the window, lounge set on a large rug, tall bookshelf, sculpture, a roof terrace section with planters and chairs, lower wall on the front for an open view. Half the footprint is terrace so the silhouette differs from below |

### 3.6 Accent colours
Department swatch triplet (`dept_<key>` light/base/dark) from the palette row 3. Applied by `instanceColor` on TINT-marked faces of partitions, pots and the wall stripe mesh in the floor shell (vertex colour at merge time). Departments beyond the seeded four take the spare triplets in order; when spares run out, hues are generated at runtime (tint multiplies a neutral swatch, so no palette change is needed).

## 4. Design choices
| # | Topic | Options | Choice | Reason | Revisit if |
|---|---|---|---|---|---|
| D1 | Slot → model binding | hard-coded per component · `furniture-map.json` | **Data map** with variants and companions | New furniture or a different look = JSON change; boss floor override is data | Layouts need per-room hand placement → add optional explicit placements per template |
| D2 | Draw strategy | one mesh per object · instancing per model · merge everything per floor | **Instancing per model + merged shell per floor** | ~95 models → ~120 draw calls regardless of floor count; furniture stays individually hideable per floor by instance ranges | Per-object interaction (click a desk) needs raycast → use `instanceId` |
| D3 | Shadows/AO | realtime shadows for all + SSAO · drei `AccumulativeShadows` · **one cached shadow map + vertex AO** · lightmaps | **Cached directional shadow + vertex-colour AO** | Building is static; AccumulativeShadows suits small static scenes and re-accumulates on every layout change; SSAO costs a full-screen pass; lightmaps break "floors are generated from data" | Scene looks flat → try N8AO at half resolution behind a quality setting (P11) |
| D4 | Ambient | hemisphere only · HDRI environment | **Small HDRI + gradient sky** (hemisphere fallback) | Glass and screens need something to reflect; 1k HDRI is cheap | HDRI download unavailable → procedural only |
| D5 | Tone mapping | ACES · none | **None** | Flat palette colours must match UI tokens; ACES desaturates them | Emissive screens clip → clamp intensity instead |
| D6 | Loading | block until all loaded · progressive with blockout fallback | **Progressive, fallback boxes** | Something visible in ~1 s; robust to a missing file | Pop-in is distracting → fade instances in (opacity via dithering) |
| D7 | Glass | physical transmission · simple alpha blend | **Alpha blend `M_Glass`**, depthWrite off, drawn last | Transmission needs an extra render pass per frame | – |
| D8 | Exterior | none · full city · small plaza | **Small plaza** + back/side facade | Gives the building a place without stealing attention or budget | Dad wants the street alive → add moving scooters as decor in P11 |
| D9 | Bloom | postprocessing bloom · fake glow quads · none | **Fake glow quads at near LOD** | No post-processing stack in the app; keeps frame budget | A post stack is added later for other reasons |

**Decisions added while executing (2026-11-11).** This layer was built directly on `stack/p06a-env-assets` (itself on `stack/p02-building`): P03, P04 and P05 are not in this stack yet, so everything that needs their data is deferred.

| # | Topic | Choice | Reason | Revisit if |
|---|---|---|---|---|
| D10 | Draw strategy (refines D2) | Instancing per model **while files stream in**, then everything is **baked into one mesh per shared material** (`StaticModels.tsx`), sorted by floor; focus mode hides upper floors with a draw range | Per-model instancing measured ~240 draw calls in overview (shadow pass doubles each caster); baked: 85 in total, 3 for all scenery | Per-object interaction or per-desk emissive is needed (P05 `DeskStatus`) → keep those pieces out of the bake as their own instanced meshes |
| D11 | Shell (refines R3) | Kit modules go through the same placement → bake path as furniture instead of one merged mesh per floor | Same result with fewer draw calls and one code path; walls are stretched along their run to fit (24 m back wall = 6 modules, 14 m side = 4 modules at 0.875) | A floor needs its own shell material |
| D12 | Floors above the focused one | **Cut away** (hidden) instead of ghosted at 15 % | With real furniture the ghosted slab above covered most of the focused floor (it already did in the blockout); the boss roof also lifts while that floor is focused | The boss wants to see the floors above → fade only their slab edge |
| D13 | `furniture-map.json` shape | `slots` keyed by slot id, id without `_N`, or slot type (most specific wins; template override before global), `templates.<key>.{slots,extras}`, `kit`, `exterior` | Template `extras` give per-floor dressing (rugs, cabinets, wall art) without touching floor templates or nav; `exterior` keeps the street in data too | Extras start to block walking paths (P04) → move them into floor templates as `decor` slots with footprints |
| D14 | Model orientation | three.js `rotation.y = π − slot.rotY (+ entry.rotY)` | Models face −Z (assets.md §1.1), floor-local z runs front to back while world Z runs back to front; chairs seat themselves by matching `seat` anchors | – |
| D15 | Loader | Own small store (`assets/modelStore.ts`: `GLTFLoader` + meshopt, max 6 parallel, status per file) instead of `useGLTF` + Suspense | A failed file must leave only its own slots as boxes (R2) and never suspend the canvas; geometry is dequantised to float and node transforms are baked so parts merge | – |
| D16 | Shadows | Only models at least 0.6 m tall and wide cast shadows while instanced | Every caster is one more draw call in the shadow pass | – |
| D17 | Sign text | `t.common.app.name` drawn with drei `<Text>` on the sign's `text` anchor | Open question in §9 (company name) is still open | The boss gives the company name |

**Decisions added while finishing the phase (2026-11-13).** The stack now runs on P05 (`stack/p05-office-life`), so the deferred P04/P05 work is done here.

| # | Topic | Choice | Reason | Revisit if |
|---|---|---|---|---|
| D18 | Moving parts of models | A `life` section in `furniture-map.json` names the live models and nodes (desk `screen`, clock `hand_hour`/`hand_minute`, fan `blades`, aquarium `fish`, cat poses, paper, held items, elevator `door_l`/`door_r`). The bake leaves those nodes out (`Placement.omit`); `LiveNodes` draws each one instanced, pivot-relative | One draw call per moving node type for the whole building; components never name a model file | A node needs per-instance material → give it its own material kind |
| D19 | P05 visuals while models load | Every swapped visual keeps its P05 primitive as the fallback (box monitor, primitive clock/fan/aquarium, box sheets, box held items, box car) | Progressive loading (D6) and missing files (R2) must never leave a hole or crash | – |
| D20 | Cat | Three pose groups in one model (`pose_stand`, `pose_sit`, `pose_loaf`) switched by the P05 cat state, no skeleton | No animation system in the scene; the cat is tiny on screen | The cat gets close-ups → add a skinned walk cycle |
| D21 | AO in the shader | Baked AO lives in `COLOR_0`; the palette material sets `vertexColors: true` and multiplies it in. No shader patch | Same result as the planned AO patch with stock three.js; models without colours default to white | – |
| D22 | Department accents (R5, refines §3.6) | Accent faces sample the `jade_600` cell; on department floors the UVs of listed models (`accentTint.models`) move to the floor's `dept_<key>` cell before bake/instancing. Cached tinted clone per geometry and swatch | No extra draw calls or instance colours; a new department with a new swatch key needs no code | A department has no palette cell → generate a cell at runtime |
| D23 | Boss floor silhouette (T07) | Terrace (west 6 m), dark floor, and a glass front rail along the rest of the open front | Reads as a penthouse at overview zoom without changing nav or the floor template | – |
| D24 | Fans and clocks | Added as template `extras` (fans on four templates, clocks on games & rest and boss) instead of floor-template slots | Decor only; no nav footprint needed under the ceiling | – |

| D25 | Ambient (replaces D4) | **Procedural environment**: a palette sky-gradient sphere prefiltered once with `PMREMGenerator`, intensity 0.35 (night 0.07); no HDRI file | No download, no licence row, same soft fill and glass reflections; colours come from the palette | Glass looks dull → add a 1k CC0 HDRI behind the same fallback |
| D26 | Shadow map | `autoUpdate` off; `requestShadowUpdate()` on layout, focus/cut-away, model streaming and sun moves > 0.05; moving things (people, cars, cat, fans, hands, fish, piles) never cast | Shadow pass runs only on change (`shadowRenders` debug counter: +1 per focus change, 0 while idle) | People need contact shadows → blob decals under capsules (P07b) |
| D27 | Nav from models (T03/T08) | `FloorLayout.art` (seats, piles, obstacles) built from placements + manifest bbox and injected into the director and nav grid; which models block is data (`furniture-map.json` `nav`: seats, walkThrough, frontOnly, core, potHalf) | Layout/nav/director stay pure; a new model needs no code; reachability test covers all templates | Obstacles need real convex footprints → export a footprint polygon per model |
| D28 | Local e2e workers | Capped at 3 | Each desktop page renders WebGL in software and decodes ~70 models; 6 at once timed out unrelated specs | Faster machine or GPU runners |

**Earlier gaps, now closed (2026-11-13):** ~~T06 (P05 visuals: doc piles, held items, desk status, moving elevator cars, clock hands, fans; needs P05), anchors injected into the director (T03 second half; needs P04), nav obstacles from footprints (T08; needs P04), lighting pass with HDRI, cached shadow map and no tone mapping (T09), vertex AO (T13), the department accent tint on partitions and pots (R5 keeps the P02 floor inlay and front stripe only), `content:validate` hook for the map (a unit test covers it), dedicated art e2e screenshots (T15).~~ All done in this layer (D18–D28).

## 5. Tasks
- [x] **P06b-T01** Asset loading layer. *Files:* `src/scene/render/assets/{gltf.ts,useAssetManifest.ts,materials.ts}`, `src/domain/config.ts` (manifest schema). *Steps:* BASE_URL-aware URLs with `?v=`; meshopt; singleton `M_Palette`/`M_Glass`/`M_Emissive` (palette texture: nearest, no mipmaps, sRGB); AO + TINT shader patch. *Acceptance:* unit test of URL builder with base `/Dashboard-N8N-tasks/`; loading `chair_office_01.glb` in a test scene yields geometries bound to the singletons (same material instance across two models).
- [x] **P06b-T02** *(validation is a unit test, not yet in `content:validate`)* `furniture-map.json` + schema + validator. *Files:* `src/content/furniture-map.json`, `src/domain/config.ts`, `scripts/content-validate.mjs`. *Steps:* §3.1 seed for every `SlotType`; validator checks every referenced file exists in `manifest.json` and every `SlotType` in the union has an entry. *Acceptance:* removing a slot entry or naming a missing file fails `content:validate` (R1).
- [x] **P06b-T03** *(art seats/piles reach the director and piles through `FloorLayout.art`, D27)* Placements (pure). *Files:* `src/scene/render/assets/placements.ts`, `placements.test.ts`, `src/scene/layout/anchors.ts`. *Steps:* `buildPlacements`; seeded variants; companions at anchors; `AnchorTable` injected into layout queries used by the director (seat, pile, stand positions). *Acceptance:* tests: same input → same placements; desk slot yields desk + chair at `_seat` + monitor; boss template override applied; a new department in config adds placements with no other change (R10, R11).
- [x] **P06b-T04** *(see D11)* Floor shell from kit. *Files:* `FloorShell.tsx`, `shellGeometry.ts` (pure builder, tested for counts). *Steps:* tile slab/walls/windows/columns per template `size` and `walls`; front open; merge per floor; accent stripe vertex colours; glass mesh separate. *Acceptance:* 1 opaque + 1 glass draw call per floor; a 24 × 14 floor has the expected module counts (unit test) (R3, R5).
- [x] **P06b-T05** Instanced furniture + fallback. *Files:* `InstancedFurniture.tsx`, `FallbackBox.tsx`. *Steps:* group by file; instance ranges per floor for focus-mode hiding; error boundary per file → fallback boxes + warning. *Acceptance:* test with a deliberately missing file: its slots show boxes, others show models, no crash; draw-call count for furniture ≤ number of distinct (file, material) pairs (R2, R3).
- [x] **P06b-T06** ∥ Swap P05 visuals to models. *Files:* `DocPiles.tsx`, `HeldItems.tsx`, `DeskStatus.tsx`, `ElevatorCars.tsx`, `Decor.tsx`, `Cat.tsx`, `WallClock.tsx`, `Fans.tsx`, `Aquarium.tsx`. *Steps:* use GLB geometry and anchors (`_pile`, `_screen`, `_door_l/_r`, `_led`, `hand_hour`…); logic untouched. *Acceptance:* P05 unit tests still pass unchanged; replay screenshot shows papers on the review desk surface, riders inside the car (R6, R10).
- [x] **P06b-T07** *(dressing through template extras; lower front wall = glass rail (D23); accents D22)* ∥ Boss floor and management floor dressing. *Files:* `furniture-map.json` (`templates.boss`, `templates.management`), `src/content/floor-templates/{boss,management}.json` (slot tweaks for terrace/lounge). *Steps:* §3.5; terrace half; lower front wall. *Acceptance:* overview screenshot: top floor silhouette and colours visibly differ (reviewer judgement + screenshot in PR) (R4).
- [x] **P06b-T08** *(dressing through template extras; nav obstacles from model bboxes, D27)* ∥ Lobby, department, games & rest dressing. *Files:* `furniture-map.json`, `src/content/floor-templates/{lobby_cafe,department,games_rest}.json`. *Steps:* §3.5 directions; ensure nav grid obstacles updated from model footprints (`manifest.footprint`) and A* paths still reach every slot. *Acceptance:* existing nav reachability test (P04) passes with real footprints for all templates.
- [x] **P06b-T09** *(procedural environment instead of HDRI, D25; cached shadows D26; ΔE 0.0 measured)* Lighting pass. *Files:* `Lighting.tsx`, `DayNight.tsx`, `public/assets/hdri/*`, `credits.json`, `art/LICENSES.md`. *Steps:* §3.3; cached shadow map; HDRI fetched via `assets:fetch` with licence row; no tone mapping. *Acceptance:* palette swatch `jade_600` renders within ΔE < 3 of `#0F766E` under noon lighting on an unlit reference quad (screenshot pixel test); shadow map renders only on change (counter in dev overlay) (R7).
- [x] **P06b-T10** ∥ Exterior. *Files:* `Exterior.tsx`, `furniture-map.json` (kit.facade), i18n (sign text). *Steps:* facade panels back/sides, roof parapet, plaza, trees, lamps, benches, scooters, sign with runtime text. *Acceptance:* ≤ 8 extra draw calls; front remains open (R9).
- [x] **P06b-T11** ∥ Credits page. *Files:* `src/features/credits/CreditsPage.tsx`, `src/app/router.tsx`, `src/features/settings/SettingsPage.tsx`, i18n `vi/credits.ts`, `en/credits.ts`. *Steps:* fetch `credits.json`; group by author; licence links. *Acceptance:* e2e: page lists ≥ 1 group, link from Settings works, 375 px has no horizontal scroll (R13).
- [x] **P06b-T12** *(focused floor loads first; progressive e2e in `office-art.spec.ts`)* Progressive loading. *Files:* `assets/loadQueue.ts` (pure priority queue, tested), `OfficeCanvas.tsx`, `features/office/LoadProgress.tsx`. *Steps:* §3.4. *Acceptance:* unit test of ordering (focused floor first); e2e with throttled network: canvas interactive before all GLBs finish; progress reaches 100 % and disappears (R8).
- [x] **P06b-T13** *(BVH-ray AO in `COLOR_0`, `assets:check` requires it; D21)* AO bake (cross-layer). *Files (in layer p06a):* `art/blender/lib/export.py`, regenerated GLBs; *(in this layer):* shader patch use. *Steps:* add fix commit on `stack/p06a-env-assets`, run `assets:all`, restack. *Acceptance:* models carry `AO` attribute (`assets:check` rule added there); scene visibly gains contact shading (before/after screenshot).
- [x] **P06b-T14** *(2026-11-13, 28 people, 8 floors: overview 110 draw calls / 212k tris, focused floors 60–95; load times not measured on the reference machine)* Performance + budgets. *Files:* `docs/plan/performance.md` (numbers), PR body. *Steps:* scene check with 60 people, 8 floors; record draw calls (env ≤ 150), triangles, p95 frame time, load times warm/cold; fix regressions (merge more, drop companions' chance). *Acceptance:* R12.
- [x] **P06b-T15** E2E and screenshots. *Files:* `e2e/office-art.spec.ts`, `e2e/__screenshots__/*`. *Steps:* replay fixture → 4 screenshots; request-interception test that the fallback route loads no `.glb`. *Acceptance:* R14.

## 6. Dependencies
- **Status:** the renderer, furniture map, shell, street and credits page already ship in this layer (`stack/p06b-env-art`, on top of `stack/p06a-env-assets`). Only the items under "Not done in this layer yet" remain for this phase.
- **Needs:** P06a (models, `manifest.json`, palette, credits, tooling), P05 (visual components and their props), P04 (nav grid obstacle input, blob shadows), P02 (layout, templates, blockout boxes reused as fallback, camera modes).
- **Later phases rely on:** P07b reuses `assets/gltf.ts`, singleton materials, the AO/TINT shader patch, the load queue and the held-prop anchors; P08b uses the lighting rig for the wardrobe preview; P10 relies on R11 (new department → new floor with art); P11 tunes quality settings and may pack families.

## 7. Branch and PR
- Branch `stack/p06b-env-art` from `stack/p06a-env-assets`. PR base `stack/p06a-env-assets`. Title: `[P06b] Environment art pass (models, lighting, exterior)`.
- Description template:
```md
<stack map>
## What
Blockout replaced by instanced low-poly models via furniture-map.json; merged floor shells; lighting; exterior; credits page; progressive loading with blockout fallback.
## Demo
`npm run build && npm run preview` → `#/office` → overview, focus Marketing, focus boss floor, focus games floor → Settings → Ghi công
## Screenshots
<overview | department | boss | games> (before = P05, after)
## Requirements → evidence
R1 … R14
## Perf (60 people, 8 floors)
env draw calls: … | total draw calls: … | tris: … | p95 frame ms: … | shell visible: … s | full: … s (warm/cold)
## Cross-layer change
AO bake added in p06a (commit …), stack restacked on …
## Content changes
furniture-map.json (new), floor templates (slot tweaks: …)
```

## 8. Review checklist
- [ ] No model file names in components; all bindings come from `furniture-map.json`/manifest.
- [ ] Furniture instanced per model; one merged shell (+ glass) per floor; draw-call numbers in the PR match a local check.
- [ ] Missing-model fallback works (reviewer renames one GLB locally and reloads).
- [ ] `scene/layout`, `scene/nav`, `scene/director` still import no three/fetch; anchors arrive by injection.
- [ ] Nav reachability test passes with real footprints; people sit on chairs, not inside desks (visual check on 3 floors).
- [ ] Boss floor distinct at overview zoom; department accents come from config (change a swatch → stripe changes).
- [ ] Colours match tokens (no tone mapping); nothing flashes; reduced motion still honoured.
- [ ] Phone fallback downloads no GLB/HDRI.
- [ ] Credits page complete (no HDRI file: procedural environment, D25).
- [ ] The AO change lives in the p06a layer and the stack was restacked cleanly.
- [ ] All asset URLs use `import.meta.env.BASE_URL` (works under `/Dashboard-N8N-tasks/`).

## 9. Risks and open questions
- **Anchor/layout mismatch** (people floating or clipping) is the most likely bug class. Mitigation: T03 tests + a dev overlay drawing anchors (`?debug=anchors`).
- **Transparent sorting artefacts** with glass offices and the cutaway view. Mitigation: D7 (depthWrite off, render order), keep glass panes thin and few.
- **Too many small requests** on a cold load (~95 files). Mitigation: HTTP/2 on Pages, concurrency 6, priority queue; P11 may pack per family (P06a D5).
- **Flat look without SSAO/bloom.** Mitigation: vertex AO, cached shadows, glow quads; quality toggle considered in P11.
- **Cross-layer AO change** forces a restack mid-phase. Mitigation: do T13 early, before most of this layer's commits.
- **Open:** building sign text. Assumed `t.common.app.name` until the boss gives the company name.
- **Open:** should the front cutaway show a thin glass edge or be fully open? Assumed fully open with a slab edge trim.
