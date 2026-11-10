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
animLibrary.ts      clips, clip metadata (library.json), action → clip map
CharacterVisual.tsx implements PersonVisual (P04) with the assembled mesh
lod.ts              update-rate decision
props.ts            held props → Attach_HandR
```

### 3.2 Assembly pipeline (`assemble.ts`)
1. Resolve parts: body (a/b) + outfit + skinned hair; rigid accessories listed separately.
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

### 3.5 Action → clip map (`animLibrary.ts`)
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
- [ ] **P07b-T01** Catalogue loader + appearance schema/migrate/hash. *Files:* `src/domain/appearance.ts`, `src/scene/characters/{catalog,appearance}.ts`, tests. *Acceptance:* R10; unit tests: unknown item → default, v0 fixture → v1, stable hash independent of key order.
- [ ] **P07b-T02** ∥ `bodyMap.ts` + `effectiveLimits`. *Acceptance:* table-driven tests for §3.3 incl. clamping by two items' limits.
- [ ] **P07b-T03** ∥ `generate.ts`. *Acceptance:* R9 test over the seed org; same id → same doc; only catalogue ids used.
- [ ] **P07b-T04** `partLoader.ts` (GLB + meta cache, `BASE_URL` paths, preload list from catalogue). *Acceptance:* loading the same part twice hits the network once (mocked loader test).
- [ ] **P07b-T05** `assemble.ts` steps 1–3, 6 (bake morphs, hide masks, merge, skeleton). *Files:* + `src/scene/characters/__fixtures__/*.glb` (tiny fixture parts made by a P07a script, < 20 KB each). *Acceptance:* R1, R2, R4 unit tests on fixtures: triangle count = sum − hidden; one geometry; skin indices valid.
- [ ] **P07b-T06** Tint + swatch remap + shared material patch. *Acceptance:* R5 test: vertex colours of a tinted fixture equal the swatch; only one material instance exists for 10 assembled characters.
- [ ] **P07b-T07** Rigid accessory merge + attach points. *Acceptance:* glasses fixture follows head rotation in a pose test (vertex position check after skeleton update).
- [ ] **P07b-T08** `animLibrary.ts`: load clips, metadata, action map, walk timeScale. *Acceptance:* R7 unit test of the map (every director action from P04/P05 has a clip; unknown → idle).
- [ ] **P07b-T09** `CharacterVisual.tsx` implementing `PersonVisual`; mixer with crossfade; height scale + seat offsets; assembly queue (≤ 2 per frame); capsule fallback + feature flag. *Acceptance:* R3, R11, R13; e2e: `#/office` shows people, `window.__office_debug.characters.assembled === people count`.
- [ ] **P07b-T10** `faceAnim.ts` blink, sleep and expression cells. *Acceptance:* R6; unit test of the blink scheduler with a fake clock; sleeping person uses the closed cell.
- [ ] **P07b-T11** `props.ts`: held items (document, laptop, phone, tablet, box, camera from P05/P06) on `Attach_HandR`, hidden when seated variants need the desk version. *Acceptance:* prop world position tracks the hand in a pose test.
- [ ] **P07b-T12** `lod.ts` + culling + staggered updates. *Acceptance:* R8; unit test of rate selection; debug counter shows ≈ expected mixer updates per second in overview.
- [ ] **P07b-T13** Re-assembly on appearance change, cache by hash, disposal. *Acceptance:* R12 automated: 50 random appearance swaps → geometry count stable.
- [ ] **P07b-T14** Perf pass against `performance.md`: run `npm run perf:check` with 80 people (sim scenario "đông người"), record numbers in PR. *Acceptance:* budgets met or fallbacks applied and recorded.
- [ ] **P07b-T15** i18n for any new debug/UI strings; docs: update `performance.md` table row and `contracts.md` only if `AppearanceV1` changed (it should not).

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
