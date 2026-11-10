# P07b: Character system

## 1. Goal and demo
Replace the placeholder capsules with assembled, animated low-poly people driven by `AppearanceV1`, at one draw call per person, without touching the director.
**Demo after merge:** every employee is a distinct person (seeded default looks from the starter catalogue): they walk, sit and type, read papers, carry documents, chat, sleep with closed eyes, play ping-pong. 80 people stay inside the perf budget on the Mac Studio.

## 2. Requirements
- **R1** `assembleCharacter(appearance, catalog)` returns one `SkinnedMesh` (single geometry, shared `M_Palette`-based material, shared skeleton layout) for any valid `AppearanceV1`; renderer info shows **1 draw call per person** (+ ≤ 1 for rigid accessories that cannot be merged, + held prop).
- **R2** Body sliders: each `body` value 0..1 maps to the safe ranges of §3.3, further clamped by worn items' `bodyLimits`; morphs are **baked into the merged geometry** at assembly (no runtime morph targets on office characters).
- **R3** Height changes scale the character 0.92–1.08 and feet stay on the floor; seated characters still align to the seat (offset compensation).
- **R4** Hide masks from `*.meta.json` remove covered body triangles; `hides` in catalogue items is respected (fullbody hides top and bottom).
- **R5** Tints: `colors[itemId][region]` swatches are applied per `TINT` mask at assembly; skin, hair and eye colour likewise. No per-character material instance.
- **R6** Face: eyes/brows/mouth cells from the face atlas; blink every 3–6 s (random per person), closed eyes for `sleep_*` clips, happy eyes for `celebrate`.
- **R7** Animation: clips loaded once from `anim/library.glb`; per-person mixer; crossfade 0.2 s; clip chosen from the director's action via the map in §3.5; walk timeScale matches movement speed (no foot sliding > 10 %).
- **R8** LOD: mixer update rate 30 / 15 / 5 Hz by distance and focus; people on hidden floors are not updated or drawn.
- **R9** `generateAppearance(employeeId)` is deterministic, uses only existing catalogue items, and produces ≥ 20 visually distinct looks across the 28 seed employees (no two with identical hair+top+bottom+colours).
- **R10** `migrateAppearance(unknown)` always returns a valid `AppearanceV1`; unknown item ids fall back to slot defaults with one console warning.
- **R11** If assembly fails for a person (missing GLB, bad doc), that person renders as the P04 capsule and an error is logged once; the scene never crashes.
- **R12** Assemblies are cached by appearance hash; changing one person's appearance re-assembles only that person; old geometry is disposed (no growth in `renderer.info.memory.geometries` after 50 edits).
- **R13** `scene/director`, `scene/nav`, `scene/layout`, `domain` are unchanged by this PR (diff check).

## 3. Specs
### 3.1 Module layout (`src/scene/characters/`)
```
catalog.ts          load + index CatalogItem JSON, resolve defaults per slot (pure)
appearance.ts       zod schema AppearanceV1, migrateAppearance, hashAppearance (pure; schema itself lives in domain/appearance.ts)
generate.ts         generateAppearance(employeeId, catalog) (pure, seeded)
bodyMap.ts          sliders → morph weights/scale, clamp by bodyLimits (pure)
partLoader.ts       GLB loading with cache (useGLTF.preload order), meta.json
assemble.ts         merge pipeline (three, no React)
faceAnim.ts         face cell UV offsets, blink scheduler
animLibrary.ts      clips, clip metadata (library.json)
clipMap.ts          pose key → clip (pure)
material.ts         the one shared character material
assemblyQueue.ts    ≤ 2 assemblies per frame
assemblyCache.ts    cache by appearance hash, ref-counted disposal
CharacterVisual.tsx implements PersonVisual (P04) with the assembled mesh
lod.ts              update-rate decision
props.ts            held props → Attach_HandR
```

### 3.2 Assembly pipeline (`assemble.ts`)
1. Resolve parts: body for `appearance.base` (`body_female.glb` / `body_male.glb`) + outfit (each item's `model[base]`) + skinned hair; rigid accessories listed separately.
2. For each skinned part: clone geometry; compute baked positions/normals = base + Σ(weight × morph delta) on the CPU; drop morph attributes.
3. Remove hidden body triangle ranges (union of worn items' ranges).
4. Colour: write a `color` vertex attribute = tint colour where `TINT` mask > 0.5, else white; remap skin/hair UVs to the chosen swatch cell. Shared material = `MeshStandardMaterial({ map: palette, vertexColors: true })` patched once to add the face-atlas lookup (face triangles flagged by a `faceSlot` attribute: 0 none, 1 eyes, 2 brows, 3 mouth; per-character face cell offsets go in a small per-instance uniform via `onBeforeRender` or, preferred, a 4-float `InstancedBufferAttribute`-free approach: face quads are tiny, so **rewrite their UVs in place** on blink; 12 vertices).
5. Rigid accessories: transform into bone space of their attach bone and merge with skin index = that bone, weight 1 (so they join the single mesh). Only items flagged `merge: false` in meta stay separate.
6. `mergeGeometries` → one `SkinnedMesh`, bound to a per-character `Skeleton` cloned from the shared rest skeleton. Compute bounding sphere once (static, radius 1.2 m) to avoid per-frame skinned bounds.
7. Return `{ mesh, skeleton, dispose(), attach: {handR, handL, head} }`.
Budget: assembly ≤ 25 ms per person on the Mac Studio; run at most 2 assemblies per frame (queue) so loading 80 people never drops a frame badly.

### 3.3 Slider mapping (`bodyMap.ts`)
| doc key (0..1) | effect |
|---|---|
| `height` | uniform scale lerp(0.92, 1.08) on the character root |
| `build` | < 0.5 → `Slim` = (0.5 − v) × 1.2 (max 0.6); > 0.5 → `Heavy` = (v − 0.5) × 1.6 (max 0.8) |
| `muscle` | `Muscle` 0..0.8 |
| `chest` | `Chest` 0..1 |
| `hips` | `Hips` 0..1 |
| `shoulders` | `Shoulders` 0..1 |
Then clamp each to the intersection of worn items' `bodyLimits`. `effectiveLimits(appearance)` is exported for the wardrobe UI (P08b).

### 3.4 `PersonVisual` contract (from P04; must not change)
`CharacterVisual` receives `{ employeeId, transformRef, actionRef, carrying, selected, lodHint }` exactly as the capsule did and exposes the same pick mesh for clicks. A feature flag `VITE_CHARACTERS=capsule|full` (default `full`) keeps the capsule path alive for tests and fallback.

### 3.5 Pose → clip map (`clipMap.ts`)
The director writes a **pose key** (list in `00-overview.md` §7, type in `src/scene/director/poses.ts`) into `actionRef`. The table below shows the intent; the exact pose-key mapping is spelled out in P07b-T08 and wins where names differ.

| Director action | clip | notes |
|---|---|---|
| `walk` | `walk` (or `carry_walk` if carrying) | timeScale = speed / `speedMps` |
| `wait_elevator`, `ride` | `elevator_wait` | |
| `sit_work` | `sit_type` / `sit_read` / `sit_phone` by `carrying` (laptop / document / phone) | |
| `sit_idle`, `wait_seat` | `sit_idle` | |
| `review` | `sit_read` | |
| `talk` | `stand_talk_a` / `_b` alternating by employee hash | |
| `idle_stand` | `idle`, occasional `think` | |
| `coffee`, `tea` | `drink` | |
| `sofa` | `sofa_sit` | |
| `nap_desk` / `sleep_bed` | `sleep_desk` / `sleep_bed` | eyes closed |
| `play_pingpong` / `play_arcade` / `karaoke` | same-named clips | |
| `greet` | `wave` | |
| `done` / `blocked` | `celebrate` / `frustrated` one-shot then previous | |
Unknown action → `idle` + dev warning (forward compatible with P05 additions).

### 3.6 LOD rules (`lod.ts`)
| Condition | mixer rate | draw |
|---|---|---|
| followed / selected / on focused floor within 25 m | 30 Hz | full |
| visible, 25–60 m | 15 Hz | full |
| visible, > 60 m (overview) | 5 Hz | full mesh, frozen between updates |
| floor hidden or outside frustum | 0 | skipped (`visible=false`) |
Staggered update slots so 5 Hz people do not all tick on the same frame. Impostor billboards are **not** built now; listed as fallback F4 in `performance.md` §7.

## 4. Design choices
| Topic | Options | Choice | Reason | Revisit if |
|---|---|---|---|---|
| Draw calls | N meshes per person · merged per person · GPU instanced skinning for all | **Merge per person, shared material** | 80 draw calls for 80 people; simple; works with palette + vertex colours | > 200 people needed → instanced skinning with bone textures |
| Morphs | runtime morph targets · bake on CPU at assembly | **Bake** | Sliders change rarely; runtime morphs cost shader work on every vertex of every person | Wardrobe preview needs live slider feel → preview only uses runtime morphs (P08b) |
| Tint | material per person · vertex colours · UV remap only | **Vertex colours × palette (+ UV remap for skin/hair)** | Keeps one material/program for everyone | Banding or lighting issues → per-person uniform palette row |
| Face animation | uniforms · UV rewrite | **UV rewrite of 12 vertices** | No per-person material; trivial cost | – |
| Accessory attach | separate meshes on bones · merged as single-bone skin | **Merged** (opt-out flag) | Keeps 1 draw call | Item needs its own animation |
| Height | bone scale · root scale | **Root scale + seat offset compensation** | Animation-safe | Hands miss desk noticeably → per-clip IK-less hand offset table |
| Fallback | crash · capsule | **Capsule** | Demo must never break because of one bad asset | – |

## 5. Tasks

Conventions for every task in this phase:
- All code lives in `src/scene/characters/` unless a task says otherwise. Files marked "(pure)" in §3.1 import no three and no React and are unit-tested with Vitest.
- Do not edit `src/scene/director`, `src/scene/nav`, `src/scene/layout` or `src/domain` (except `src/domain/appearance.ts`): R13 is checked in review with `git diff --stat`.
- Asset URLs are built as `import.meta.env.BASE_URL + 'assets/' + path`.
- Bases are `female` / `male` (`AppearanceV1.base`); a part's GLB is `item.model[appearance.base]`.
- One commit per task, subject starts with the task ID.

- [ ] **P07b-T01** Catalogue loader, appearance schema, migrate and hash
  - *Files:* `src/domain/appearance.ts` (replace the P01 placeholder), `src/scene/characters/catalog.ts`, `src/scene/characters/appearance.ts`, `src/scene/characters/__tests__/{catalog,appearance}.test.ts`.
  - *Depends on:* –
  - *Steps:*
    1. In `src/domain/appearance.ts` write the zod schema `AppearanceV1Schema` exactly as data-model.md §2.11 (including `base: 'female' | 'male'`) and export the type.
    2. `catalog.ts`: `loadCatalog(): Catalog` imports every `src/content/catalog/*.json`, validates rows against the `CatalogItem` schema (data-model.md §2.10) and builds `{ byId: Map, bySlot: Map<slot, CatalogItem[]>, defaultFor(slot, base): CatalogItem | null, supports(item, base): boolean }`.
    3. `appearance.ts`: `migrateAppearance(doc: unknown, catalog): AppearanceV1`: parse leniently; missing/invalid fields get defaults; an item id that is unknown, retired, or does not support the doc's `base` is replaced by `defaultFor(slot, base)` and one `console.warn` is emitted per call (not per item).
    4. `hashAppearance(doc): string`: stable hash (e.g. FNV-1a over JSON with sorted keys), ignoring `updatedAt` / `updatedBy`.
    5. Tests: unknown item → default; item not supporting the base → default; a hand-written "v0" fixture (no `v`, no `base`) → valid v1; hash is independent of key order and of `updatedAt`.
  - *Acceptance:* R10. `npx vitest run src/scene/characters/__tests__/appearance.test.ts` passes with the four cases above.
  - *Out of scope:* loading GLBs (T04); storing appearances (P08b).

- [ ] **P07b-T02** ∥ Slider mapping (`bodyMap.ts`)
  - *Files:* `src/scene/characters/bodyMap.ts`, `__tests__/bodyMap.test.ts`.
  - *Depends on:* T01.
  - *Steps:*
    1. `effectiveLimits(appearance, catalog): Record<BodyKey, [min, max]>`: start at `[0, 1]` per key, intersect with `bodyLimits` (for the appearance's base) of every worn item.
    2. `mapBody(appearance, catalog): { scale: number, morphs: {Heavy, Slim, Muscle, Chest, Hips, Shoulders} }`: clamp each doc value to its effective limits, then apply the table in §3.3.
    3. Table-driven tests: one row per §3.3 line at 0, 0.5 and 1; a case with two worn items whose limits intersect; a case where limits make min = max.
  - *Acceptance:* `bodyMap.test.ts` passes; `build: 0.5` yields `Heavy = 0` and `Slim = 0`; `height: 0/1` yields scale 0.92 / 1.08.
  - *Out of scope:* applying morphs to geometry (T05).

- [ ] **P07b-T03** ∥ Seeded default looks (`generate.ts`)
  - *Files:* `src/scene/characters/generate.ts`, `src/content/catalog/generator-weights.json`, `__tests__/generate.test.ts`.
  - *Depends on:* T01.
  - *Steps:*
    1. `generateAppearance(employeeId: string, catalog): AppearanceV1`: seed a mulberry32 RNG from a hash of `employeeId`; pick `base`, then one item per required slot among items that support that base, colours from `colors.json`, body sliders in the middle 60 % of their range, `updatedBy: 'generator'`.
    2. `generator-weights.json`: optional `{ slot: { itemId: weight } }` and `{ base: {female: 0.5, male: 0.5} }` so looks stay office-plausible (no code change to tune).
    3. Never set both `fullbody` and `top`/`bottom`; respect `hides` and `requires`.
    4. Tests: same id → deep-equal doc; every id used exists in the catalogue and supports the chosen base; across the 28 seed employees of `org.seed.json` at least 20 distinct (hair, top, bottom, colours) combinations.
  - *Acceptance:* R9 via `generate.test.ts`.
  - *Out of scope:* the "randomise" button (P08b reuses this function).

- [ ] **P07b-T04** Part loader with cache (`partLoader.ts`)
  - *Files:* `src/scene/characters/partLoader.ts`, `__tests__/partLoader.test.ts`.
  - *Depends on:* T01.
  - *Steps:*
    1. `loadPart(item: CatalogItem, base): Promise<Part>` where `Part = { geometry, skinned: boolean, morphNames, meta }`: loads `item.model[base]` with `GLTFLoader` + meshopt decoder and the sibling `<item>.meta.json`; takes the per-base block of the meta (`hideRanges`, `bodyLimits`, attach offsets).
    2. `loadBody(base)` loads `models/characters/body_<base>.glb` and `body.meta.json`.
    3. Cache promises in a `Map` keyed by URL so concurrent requests share one fetch; `preloadFor(appearances[])` warms the cache in the order body → outfit → hair → accessories.
    4. The loader function is injectable (`createPartLoader({ loadGLB, fetchJSON })`) so tests can mock it.
    5. Test: requesting the same part twice calls the mocked `loadGLB` once; a rejected load is removed from the cache so a retry is possible.
  - *Acceptance:* `partLoader.test.ts` passes (single network hit; retry after failure).
  - *Out of scope:* merging (T05).

- [ ] **P07b-T05** Assembly core: bake morphs, hide masks, merge, skeleton
  - *Files:* `src/scene/characters/assemble.ts`, `__tests__/assemble.test.ts` (uses `__fixtures__/*.glb` from P07a-T14).
  - *Depends on:* T02, T04.
  - *Steps:*
    1. `assembleCharacter(appearance, catalog, loader): Promise<Assembled>` with `Assembled = { mesh: SkinnedMesh, skeleton, attach: {handR, handL, head}, dispose(): void }` (§3.2 step 7).
    2. Step 1 of §3.2: resolve body for `appearance.base`, outfit parts, skinned hair; collect rigid accessories separately (handled in T07).
    3. Step 2: for each skinned part clone the geometry and compute `position`/`normal` = base + Σ(weight × morph delta) using `mapBody().morphs`; delete morph attributes.
    4. Step 3: remove body triangles in the union of worn items' `hideRanges` (index buffer filtering).
    5. Step 6: `mergeGeometries` into one geometry; create one `SkinnedMesh` bound to a `Skeleton` cloned from the shared rest skeleton; set a static bounding sphere (radius 1.2 m) and `frustumCulled` handled by T12.
    6. Tests on fixtures: merged triangle count = sum of parts − hidden; exactly one geometry; every `skinIndex` < bone count; no `morphAttributes` remain.
  - *Acceptance:* R1 (geometry part), R2, R4 via `assemble.test.ts`. If meshopt quantisation distorts morph deltas (risk §9), record the measured error in the PR and switch that asset class to unquantised morphs.
  - *Out of scope:* colours (T06), accessories (T07), React (T09).

- [ ] **P07b-T06** Tints, swatch remap and the shared material
  - *Files:* `src/scene/characters/assemble.ts` (colour step), `src/scene/characters/material.ts`, `__tests__/tint.test.ts`.
  - *Depends on:* T05.
  - *Steps:*
    1. Step 4 of §3.2: read each part's `TINT` attribute; write a `color` attribute = primary/secondary/accent swatch colour where the matching channel > 0.5, else white. Swatch colours come from `appearance.colors[itemId]`, falling back to the item's `tint.defaults`, resolved through `src/content/palette.json`.
    2. Remap skin faces to `appearance.skin` and hair faces to `appearance.hair.color` by moving their UVs to that swatch cell; eye colour likewise for the eye island.
    3. `material.ts`: `getCharacterMaterial(): MeshStandardMaterial` returns **one module-level instance** (`map: palette`, `vertexColors: true`) patched once for the face-atlas lookup described in §3.2 step 4 (`faceSlot` attribute).
    4. Tests: a tinted fixture's vertex colours equal the chosen swatch RGB; assembling 10 characters yields `new Set(meshes.map(m => m.material)).size === 1`.
  - *Acceptance:* R5 via `tint.test.ts`.
  - *Out of scope:* blinking (T10).

- [ ] **P07b-T07** Rigid accessories and attach points
  - *Files:* `src/scene/characters/assemble.ts` (accessory step), `__tests__/accessory.test.ts`.
  - *Depends on:* T05.
  - *Steps:*
    1. Step 5 of §3.2: for each rigid item apply the per-base offset from its meta, transform vertices into the bind space of its attach bone, and set `skinIndex` = that bone, `skinWeight` = 1, then include it in the merge.
    2. Items with `merge: false` in the meta stay separate meshes parented to the attach bone (allowed: ≤ 1 extra draw call, R1).
    3. Expose `attach.handR/handL/head` as the `Attach_HandR/HandL/Head` bones of the character's skeleton.
    4. Test: rotate the Head bone 90°, update the skeleton, compute the skinned position of a glasses vertex on the CPU and assert it moved with the head.
  - *Acceptance:* `accessory.test.ts` passes; renderer shows 1 draw call for a person wearing glasses + necklace.
  - *Out of scope:* held work props (T11).

- [ ] **P07b-T08** Animation library and pose → clip map
  - *Files:* `src/scene/characters/animLibrary.ts`, `src/scene/characters/clipMap.ts`, `__tests__/clipMap.test.ts`.
  - *Depends on:* –
  - *Steps:*
    1. `animLibrary.ts`: `loadAnimLibrary(): Promise<{ clips: Map<string, AnimationClip>, meta: Map<string, {loop, duration, speedMps?}> }>` from `anim/library.glb` + `library.json`, loaded once (module cache).
    2. `clipMap.ts`: `clipFor(pose: PoseKey, ctx: { carrying, employeeId }): { clip: string, loop: boolean, oneShot?: boolean }`. `PoseKey` is imported from `src/scene/director/poses.ts` (the list in `00-overview.md` §7). Use §3.5 as the mapping, translated to pose keys: `stand`→`idle`, `walk`→`walk`, `carry_walk`→`carry_walk`, `wait_stand`/`wait_elevator`/`ride`→`elevator_wait`, `sit`/`wait_seat`→`sit_idle`, `sit_work`→`sit_type`|`sit_read`|`sit_phone` by `carrying`, `sit_read`→`sit_read`, `sit_phone`→`sit_phone`, `talk`→`stand_talk_a|b` by employee hash, `listen`→`stand_listen`, `stuck`→`frustrated`, `done`→`celebrate` (one-shot), `greet`→`wave` (one-shot), `coffee`/`tea`→`drink`, `sofa`→`sofa_sit`, `nap_desk`→`sleep_desk`, `sleep_bed`→`sleep_bed`, `play_pingpong`→`pingpong`, `play_arcade`→`arcade`, `play_boardgame`→`boardgame`, `karaoke`→`karaoke`.
    3. Unknown pose → `idle` plus one dev warning per pose key.
    4. `walkTimeScale(speedMps, meta) = speedMps / meta.speedMps`.
    5. Test: every `PoseKey` returns a clip name that exists in `library.json`; unknown → `idle`.
  - *Acceptance:* R7 (mapping part) via `clipMap.test.ts`.
  - *Out of scope:* mixers and crossfades (T09).

- [ ] **P07b-T09** `CharacterVisual` (implements `PersonVisual`)
  - *Files:* `src/scene/characters/CharacterVisual.tsx`, `src/scene/characters/assemblyQueue.ts`, `src/scene/render/People.tsx` (switch on the flag only), `.env.example` (`VITE_CHARACTERS=`), `e2e/characters.spec.ts`.
  - *Depends on:* T05–T08.
  - *Steps:*
    1. Props exactly `{ employeeId, transformRef, actionRef, carrying, selected, lodHint }` (§3.4); keep the P04 pick proxy capsule for clicks.
    2. Get the appearance for the employee (until P08b: `generateAppearance`), enqueue assembly in `assemblyQueue` (max 2 assemblies per frame, FIFO, nearest-to-camera first); render the P04 capsule until ready.
    3. Create one `AnimationMixer` per character; in `useFrame` read `actionRef.current`, call `clipFor`, crossfade 0.2 s on change, set walk timeScale from the transform's speed. No React state in `useFrame`.
    4. Height: apply `mapBody().scale` on the character root; for seated/lying poses add a Y offset so hips stay on the seat (0.45 m) or bed (0.40 m): `offsetY = seatHeight × (1 − scale)`; keep a per-clip offset table in `animLibrary.ts` for exceptions.
    5. On assembly error: log once, keep the capsule (R11). `VITE_CHARACTERS=capsule` forces the capsule path.
    6. Publish `window.__office_debug.characters = { assembled, failed, queued }`.
    7. E2E: load `#/`, wait for `[data-office-canvas][data-ready="true"]`, poll until `__office_debug.characters.assembled` equals the people count.
  - *Acceptance:* R3, R11, R13; `e2e/characters.spec.ts` passes; breaking one GLB URL locally leaves that person as a capsule and the scene running.
  - *Out of scope:* face animation (T10), props (T11), LOD (T12).

- [ ] **P07b-T10** Face animation (`faceAnim.ts`)
  - *Files:* `src/scene/characters/faceAnim.ts`, `__tests__/faceAnim.test.ts`, hook-up in `CharacterVisual.tsx`.
  - *Depends on:* T06, T09.
  - *Steps:*
    1. `setFaceCell(mesh, slot: 'eyes'|'brows'|'mouth', cell: [c, r])` rewrites the UVs of that slot's 4 vertices in place (§3.2 step 4) using `face-atlas.json`.
    2. `createBlinker(seed, now)`: schedules blinks every 3–6 s (seeded per employee): open → half → closed → half → open over ~150 ms; takes time as an argument (no `Date.now`).
    3. Expression rules: clips `sleep_desk`/`sleep_bed` → closed eyes, no blinking; `celebrate` → happy eyes; otherwise the appearance's eye style, open.
    4. Skip face updates entirely at the 5 Hz LOD tier.
  - *Acceptance:* R6; `faceAnim.test.ts` drives the blinker with a fake clock and asserts blink intervals within 3–6 s and the closed cell while a sleep clip is active.
  - *Out of scope:* new face art (P08a).

- [ ] **P07b-T11** Held props (`props.ts`)
  - *Files:* `src/scene/characters/props.ts`, hook-up in `CharacterVisual.tsx`, `__tests__/props.test.ts`.
  - *Depends on:* T07, T09.
  - *Steps:*
    1. `propFor(carrying): { model: string, anchor: '_hand_r' } | null` for `document, laptop, phone, tablet, box, camera` using the P06a prop GLBs and their `_hand_r` anchors from `public/assets/manifest.json`.
    2. Attach the prop (shared geometry/material, one small mesh) under `attach.handR` so that the prop's `_hand_r` anchor coincides with the bone.
    3. Hide the hand prop while the pose is `sit_work` with `carrying: 'laptop'` (the laptop is shown on the desk by P05/P06b instead).
    4. Test: after posing the arm, the prop's world position equals the `Attach_HandR` world position (± 1 mm).
  - *Acceptance:* `props.test.ts` passes; a carrying courier visibly holds a document in the walk clip (screenshot in PR).
  - *Out of scope:* modelling props (P06a).

- [ ] **P07b-T12** LOD, culling and staggered updates (`lod.ts`)
  - *Files:* `src/scene/characters/lod.ts`, `__tests__/lod.test.ts`, hook-up in `CharacterVisual.tsx`.
  - *Depends on:* T09.
  - *Steps:*
    1. `mixerRate(ctx: { distance, onFocusedFloor, followed, selected, floorVisible, inFrustum }): 30 | 15 | 5 | 0` implementing the table in §3.6.
    2. Each character gets a stagger slot (`hash(employeeId) % 6`); a character at rate R updates its mixer only on frames where `(frame + slot) % (60 / R) === 0`, passing the accumulated delta.
    3. Rate 0 → `mesh.visible = false` and no mixer update.
    4. Count mixer updates per second into `__office_debug.characters.mixerUpdatesPerSec`.
  - *Acceptance:* R8; `lod.test.ts` covers each row of §3.6; in overview with 80 people the debug counter reads ≈ 80 × 5 (± 20 %).
  - *Out of scope:* impostor billboards (fallback F4 in `performance.md` §7, not built).

- [ ] **P07b-T13** Re-assembly on appearance change, cache and disposal
  - *Files:* `src/scene/characters/assemblyCache.ts`, `CharacterVisual.tsx`, `e2e/characters-dispose.spec.ts`.
  - *Depends on:* T09.
  - *Steps:*
    1. Cache `Assembled` results by `hashAppearance(doc)` with reference counting; identical looks share geometry.
    2. When an employee's appearance changes (prop/store update), assemble the new one, swap meshes when ready, keep the mixer time so the pose does not jump, then release the old entry; at refcount 0 call `dispose()` (geometry only; the shared material and palette texture are never disposed).
    3. Expose `__office_debug.characters.setAppearance(employeeId, doc)` for tests.
    4. E2E: apply 50 random generated appearances to one employee and assert `renderer.info.memory.geometries` returns to its starting value (± 2).
  - *Acceptance:* R12 via `characters-dispose.spec.ts`.
  - *Out of scope:* persistence and the editor UI (P08b).

- [ ] **P07b-T14** Performance pass
  - *Files:* `docs/plan/performance.md` (§5 table row for P07b), tuning constants in `lod.ts` / `assemblyQueue.ts` if needed.
  - *Depends on:* T09–T13.
  - *Steps:*
    1. Run `npm run perf:check` against the reference scene: simulator scenario "Đông người", seed `perf-1`, 80 people (`performance.md` §1).
    2. Record draw calls, triangles, fps (overview and floor focus), JS ms per frame and average assembly ms in the PR body table (§7).
    3. If a budget fails, apply the ordered fallbacks of `performance.md` §7 one at a time, re-measure, and record which were applied.
  - *Acceptance:* budgets of `performance.md` §2 met on the stated machine, or the applied fallbacks and remaining gap are written in the PR body and in §9 of this file.
  - *Out of scope:* new optimisation techniques not listed in `performance.md`.

- [ ] **P07b-T15** Strings and docs
  - *Files:* `src/i18n/vi/office.ts`, `src/i18n/en/office.ts` (only if a user-visible string was added, e.g. a loading note), `docs/plan/performance.md`, `docs/plan/contracts.md` (only if `AppearanceV1` changed, which it should not).
  - *Depends on:* T14.
  - *Steps:*
    1. Search the diff for user-visible literals in TSX and move them to i18n (`vi` first, same key in `en`).
    2. Confirm `data-model.md` §2.11 still matches `src/domain/appearance.ts`; if not, fix the doc and bump the contract version with a changelog line.
    3. Run the full DoD command set (`00-overview.md` §6).
  - *Acceptance:* `npm run typecheck && npm run lint && npm run test && npm run build && npm run test:e2e` pass; `git diff --stat` against the base branch shows no changes under `src/scene/director`, `src/scene/nav`, `src/scene/layout`, and only `appearance.ts` under `src/domain`.
  - *Out of scope:* wardrobe UI strings (P08b).

## 6. Dependencies
- **Needs:** P07a assets and meta files; P04 `PersonVisual`, pick handling, director actions; P05 action list, props; P06b furniture dimensions (seat/desk heights).
- **Later phases rely on:** P08a (items only need JSON + GLB), P08b (`effectiveLimits`, `assembleCharacter` for the preview, appearance schema, `generateAppearance`), P09 (appearance docs stored as-is). **Expensive to change later:** `AppearanceV1` shape, slider mapping (stored docs would look different), `TINT`/meta conventions.

## 7. Branch and PR
- Branch `stack/p07b-characters` from `stack/p07a-char-assets`. Base `stack/p07a-char-assets`. Title: `[P07b] Character system: assembled, animated people`.
```md
<stack map>
## What
Capsules → real characters (1 draw call each). Director untouched.
## Demo
npm run build && npm run preview → #/office (screenshots / 20 s clip attached)
## Perf (performance.md §5 row)
| people | draw calls | tris | fps overview | fps floor | JS ms | assembly ms avg |
## Tests
unit: … · e2e: …
## Contract changes
none (or: …)
```

## 8. Review checklist
- [ ] `git diff --stat` shows no changes under `scene/director`, `scene/nav`, `scene/layout`, `domain` except `domain/appearance.ts`.
- [ ] One material instance for all characters; no runtime morph targets in the office scene.
- [ ] No React state set inside `useFrame`; mixers updated through refs.
- [ ] Disposal verified (R12); capsule fallback works when a GLB URL is broken (try it).
- [ ] Walk has no obvious foot sliding; seated people sit on chairs, not in them, at min and max height.
- [ ] Perf numbers in the PR body meet `performance.md`; numbers were measured on the stated machine.
- [ ] Asset URLs use `import.meta.env.BASE_URL`.

## 9. Risks and open questions
- **CPU morph baking** needs morph deltas in the GLB; meshopt quantisation must keep them accurate (verify in T05; else export deltas in a side buffer).
- **Vertex colour × palette** can darken colours; use white base swatches under tint regions (asset rule from P07a).
- **Seat alignment for tall/short people** may need per-clip offsets; table lives in `animLibrary.ts`.
- Merged rigid accessories cannot be toggled without re-assembly; fine because edits are rare.
- If 80 people miss budget: apply `performance.md` §7 fallbacks in order.
