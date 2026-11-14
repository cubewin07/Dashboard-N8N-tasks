# Character pipeline contract (P07a → P07b, P08a)

Everything a character file must obey. `art/blender/lib/rig.py` is the code half of this
contract (bone table, shape-key names). Changing anything here after P07a is expensive.

## 1. Space and skeleton
- Blender: metres, +Z up, character **faces −Y**, its left is +X. Exported glTF: +Y up, **faces +Z**
  (runtime yaw 0 faces +Z). Origin between the feet on the floor. Neutral height 1.70 m. Rest = A-pose 45°.
- Skeleton = `rig.build_armature()`; never build bones by hand. 31 bones: `Root` + 24 deforming
  (`Hips Spine Spine1 Spine2 Neck Head`, `Left/Right` × `Shoulder Arm ForeArm Hand HandGrip UpLeg Leg Foot ToeBase`)
  + 6 attach bones (`Attach_Head Attach_Neck Attach_Back Attach_HandL Attach_HandR Attach_WristL`).
  Every skinned GLB carries this whole skeleton, same names, same rest pose. Max 4 influences per vertex.
- Shape keys (glTF morph targets), exactly this order, each a delta in 0..1: `Heavy, Slim, Muscle, Chest, Hips, Shoulders`.
  **The head (everything above the neck base, z > 1.44) is never moved by any shape key** and the head mesh is
  identical in `body_female` and `body_male`, so rigid hair/glasses fit both bases with no offset.

## 2. Files
| File | Root node | Contents |
|---|---|---|
| `public/assets/models/characters/body_female.glb`, `body_male.glb` | file name | armature + one skinned mesh, 2 primitives: `M_Palette` (body) and `M_Face` (5 face quads); 6 morph targets; ≤ 3 000 tris |
| `public/assets/models/characters/body.meta.json` | – | `{ regions: ["head","neck",…], bases: { female: {tris, regionVertexCounts}, male: {…} } }` |
| `public/assets/models/wardrobe/<item>_f.glb`, `<item>_m.glb` | file name | skinned garment fitted to that base: armature + mesh (`M_Palette`), the 6 morph targets |
| `public/assets/models/wardrobe/<item>.glb` | file name | rigid accessory / rigid hair: mesh only, authored in rest-pose character space (no armature) |
| `public/assets/models/wardrobe/<item>.meta.json` | – | see §5 |
| `public/assets/anim/library.glb` + `library.json` | `library` | armature only (no mesh), one glTF animation per clip |
| `public/assets/textures/face_atlas.png` | – | 512², 8 × 8 cells of 64 px |

Item ids / file stems are `slot_name_NN` (`top_tshirt_crew_01`); per-base files add `_f` / `_m`.

## 3. Vertex colour (`COLOR_0`, the active colour attribute; RGBA) — meaning depends on the primitive
| Primitive | R | G | B | A |
|---|---|---|---|---|
| body, `M_Palette` | region id / 255 (see `body.meta.json.regions`, index = id) | 0 | 0 | 1 |
| body, `M_Face` | 1 = eye quad | 1 = brow quad | 1 = mouth quad | 1 |
| garment / hair / accessory, `M_Palette` | 1 = primary tint | 1 = secondary tint | 1 = accent tint | shade 0.6..1 (1 = unshaded) |

- **Regions** (hide masks): every body vertex belongs to exactly one region; the runtime drops a body triangle
  when all three of its vertices are in hidden regions. Regions (id order):
  `head, neck, chest, belly, hips, upper_arm_l, upper_arm_r, elbow_l, elbow_r, forearm_l, forearm_r, hand_l, hand_r,
  thigh_l, thigh_r, knee_l, knee_r, shin_l, shin_r, ankle_l, ankle_r, foot_l, foot_r` (23). `head` and `hand_*` are never hidden.
- **Tint**: faces whose mask is 1 sit on the palette swatch `white` (UV) and the runtime multiplies in the chosen
  swatch colour. Untinted faces (masks 0) keep their fixed palette swatch.
- **Skin**: all skin UVs sit in the `skin_01` block (`skin_01`, `_shadow`, `_blush`, `_lip`); the runtime shifts them to
  the chosen skin's block. Underwear on the bare body is `c_white` / `c_grey_l` (not remapped).
- **Hair colour**: hair UVs sit on `hair_black` / `hair_black_hi`; the runtime shifts them to the chosen colour pair.
  Hair has no tint mask (masks 0).

## 4. Face
- 5 quads floating 1 mm in front of the face, part of the body mesh, skinned 100 % to `Head`: `eye_l, eye_r, brow_l, brow_r, mouth`.
  Each quad's UVs cover exactly one atlas cell: its **default cell** from `src/content/catalog/face-atlas.json`
  (`defaults`). The right eye/brow quads mirror U so one drawing serves both sides. The runtime changes a face part
  by adding `(Δcol/8, Δrow/8)` to those 4 UVs.
- The atlas is an **ink mask**: RGB grey level 0 = "ink" (replaced at runtime by a colour: eye colour, hair colour
  for brows, lip colour for the mouth), 1 = white (eye highlight, teeth); alpha = coverage. So draw black shapes with
  optional white highlights on a transparent background.
- Cells `[col,row]`, row 0 at the TOP of the image: eyes style *n* = row *n* (0..2), columns `open, half, closed, happy`
  (0..3); brows row 4 (col = style); mouths row 5 (col = style). Other cells stay transparent (reserved).

## 5. `<item>.meta.json`
```json
{ "id": "top_tshirt_crew_01", "slot": "top", "kind": "skinned",
  "bases": { "female": { "file": "models/wardrobe/top_tshirt_crew_01_f.glb", "tris": 412,
                           "hideRegions": ["chest","belly","upper_arm_l","upper_arm_r"],
                           "bodyLimits": { "Heavy": [0, 0.8] }, "maxPenetrationMm": 2.1 },
             "male":   { "…": "…" } } }
```
Rigid: `{ "id", "slot", "kind": "rigid", "bone": "Head", "merge": true, "bases": { "female": { "file": "models/wardrobe/hair_short_01.glb", "offset": [0,0,0], "scale": 1 }, "male": {…} } }`.
`bodyLimits` keys are shape-key names, values the safe `[min,max]` morph weights (omitted = full range of the runtime map:
Heavy 0..0.8, Slim 0..0.6, Muscle 0..0.8, Chest/Hips/Shoulders 0..1).

## 6. Animation clips
Clip names (exactly): `idle walk carry_walk sit_idle sit_type sit_read sit_phone stand_talk_a stand_talk_b wave think drink
sleep_desk sleep_bed sofa_sit pingpong arcade karaoke elevator_wait celebrate frustrated`.
- Rotation tracks for bones + a location track for `Hips` only. `Root` never moves (in place). 15 fps keys. Loops 1–3 s
  (one-shots `wave celebrate frustrated` ≤ 2.5 s, still end in their start pose).
- Walk: `speedMps` 1.3 at timeScale 1 (stride length × cadence), feet do not slide.
- Seated clips (`sit_*`, `sofa_sit`, `sleep_desk`): the character origin is the **seat centre on the floor**; the bottom of
  the pelvis rests at 0.45 m (sofa 0.42), thighs forward (+Z in glTF), feet on the floor. Desk top is at 0.74 m,
  its near edge ≈ 0.30 m in front of the seat centre: typing hands hover at ≈ 0.78 m, 0.35–0.45 m forward.
- `sleep_bed`: lying on the back at 0.40 m (mattress top), body centred on the origin, head towards the character's
  back (−Z in glTF), face up.
- `library.json`: `{ "clips": [{ "clip", "loop": true, "duration", "speedMps"? , "seated"?: true, "eyes"?: "closed"|"happy" }] }`.
