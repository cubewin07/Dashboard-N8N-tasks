# Recipe: add one wardrobe item

Adding a garment, hairstyle or accessory needs no app code: one Python builder, one JSON row,
generated files. Budget: 15–30 minutes for a variant of an existing item.

Read once: `art/CHARACTER-PIPELINE.md` (space, rig, colours, tints, meta, attach bones, hat band) and
`docs/plan/assets.md` §1 (the look: low-poly, flat-shaded, 2–4 readable sub-shapes, palette colours only,
no logos or copied brand designs).

## 0. Setup

```bash
npm ci                                  # once (the build scripts use @gltf-transform)
npm run art:build -- body               # once: base bodies into art/.cache/raw/characters (needed for §7)
npm run art:build -- wardrobe           # once, ~15 s: every raw item (the layering test in §6 needs all of them)
```

Blender lives at `/Applications/Blender.app/Contents/MacOS/Blender` (override with `BLENDER_BIN`). Everything in
`art/.cache/` and `art/out/` is generated and ignored by git.

## 1. Pick the slot, kind and id

| Slot | Kind | Module to add to | Attach |
|---|---|---|---|
| top, bottom, fullbody, outer, shoes | skinned | `art/blender/items_skinned/<module>.py` | `"skinned"` |
| hair, facial_hair, head, glasses, ears, neck, wrist, bag | rigid | `art/blender/items_rigid/<module>.py` | `{ "bone": … }` |
| eyes, brows, mouth | face atlas cell | `art/blender/gen_face_atlas.py` | `"skinned"` + `faceTile` |

- Id: `<slot>_<name>_<nn>` in lower snake case, e.g. `top_ao_ba_ba_01`. **Ids are permanent** (saved looks refer to
  them). To retire an item set `"retired": true` on its row; never rename or reuse an id.
- Bases: both (`["female","male"]`) unless the item only makes sense on one base.
- Rigid bones: `Head` (hair, facial hair, hats, glasses, ears), `Neck` (necklace, tie, bow tie, scarf),
  `Spine2` (lanyard, bags), `LeftForeArm` (watch, bracelets).

## 2. Write the builder

Copy the nearest existing item (`starters.py`, or `tops.py` for tops) and change its parameters. A new module file in
`items_skinned/` (or `items_rigid/`) is picked up automatically; it can import helpers from a sibling module
(`from items_skinned.tops import _build_top, _fit_kwargs`). Put new helpers in
your module; do not change the shared libs (`art/blender/lib/*.py`) for one item.

**Skinned** (`items_skinned/`): `build(ctx) -> (bmesh, fit_kwargs)`. `ctx` holds one base body's measurements and
callbacks (`lib/garments.py: make_context`): `ctx.sampler`, `ctx.upper_arm_s`, `ctx.wrist_s`, `ctx.make_top_offset`,
`ctx.top_region_filter`, `ctx.armhole_delta_fn`, `ctx._make_pants_callbacks`, `ctx.make_pants_offset`, …

```python
from items_skinned import register
from lib.garments import build_top_mesh


def build_top_example_01(ctx):
    bm = build_top_mesh(
        ctx.sampler,
        sleeve_len=ctx.upper_arm_s * 0.96,
        torso_offset_hips=0.023, torso_offset_chest=0.019, sleeve_offset=0.0175,
        collar_type="crew", primary_swatch="c_white",
    )
    return bm, {
        "offset_fn": ctx.make_top_offset(0.0175, 0.0235),
        "smooth_weight_iters": 1,
        "vert_region_filter_fn": ctx.top_region_filter,
        "delta_scale_fn": ctx.armhole_delta_fn,
    }


register("top_example_01", "top", ("female", "male"), build_top_example_01)
```

Tops: `tops._build_top(ctx, parts={...}, sleeve="long"|"short"|"none", sleeve_len=…, neck="crew"|"shirt"|"v"|"scoop"|"high",
collar=None|"rim"|"shirt"|"polo"|"turtle", placket=…, buttons=…, off_hips=…, …)` is richer than the
`lib.garments.build_top_mesh` of the example above; `parts` maps a part name to `(swatch, tint slot)`, and the tint slot
names (`primary`/`secondary`/`accent`) must match the catalogue row's `tint.regions`. You can post-process the returned
bmesh (e.g. delete faces for a slit) before returning it.

Layer offsets (skin to garment surface): bottoms 9.5–10.5 mm at the waist, tops 17–24 mm torso / ≤ 19 mm sleeves,
outer layers ≥ 32 mm torso / ≥ 27 mm sleeves. Skirts and long panels use the leg blend
(`lib.garments.skirt_weights(ctx, …)` as `weight_override_fn`) so walking opens them instead of tearing them.
Optional meta hints go in `register(..., meta={...})`: `maxStride`, `seatedVariant`, `heelLift`.

**Rigid** (`items_rigid/`): `build(probe) -> bmesh`, authored in rest-pose character space (metres, +Z up, the
character faces −Y, its left is +X). `probe` (`lib/rigid_common.py: BodyProbe`) gives head, face, eye, brow, nose, ear
boxes and BVHs of both torsos for clearance tests. Colour faces with `charexport` swatches (tinted regions sit on the
palette `white` with a tint mask); hair uses `_paint_hair_faces` and is never tinted.

```python
register("glasses_example_01", "glasses", "Head", build_glasses_example_01)
register("head_example_01", "head", "Head", build_head_example_01, meta={"hairClip": "crown"})
```

Hats that cover the crown carry `meta={"hairClip": "crown"}`, sit on the hat band (`hat_band_z(probe)`,
`hat_ring_point(...)`) and keep their inner surface ≥ `HAT_CLEAR_M` (35 mm) off the scalp. Hair is built with the
cranium helpers and gets an automatic `<id>_hatcut.glb`.

**Face parts:** add the drawing to `gen_face_atlas.py` in a free cell and the cell to
`src/content/catalog/face-atlas.json`; eyes need 4 cells in a row (open, half, closed, happy).

## 3. Build, fit and export

```bash
npm run art:build -- wardrobe --only top_example_01      # skinned
npm run art:build -- rigid --only glasses_example_01     # rigid
```

The skinned pipeline fits the mesh to each base, tests clipping on 34 shape-key combos and 3 poses, narrows
`bodyLimits` where needed, and writes `art/.cache/raw/wardrobe/<id>_<f|m>.glb`, `<id>.meta.json` and
`art/out/reports/<id>.json`. The npm output only prints `tris`; read `pen` (`maxPenetrationMm`, must be ≤ 5 mm), `bodyLimits` and `hideRegions`
per base from `art/out/reports/<id>.json`.
Then copy into the app and refresh the generated lists:

```bash
npm run assets:optimize -- top_example_01_f top_example_01_m   # GLB stems; rigid: glasses_example_01
npm run assets:manifest && npm run assets:credits              # manifest + licence ledger + credits.json
```

Run `assets:manifest && assets:credits` again after §5 (the thumbnail needs its own credits row, otherwise
`assets:check` fails).

## 4. Catalogue row

Append to `src/content/catalog/<slot>.json` (a new slot file is picked up automatically):

```json
{
  "id": "top_example_01",
  "slot": "top",
  "label": { "vi": "Áo ví dụ", "en": "Example top" },
  "bases": ["female", "male"],
  "model": { "female": "models/wardrobe/top_example_01_f.glb", "male": "models/wardrobe/top_example_01_m.glb" },
  "thumb": "thumbs/top_example_01.webp",
  "attach": "skinned",
  "tint": { "regions": ["primary"], "defaults": { "primary": "c_white" } },
  "hides": [],
  "tags": ["casual"],
  "credit": "own-generated"
}
```

- Rigid rows point both bases at the same file (`models/wardrobe/<id>.glb`) and use `"attach": { "bone": "Head" }`.
- Face rows: `"model": null`, `"faceTile": { "atlas": "face", "cell": [col, row] }`, `"tint": null`.
- `tint.defaults` keys come from `src/content/catalog/colors.json` (`fabric` for cloth, `metal` for jewellery).
  `"tint": null` when nothing is tintable.
- `hides`: slots hidden while worn (fullbody: `["top", "bottom"]`). `requires`: any-of slots needed (outer:
  `["top", "fullbody"]`). `conflicts`: item ids that cannot be worn with this one (only if the layering test says so).
- Labels in natural Vietnamese with full diacritics, plus English. Tags: `office`, `casual`, `formal`, `street`,
  `sport`, `traditional`, `tet`, `party`, `winter`, `summer`, `fitted` (`office` items feed seeded office looks,
  weights in `catalog/generator-weights.json`).

## 5. Thumbnail

```bash
npm run thumbs:render -- --only top_example_01     # public/assets/thumbs/<id>.webp, 256², ≤ 15 KB
```

## 6. Check

```bash
npm run catalog:validate && npm run assets:check
npm run catalog:layering -- --only top_example_01  # skinned layers: poke-through vs the other layers
npm run catalog:budget                             # worst-case outfit ≤ 8 000 tris
```

## 7. Look at it

Render a contact sheet on both bases and open the PNGs:

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 \
  -P art/blender/render_contact.py -- \
  --body art/.cache/raw/characters/body_female.glb \
  --garments art/.cache/raw/wardrobe/top_example_01_f.glb \
  --out-dir art/out/contact --prefix top_example_01_f
```

Check both bases (`_f`/`_m` with `body_female`/`body_male`). Read `*_shapes_front.png` and `*_shapes_3q.png` to judge the
shape; garments show the untinted red debug colour (palette regions, not the row's tint). `*_poses_*.png` shows sit,
arms up, arms down, deep bend and a walk stride on the neutral body; small skin flecks at the shoulders in the deep bend
are known for every top, anything larger is yours to fix. Pass several comma-separated GLBs to `--garments` to see layers together (e.g. a top over a bottom). Look for floating
parts, gaps, spikes, inside-out faces, clipping in poses and shapes that don't read at small size.

Known layering failures (P08a follow-up T15): every shipped top fails under every `outer_*` item at the extreme body
corners (heavy, muscle_shoulders, heavy_chest_hips; 9–16 mm). A new top or outer is fine if it fails the same pairs by
about the same amount as a shipped one; compare with `--only top_sweater_01`. Any other failure, or a failure at the
`neutral` corner, is yours to fix (or, for a pair that can never work, a `conflicts` entry on the row).

## 8. Commit

Commit the module, the JSON row, `public/assets/models/wardrobe/<id>*`, `public/assets/thumbs/<id>.webp`,
`art/targets.json`, `art/LICENSES.md`, `public/assets/credits.json`, `public/assets/manifest.json`.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `FitError` / `pen` > 5 mm | garment too close to the body somewhere, usually at a shape-key extreme | raise the offset there (`offset_fn`), or let the fitter narrow `bodyLimits` (≥ 60 % of each range must remain, else tag `fitted`) |
| Torn skirt or panel when walking | hem weighted to one leg | use the leg blend (`skirt_weights`) or the front-lap weights of `fullbody_dress_simple_01` |
| Sleeve clipping in `arms_up` | armhole too tight | keep `delta_scale_fn=ctx.armhole_delta_fn`; widen `sleeve_offset` |
| Layering test `FAIL` | inner layer pokes through the outer one | raise the outer offset or lower the inner one; if the pair truly can't work, add `conflicts` to the row |
| Hair through a hat | hair thicker than 30 mm below the hatcut line | check `crownMm` in the build log (≤ 30) |
| Thumbnail empty or tiny | GLB not optimised into `public/assets` yet, or wrong `model` path | run `assets:optimize` before `thumbs:render`; check the row's paths |
| `assets:check` over budget | too many tris (garment/hair 1 500, accessory 400) | fewer ring segments / sides; drop hidden faces |
| Wrong colour in the app | swatch name not in the palette, or tinted faces not on `white` | use `colors.json` keys; tinted regions must sit on the `white` cell |
