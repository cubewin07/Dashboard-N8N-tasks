# P08a: Wardrobe catalogue assets

Asset PR: binaries + generator scripts + JSON content rows. No runtime code.

## 1. Goal and demo
Grow the starter set into a real fashion catalogue (≥ 80 items) using the P07a pipeline, and leave behind a recipe that lets any agent add one more item in a few minutes without touching code.
**Demo after merge:** seeded default looks in the office become much more varied (the generator picks from the bigger catalogue). The PR shows a thumbnail wall of every item and contact sheets per slot.

## 2. Requirements
- **R1** Catalogue minimums (totals include P07a starters): hair ≥ 14, eyes ≥ 8, brows ≥ 5, mouth ≥ 6, facial_hair ≥ 3, top ≥ 12, bottom ≥ 8, fullbody ≥ 5, outer ≥ 4, shoes ≥ 6, head ≥ 4, glasses ≥ 4, ears ≥ 3, neck ≥ 6, wrist ≥ 3, bag ≥ 3. Mesh/atlas items total ≥ 80.
- **R2** Required specific items: hair (bob, long, ponytail, bun, curly, short, undercut); tops (crew t-shirt, V t-shirt, polo, shirt, blouse, hoodie, sweater, vest); bottoms (jeans, trousers, shorts, mini skirt, midi skirt, pleated skirt); fullbody (dress, **áo dài**, jumpsuit, suit set); head (cap, beret, **nón lá**); neck (necklace, chain, scarf, tie, **thẻ nhân viên** lanyard).
- **R3** Every skinned item passes the fitting pipeline on each base it lists in `bases` (female and male by default; exported as `<id>_f.glb` and `<id>_m.glb`): max penetration ≤ 5 mm inside its `bodyLimits`; budgets garment/hair ≤ 1 500 tris; assembled worst-case outfit ≤ 8 000 tris (checked by script over the 20 heaviest combinations).
- **R4** Every item has: per-base GLBs (or a face-atlas cell), `*.meta.json`, 256×256 WebP thumbnail ≤ 15 KB, a `CatalogItem` JSON row with `bases`, per-base `model`, `label.vi` + `label.en`, `tags`, `tint`, `hides`, `credit`.
- **R5** `colors.json` offers ≥ 10 skin, ≥ 12 hair, ≥ 24 fabric, ≥ 6 metal/accent swatches, all cells of `palette.png`.
- **R6** `art/RECIPE-add-item.md` exists and a dry run by a fresh agent (T14) adds one item following only the recipe.
- **R7** `npm run content:validate`, `npm run catalog:validate` and `npm run assets:check` pass; this phase adds ≤ 13 MB; `public/assets` total stays ≤ 30 MB.
- **R8** Each item's `bodyLimits` narrows no slider below 60 % of its full range, except items tagged `fitted` (documented exceptions, max 5 items).
- **R9** No brand logos, no copied designs from games or brands; third-party meshes only CC0/CC-BY with ledger rows.

## 3. Specs
### 3.1 Item list (target; agents may swap equivalents but must keep R1/R2)
| Slot | Items (id suffixes) |
|---|---|
| hair (14) | short_01, short_02, undercut, bob, bob_bangs, long_straight, long_wavy, ponytail, ponytail_high, bun, twin_buns, curly, side_part, buzz |
| eyes (8) / brows (5) / mouth (6) | round, almond, sleepy, wide, narrow, lash, glassy, dot / straight, arched, thick, thin, angled / smile, neutral, grin, small, open, cat |
| facial_hair (3) | moustache, goatee, stubble (atlas cell + thin mesh) |
| top (12) | tshirt_crew, tshirt_v, tshirt_graphic (palette blocks only), polo, shirt, shirt_short, blouse, hoodie, sweater, vest_knit, tank, turtleneck |
| bottom (8) | jeans, trousers, chinos, shorts, skirt_mini, skirt_midi, skirt_pleated, joggers |
| fullbody (5) | dress_aline, dress_office, ao_dai, jumpsuit, suit_set |
| outer (4) | blazer, cardigan, bomber, raincoat |
| shoes (6) | sneaker, loafer, heel_low, boot, sandal, slipper |
| head (4) | cap, beret, non_la, headband |
| glasses (4) | round, square, cat_eye, sunglasses |
| ears (3) | stud, hoop, drop |
| neck (6) | necklace_pearl, chain_gold, scarf, tie, bow_tie, lanyard_badge |
| wrist (3) | watch, bracelet, beads |
| bag (3) | tote, backpack, crossbody |

### 3.2 Layering and conflicts (data in each row)
- Order inside-out: body → bottom → top → fullbody → outer → accessories. Garment shrinkwrap offsets: bottom 8 mm, top 10 mm, fullbody 10 mm, outer 16 mm.
- `fullbody.hides = ['top','bottom']`; `non_la` and `cap` use hair variant rule: meta `hairClip: 'crown'` → assembly swaps hair to its `*_hatcut` geometry range (hair GLBs carry a "crown" vertex group that is removed under hats).
- `outer` requires `top` or `fullbody` (`requires`), and narrows `Heavy` range more than tops do.
- Tucked/untucked is not modelled; tops end at hip line over bottoms.

### 3.3 Skirt and áo dài strategy
- Skirts/dress hems are skinned with a **leg blend**: each hem vertex gets 50 % `Hips`, 25 % `UpLeg.L`, 25 % `UpLeg.R` at the centre, shifting to 60 % of the nearer leg at the sides (`lib/fit.py: skirt_weights(length)`), so walking opens the skirt without tearing.
- Limits documented in meta: `maxStride` hint (mini 1.0, midi 0.85, áo dài 0.8) → P07b walk timeScale unaffected; instead seated clips are checked in contact sheets; if a seated pose clips > 15 mm the item gets `seatedVariant: 'spread'` (shape key `Seated` baked into the garment and blended by the clip map; optional, only for midi/áo dài).
- Áo dài = tunic (fullbody, two long panels front/back skinned with the leg blend) + integrated trousers in the same GLB.

### 3.4 Thumbnails (`art/blender/render_thumb.py`, `npm run thumbs:render`)
Headless Blender (EEVEE), fixed 3/4 camera per slot, neutral grey mannequin for worn items, transparent background, 512 render → 256 WebP (quality 80). Face parts: crop of the atlas cell scaled ×4 on a skin-tone disc. Deterministic lighting rig shared with contact sheets.

### 3.5 Recipe (`art/RECIPE-add-item.md` outline)
1. Pick slot and id (`<slot>_<name>_<nn>`). 2. Author: copy the nearest `gen_wardrobe_*.py` function, change profile parameters (or import a CC0 mesh into `art/.cache`, record in `art/sources/`). 3. `npm run art:build -- wardrobe --only <id>` (generates, fits, tests clipping, exports, writes report + meta). 4. `npm run thumbs:render -- --only <id>`. 5. Add JSON row (template in the recipe; labels vi/en, tags, tint defaults). 6. Ledger row. 7. `npm run catalog:validate && npm run assets:check`. 8. Look at `art/out/contact/<id>.png`. Troubleshooting table: penetration fail, weights tearing, thumbnail empty, over budget.

### 3.6 Parallel batches
One agent per batch; batches touch disjoint files (one JSON file per slot, one generator file per batch): **B1** hair · **B2** face parts · **B3** tops · **B4** bottoms + skirts · **B5** fullbody + outer · **B6** shoes + bags · **B7** head, glasses, ears, neck, wrist. Shared files (`colors.json`, `palette.json`, ledger) are edited only in T02 and T13.

## 4. Design choices
| Topic | Options | Choice | Reason | Revisit if |
|---|---|---|---|---|
| Item authoring | hand modelling · parametric Blender Python generators · imported CC0 meshes · AI mesh generation | **Parametric generators first; CC0 imports where they fit the style; no AI generation** | Reproducible, consistent, zero manual downloads; AI meshes have unclear licences/costs and messy topology | Boss approves a paid generator and its licence |
| Skirts | cloth sim · extra skirt bones · leg-blend weights | **Leg-blend weights** | No rig change (rig is frozen after P07a), no runtime cost | Looks bad in walk → add 4 skirt bones in a contract-bumping asset revision |
| Patterns/prints | textures per item · palette colour blocks | **Palette colour blocks via `TINT` regions** | One texture for the whole game | Boss wants prints → small shared pattern atlas (new tint mode) |
| Catalogue files | one big JSON · per slot | **Per slot** | Parallel batches without merge conflicts | – |
| Hat + hair | hide hair · hat-cut variant | **Crown vertex group removal** | Keeps hair visible under hats cheaply | – |

## 5. Tasks

Conventions for every task in this phase:
- Blender runs headless: `/Applications/Blender.app/Contents/MacOS/Blender -b -P <script> -- <args>`; `npm run art:build -- wardrobe [--only <id>]` wraps it (P07a).
- **Per-base output (decided):** every skinned item is fitted to both base bodies and exported as `public/assets/models/wardrobe/<id>_f.glb` and `<id>_m.glb`, with one `public/assets/models/wardrobe/<id>.meta.json` holding `{ bases: { female: {hideRanges, bodyLimits, maxPenetrationMm}, male: {…} }, attach, heelLift? }`. An item that fails fitting on one base ships single-base (`bases: ['female']`), and that is noted in the PR. Rigid accessories use one file `<id>.glb`, with a per-base offset in the meta.
- Catalogue row shape: `data-model.md` §2.10 (`bases`, per-base `model`, `label.vi/en`, `tint`, `hides`, `tags`, `credit`). One JSON file per slot in `src/content/catalog/<slot>.json`.
- Tint mask attribute is `TINT` (R/G/B = primary/secondary/accent). Face parts are cells of `public/assets/textures/face_atlas.png`.
- No AI-generated meshes. Third-party meshes only CC0/CC-BY, with a ledger row.
- Batch tasks T03–T09 (marked ∥) touch disjoint files and can run at the same time after T01 and T02.

- [ ] **P08a-T01** Generalise the wardrobe generators
  - *Files:* `art/blender/gen_wardrobe.py` (new dispatcher), `art/blender/lib/garment_profiles.py` (new), `art/blender/lib/fit.py` (extend), `art/targets.json`, `package.json` (script args only).
  - *Depends on:* – (P07a pipeline merged below this branch).
  - *Steps:*
    1. Read the P07a starter generators and `lib/fit.py` to learn the existing export, fitting and report functions; do not change their output format.
    2. Create `gen_wardrobe.py` with a registry `ITEMS: dict[str, Callable[[], bpy.types.Object]]` and CLI args `--only <id>[,<id>]`, `--slot <slot>`, `--bases female,male` (default both), `--out public/assets/models/wardrobe`.
    3. In `lib/garment_profiles.py` add parametric builders: `torso_tube(profile, length, collar)`, `sleeve(length, cuff, flare)`, `leg_tube(length, taper)`, `skirt(length, flare, pleats)`, `collar(kind)`. Each returns a mesh UV-mapped to a white palette cell with the `TINT` attribute painted per region.
    4. In `lib/fit.py` add `skirt_weights(obj, length)` implementing the leg blend of §3.3, and `mark_crown_group(hair_obj)` creating the vertex group `crown` used by the hat rule in §3.2.
    5. For each item and each base, the dispatcher calls: build → `fit_to_base(obj, base)` → shape-key transfer → clipping test → export `<id>_f.glb` / `<id>_m.glb` → write `<id>.meta.json` and `art/out/reports/<id>.json`.
    6. Re-register the P07a starter items in `ITEMS` without changing their ids.
  - *Acceptance:* `npm run art:build -- wardrobe` regenerates every P07a starter; each report's triangle count is within ±1 % of the P07a report and `maxPenetrationMm ≤ 5` for both bases; `npm run assets:check` passes.
  - *Out of scope:* new items (T03–T09), thumbnails (T11).

- [ ] **P08a-T02** Extend palette colours and `colors.json`
  - *Files:* `src/content/catalog/colors.json`, `src/content/palette.json`, `public/assets/textures/palette.png` (only if cells are missing), `art/blender/gen_palette.py`.
  - *Depends on:* –
  - *Steps:*
    1. Count existing swatches by group in `colors.json`; the targets are R5 (≥ 10 skin, ≥ 12 hair, ≥ 24 fabric, ≥ 6 metal/accent).
    2. If `palette.png` lacks cells, add them through `gen_palette.py` by **appending** to free cells in the rows reserved by `assets.md` §1 (skin rows, hair row, fabric rows). Never move or recolour an existing cell.
    3. Add each swatch to `palette.json` (`key`, `cell: [col,row]`, `hex`) and to `colors.json` (`key`, `group: 'skin'|'hair'|'fabric'|'metal'`, `label: {vi, en}`).
    4. Run `npm run content:validate` and `npm run assets:check`.
    5. Take an office screenshot before and after (`npm run test:e2e -- --grep office-overview`) to prove the environment art did not change.
  - *Acceptance:* R5 counts met (`node scripts/catalog-validate.mjs --counts` prints them); the palette test in `assets:check` passes; the before/after office screenshots are pixel-identical.
  - *Out of scope:* patterns or prints (§4 "Patterns/prints").

- [ ] **P08a-T03** ∥ Batch B1: hair (10 new, 14 total)
  - *Files:* `art/blender/gen_hair.py`, `src/content/catalog/hair.json`, `public/assets/models/wardrobe/hair_*`, `art/out/contact/hair_*.png`.
  - *Depends on:* T01, T02.
  - *Steps:*
    1. Add generator functions for the hair ids in §3.1 that do not exist yet; R2 requires bob, long, ponytail, bun, curly, short, undercut.
    2. Build each as low-poly shells/strands ≤ 1 500 tris, UV on a white cell, `TINT` R = hair colour.
    3. Attach hair rigidly to `Attach_Head`; long styles (below the shoulders) are skinned to `Head`/`Neck`/`Spine2` instead, and say so in the meta (`attach: 'skinned'`).
    4. Call `mark_crown_group` on every hair.
    5. Hair head shape differs slightly per base: generate `_f` and `_m` only when the head meshes differ; otherwise export one `<id>.glb` and list both bases.
    6. Add one `CatalogItem` row per item with Vietnamese and English labels (e.g. "Tóc bob", "Tóc đuôi ngựa").
  - *Acceptance:* `npm run art:build -- wardrobe --slot hair` succeeds; every report shows ≤ 1 500 tris and no head penetration > 5 mm at `Heavy` max; `hair.json` has ≥ 14 rows; the contact sheet shows each style from front, side and back.
  - *Out of scope:* hair physics, hair under hats beyond the crown group.

- [ ] **P08a-T04** ∥ Batch B2: face parts
  - *Files:* `art/blender/gen_face_atlas.py`, `public/assets/textures/face_atlas.png`, `src/content/catalog/face-atlas.json`, `src/content/catalog/{eyes,brows,mouth,facial_hair}.json`, `public/assets/models/wardrobe/facial_hair_*.glb`.
  - *Depends on:* T01.
  - *Steps:*
    1. Extend `gen_face_atlas.py` so it draws the styles in §3.1: eyes 8, brows 5, mouth 6 (totals include starters).
    2. Each eye style gets four cells: `open`, `half`, `closed`, `happy`. Each mouth gets `neutral` and `talk`. Keep the 512 px, 8 × 8 grid; if cells run out, raise the question in the PR rather than changing the grid.
    3. Write every cell to `face-atlas.json` as `{ id, state, cell: [col,row] }`.
    4. Facial hair (moustache, goatee, stubble) = one atlas cell plus a thin mesh attached to `Attach_Head`; mark rows `bases: ['male','female']` (no restriction by base).
    5. Add catalogue rows with `model: null` and `faceTile` for eyes/brows/mouth.
  - *Acceptance:* `face_atlas.png` ≤ 120 KB; `npm run catalog:validate` confirms every `faceTile` and every state exists in `face-atlas.json`; counts meet R1; a contact sheet shows all eye styles in all four states.
  - *Out of scope:* animated expressions (P07b owns blink and sleep switching).

- [ ] **P08a-T05** ∥ Batch B3: tops (9 new, 12 total)
  - *Files:* `art/blender/gen_tops.py`, `src/content/catalog/top.json`, `public/assets/models/wardrobe/top_*`.
  - *Depends on:* T01, T02.
  - *Steps:*
    1. Implement the top ids of §3.1 using `torso_tube`, `sleeve` and `collar`; R2 requires crew t-shirt, V t-shirt, polo, shirt, blouse, hoodie, sweater, vest.
    2. Shrinkwrap offset 10 mm (§3.2); hem ends at the hip line.
    3. Paint `TINT`: R = main fabric, G = collar/cuffs/trim, B = buttons/print block.
    4. Run both bases; record `bodyLimits` from the clipping test into the meta.
    5. Add rows with `tags` (`office`, `casual`, `sport`, `winter`) and `tint.defaults`.
  - *Acceptance:* every report: ≤ 1 500 tris, penetration ≤ 5 mm on both bases inside `bodyLimits`, sleeves clean at `Muscle` max; `bodyLimits` meets R8; `top.json` ≥ 12 rows.
  - *Out of scope:* outerwear (T07).

- [ ] **P08a-T06** ∥ Batch B4: bottoms and skirts (5 new, 8 total)
  - *Files:* `art/blender/gen_bottoms.py`, `src/content/catalog/bottom.json`, `public/assets/models/wardrobe/bottom_*`.
  - *Depends on:* T01, T02.
  - *Steps:*
    1. Implement the bottom ids of §3.1; R2 requires jeans, trousers, shorts, mini skirt, midi skirt, pleated skirt.
    2. Trousers use `leg_tube` with offset 8 mm; skirts use `skirt()` plus `skirt_weights()`.
    3. Render the pose test: walk frames at maximum stride and the `sit_idle` pose, for both bases.
    4. If a seated pose penetrates > 15 mm, bake the `Seated` shape key and set `seatedVariant: 'spread'` in the meta (§3.3).
    5. A skirt that cannot pass on the male base ships `bases: ['female']`; state it in the report.
    6. Add catalogue rows.
  - *Acceptance:* penetration ≤ 5 mm standing and ≤ 15 mm seated; the contact sheet of walk extremes and `sit_idle` shows no tearing; `bottom.json` ≥ 8 rows.
  - *Out of scope:* cloth simulation, extra skirt bones (the rig is frozen).

- [ ] **P08a-T07** ∥ Batch B5: fullbody (4 new) and outer (4 new)
  - *Files:* `art/blender/gen_fullbody.py`, `art/blender/gen_outer.py`, `src/content/catalog/{fullbody,outer}.json`, GLBs.
  - *Depends on:* T01, T02 (and reads T05 tops for the outer × top check).
  - *Steps:*
    1. Fullbody: `dress_aline`, `dress_office`, `ao_dai` (tunic with two long panels + integrated trousers, §3.3), `jumpsuit`, `suit_set`. Rows carry `hides: ['top','bottom']`.
    2. Outer: `blazer`, `cardigan`, `bomber`, `raincoat` with offset 16 mm; rows carry `requires: ['top']` (a fullbody also satisfies it; note this for P08b logic).
    3. Dresses use the leg blend; suit set and jumpsuit use trouser legs.
    4. Run both bases. Dresses may ship `bases: ['female']`; the suit set must fit both.
    5. Add catalogue rows; tag `ao_dai` as `traditional`.
  - *Acceptance:* R3/R4 for each item; `hides`/`requires` rows validate; the outer × top matrix (run by T10) has no failure for these items or lists `conflicts`.
  - *Out of scope:* layering test script itself (T10).

- [ ] **P08a-T08** ∥ Batch B6: shoes (4 new) and bags (3)
  - *Files:* `art/blender/gen_shoes.py`, `art/blender/gen_bags.py`, `src/content/catalog/{shoes,bag}.json`, GLBs.
  - *Depends on:* T01, T02.
  - *Steps:*
    1. Shoes: sneaker, loafer, heel_low, boot, sandal, slipper (6 total). Skin to foot/toe bones; the body's feet are hidden by the meta `hideRanges`.
    2. Keep the sole at y = 0. For heels write `heelLift` (metres, max 0.03) in the meta; P07b raises the body by it.
    3. Bags: tote, backpack, crossbody. Backpack attaches to `Attach_Back`; tote and crossbody are skinned to `Spine2`/shoulder with a strap.
    4. Check arm clearance during `walk` for bags, on both bases.
    5. Add catalogue rows.
  - *Acceptance:* sole y = 0 ± 1 mm in every report; `heelLift ≤ 0.03`; no arm penetration > 5 mm in the walk contact sheet; `shoes.json` ≥ 6, `bag.json` ≥ 3.
  - *Out of scope:* held work props (those are `TaskType.carries`, not wardrobe).

- [ ] **P08a-T09** ∥ Batch B7: small accessories
  - *Files:* `art/blender/gen_accessories.py`, `src/content/catalog/{head,glasses,ears,neck,wrist}.json`, GLBs.
  - *Depends on:* T01, T02.
  - *Steps:*
    1. Head: cap, beret, non_la, headband. Set meta `hairClip: 'crown'` for cap, beret and non_la.
    2. Glasses (round, square, cat_eye, sunglasses) and ears (stud, hoop, drop): rigid on `Attach_Head`, one GLB each with a per-base offset.
    3. Neck: necklace_pearl, chain_gold, scarf, tie, bow_tie, lanyard_badge ("thẻ nhân viên"). Rigid on `Attach_Neck`, with an offset rule that follows the `Chest` slider (`offsetPerChest` in meta).
    4. Wrist: watch, bracelet, beads on `Attach_WristL`.
    5. Each ≤ 400 tris; metal parts use metal swatches via `TINT`.
    6. Add catalogue rows.
  - *Acceptance:* counts meet R1 (head ≥ 4, glasses ≥ 4, ears ≥ 3, neck ≥ 6, wrist ≥ 3); every meta has `attach.bone`; contact sheet shows the lanyard badge as a readable shape and the nón lá over three different hairs without the crown poking through.
  - *Out of scope:* earrings physics, real brand shapes (R9).

- [ ] **P08a-T10** Layering matrix test
  - *Files:* `art/blender/test_layering.py`, `art/out/reports/layering.json`, catalogue rows (`conflicts`).
  - *Depends on:* T05, T06, T07.
  - *Steps:*
    1. For each base, load every top × bottom pair, and every outer × (top or fullbody) pair.
    2. Evaluate each pair at 6 slider corners (min/max of `Heavy`, `Muscle`, `Chest` inside the pair's combined `bodyLimits`).
    3. Measure garment-through-garment penetration with the same ray test as the body clipping test; fail above 5 mm.
    4. Write `layering.json` as `[{a, b, base, corner, maxMm, pass}]`.
    5. For each failing pair either fix the offset in the generator and rerun, or add both ids to each other's `conflicts` array in the catalogue.
  - *Acceptance:* `layering.json` has zero `pass: false` entries that are not covered by a `conflicts` row; `npm run catalog:validate` accepts the `conflicts` ids.
  - *Out of scope:* accessories against garments (visually checked in contact sheets only).

- [ ] **P08a-T11** Thumbnails and thumbnail wall
  - *Files:* `art/blender/render_thumb.py`, `public/assets/thumbs/*.webp`, `art/out/thumb-wall.png`.
  - *Depends on:* T03–T09.
  - *Steps:*
    1. Implement §3.4: EEVEE, fixed camera per slot, grey mannequin (the female base for items whose `bases` includes it, else male), transparent background.
    2. Render 512 px, downscale to 256 px WebP quality 80; if a file exceeds 15 KB, lower quality in steps of 5.
    3. Face parts: crop the atlas cell ×4 on a skin-tone disc.
    4. `npm run thumbs:render` renders only missing or stale thumbnails; `-- --only <id>` forces one.
    5. Compose `thumb-wall.png` (grid, labels = ids) for the PR.
  - *Acceptance:* every catalogue row's `thumb` file exists and is ≤ 15 KB (`npm run assets:check`); the wall shows all items with no empty tiles.
  - *Out of scope:* per-colour thumbnails (colours are shown as swatches in the editor).

- [ ] **P08a-T12** Worst-case budget script
  - *Files:* `scripts/catalog-budget.mjs`, `package.json` (`catalog:budget`), `art/out/reports/budget.json`.
  - *Depends on:* T03–T09.
  - *Steps:*
    1. Read tri counts from `art/out/reports/<id>.json` and byte sizes from `public/assets`.
    2. For each base, build the 20 heaviest valid outfits (respect `hides`, `requires`, `conflicts`) and add the body's visible triangles.
    3. Fail if any outfit exceeds 8 000 tris.
    4. Sum bytes per slot; fail if this phase adds more than 13 MB or `public/assets` exceeds 30 MB.
    5. Print a table for the PR body.
  - *Acceptance:* `npm run catalog:budget` exits 0 and prints worst-case tris per base and bytes per slot.
  - *Out of scope:* runtime performance (P07b/P11 measure that).

- [ ] **P08a-T13** Ledger, optimisation, validators, generator weights
  - *Files:* `art/LICENSES.md`, `public/assets/credits.json`, `src/content/catalog/generator-weights.json`, all GLBs (optimised in place).
  - *Depends on:* T03–T12.
  - *Steps:*
    1. Run `npm run assets:optimize` over `public/assets/models/wardrobe`.
    2. Add a ledger row and a `credits.json` entry for every new file (own generated work: licence CC0, author "AI Office", source = generator script path).
    3. Write `generator-weights.json`: `{ tagWeights: { office: 3, casual: 2, traditional: 0.2, sport: 0.5, party: 0.2 }, perSlotNoneChance: {...}, byBase: {...} }` so seeded default looks stay office-appropriate. This is data only; do not edit `src/scene/characters/generate.ts`.
    4. Run `npm run content:validate && npm run catalog:validate && npm run assets:check`.
    5. Confirm no `.blend`, zip or `art/.cache` file is staged (`git status`).
  - *Acceptance:* all three validators exit 0; R7 and R9 hold; `git diff --stat` shows no file under `src/` except `src/content/**`.
  - *Out of scope:* changing generator logic.

- [ ] **P08a-T14** Recipe and dry run
  - *Files:* `art/RECIPE-add-item.md`, plus the bonus item's files.
  - *Depends on:* T13.
  - *Steps:*
    1. Write the recipe following §3.5, including the per-base outputs, a copy-paste JSON row template and the troubleshooting table.
    2. Hand the recipe to a different agent with only this instruction: "Add `top_ao_ba_ba` using art/RECIPE-add-item.md".
    3. That agent records every point where the recipe was unclear.
    4. Fix the recipe for each point.
  - *Acceptance:* R6: the bonus item is in `top.json` with both GLBs, meta, thumbnail and ledger row; validators pass; the friction notes and fixes are listed in the PR.
  - *Out of scope:* adding more bonus items.

## 6. Dependencies
- **Needs:** P07a pipeline, rig, bases; P07b (to see items in the running app and for `generateAppearance`); `assets.md`.
- **Later phases rely on:** P08b (catalogue size, thumbs, tags, `colors.json`, presets use these ids), P09 (ids stored in appearance docs: **item ids are permanent**; retire items by `"retired": true`, never delete or rename).

## 7. Branch and PR
- Branch `stack/p08a-wardrobe-assets` from `stack/p07b-characters`. Base `stack/p07b-characters`. Title: `[P08a] Wardrobe catalogue: 80+ items`.
```md
<stack map>
## What
Catalogue assets + generators + JSON rows. No runtime code.
## Counts
| slot | before | after | min |
## Reports
clipping max per batch · layering failures (0) · worst-case tris · bytes added (≤ 13 MB) · assets total (≤ 30 MB)
## Renders
thumbnail wall, contact sheets per batch
## Verify
npm run art:build -- wardrobe && npm run catalog:validate && npm run assets:check
```

## 8. Review checklist
- [ ] R1/R2 counts and named items present; labels are natural Vietnamese with diacritics.
- [ ] Reports show ≤ 5 mm penetration; exceptions listed (≤ 5 `fitted` items).
- [ ] Style consistent with `assets.md` (palette only; no logos; no stray textures; proportions).
- [ ] Item ids follow the convention and none of the P07a ids changed.
- [ ] Ledger complete; no caches/zips/.blend committed; size budget respected.
- [ ] Recipe dry-run evidence (T14) in the PR.
- [ ] Diff has no `src/` code changes (JSON only).

## 9. Risks and open questions
- **Volume:** 65+ new items is a lot of generation; batches are independent, and R1 minimums are the floor: if time runs out, ship R2-required items first, rest in a follow-up asset PR stacked above.
- **Skirts when seated** are the likeliest visual defect; `Seated` variant is the escape hatch.
- **Palette capacity** (256 cells) may run short with many fabric colours; mitigated by tinting through vertex colours (any swatch works on white cells).
- **Per-base fitting** doubles runs and bytes (budget raised to 13 MB for this phase). Items that fail on one base ship single-base.
- Open: which outfits matter most to the sister (traditional, office, streetwear)? Tags make it easy to grow later.
