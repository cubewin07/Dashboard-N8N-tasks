# P08a: Wardrobe catalogue assets

Asset PR: binaries + generator scripts + JSON content rows. No runtime code.

## 1. Goal and demo
Grow the starter set into a real fashion catalogue (≥ 80 items) using the P07a pipeline, and leave behind a recipe that lets any agent add one more item in a few minutes without touching code.
**Demo after merge:** seeded default looks in the office become much more varied (the generator picks from the bigger catalogue). The PR shows a thumbnail wall of every item and contact sheets per slot.

## 2. Requirements
- **R1** Catalogue minimums (totals include P07a starters): hair ≥ 14, eyes ≥ 8, brows ≥ 5, mouth ≥ 6, facial_hair ≥ 3, top ≥ 12, bottom ≥ 8, fullbody ≥ 5, outer ≥ 4, shoes ≥ 6, head ≥ 4, glasses ≥ 4, ears ≥ 3, neck ≥ 6, wrist ≥ 3, bag ≥ 3. Mesh/atlas items total ≥ 80.
- **R2** Required specific items: hair (bob, long, ponytail, bun, curly, short, undercut); tops (crew t-shirt, V t-shirt, polo, shirt, blouse, hoodie, sweater, vest); bottoms (jeans, trousers, shorts, mini skirt, midi skirt, pleated skirt); fullbody (dress, **áo dài**, jumpsuit, suit set); head (cap, beret, **nón lá**); neck (necklace, chain, scarf, tie, **thẻ nhân viên** lanyard).
- **R3** Every skinned item passes the fitting pipeline on both body bases: max penetration ≤ 5 mm inside its `bodyLimits`; budgets garment/hair ≤ 1 500 tris; assembled worst-case outfit ≤ 8 000 tris (checked by script over the 20 heaviest combinations).
- **R4** Every item has: GLB (or face-atlas cell), `*.meta.json`, 256×256 WebP thumbnail ≤ 15 KB, a `CatalogItem` JSON row with `label.vi` + `label.en`, `tags`, `tint`, `hides`, `credit`.
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
- [ ] **P08a-T01** Generalise generators: `art/blender/gen_wardrobe.py` dispatcher + `--only`, `lib/garment_profiles.py` (lofted tubes with profile curves: torso, sleeve, leg, skirt, collar), skirt weights, hatcut groups. *Acceptance:* regenerating the 15 P07a starters through the new dispatcher yields reports within ±1 % tris and passing clipping.
- [ ] **P08a-T02** Palette/colour extension: `colors.json` to R5 (cells must already exist in `palette.png`; if not, extend the palette in a way that keeps existing UVs valid: append rows only). *Acceptance:* R5; `assets:check` palette test passes; env art unchanged (screenshot diff).
- [ ] **P08a-T03** ∥ **B1 hair** (10 new). *Files:* `gen_hair.py`, `catalog/hair.json`, GLBs, thumbs. *Acceptance:* R3/R4 per item; crown group present; no head clipping at `Heavy` max.
- [ ] **P08a-T04** ∥ **B2 face parts** (eyes +5, brows +3, mouth +3, facial hair 3). *Files:* `gen_face_atlas.py`, `face_atlas.png`, `face-atlas.json`, catalogue rows. *Acceptance:* each eye style has open/half/closed/happy cells; atlas ≤ 120 KB.
- [ ] **P08a-T05** ∥ **B3 tops** (9 new). *Acceptance:* R3/R4; sleeves do not clip at `Muscle` max within limits.
- [ ] **P08a-T06** ∥ **B4 bottoms** (5 new incl. 3 skirts) with the leg blend. *Acceptance:* R3/R4; contact sheet of walk frame extremes and `sit_idle` shows no tearing; penetration ≤ 5 mm standing, ≤ 15 mm seated.
- [ ] **P08a-T07** ∥ **B5 fullbody** (4 new incl. áo dài, suit set) **and outer** (4). *Acceptance:* R3/R4; `hides`/`requires` rows correct; outer over every top passes clipping (matrix report).
- [ ] **P08a-T08** ∥ **B6 shoes** (4 new) **and bags** (3). *Acceptance:* shoes keep sole at y=0 (heel raises body by meta `heelLift`, max 3 cm, consumed by P07b seat/ground offset); bags attach to `Attach_Back`/shoulder without arm clipping in `walk`.
- [ ] **P08a-T09** ∥ **B7 small accessories** (head 4, glasses 3, ears 3, neck 5, wrist 3). *Acceptance:* rigid attach metas; lanyard badge readable shape; necklace follows `Chest` via offset rule.
- [ ] **P08a-T10** Layering matrix test (`art/blender/test_layering.py`): every top × bottom, every outer × top/fullbody at 6 slider corners; writes `art/out/reports/layering.json`. *Acceptance:* zero failures or item-pair `conflicts` rows added to JSON.
- [ ] **P08a-T11** Thumbnails for all items; thumbnail wall image for the PR. *Acceptance:* R4; every catalogue `thumb` file exists.
- [ ] **P08a-T12** Worst-case budget script (`scripts/catalog-budget.mjs`): heaviest combos ≤ 8 000 tris; per-slot byte totals. *Acceptance:* R3, R7 numbers in PR.
- [ ] **P08a-T13** Ledger + credits + optimisation + validators green; update `generateAppearance` **data weights only** (`catalog/generator-weights.json`: which tags are "office-like" defaults) so seeded looks stay office-appropriate. *Acceptance:* R7, R9.
- [ ] **P08a-T14** Write `art/RECIPE-add-item.md`, then a different agent adds one bonus item (e.g. `top_ao_ba_ba`) using only the recipe and reports friction; fix the recipe. *Acceptance:* R6; the bonus item is in the catalogue.

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
- Open: which outfits matter most to the sister (traditional, office, streetwear)? Tags make it easy to grow later.
