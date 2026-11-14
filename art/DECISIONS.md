# Art Decisions

## Character base

*Recorded 2026-11-14 (P07a-T01).*

### Decision

- **Base bodies:** Own generated female and male base meshes (`art/blender/gen_body.py` → `public/assets/models/characters/body_female.glb`, `body_male.glb`) with identical head topology (above neck base `z > 1.44 m`) and 6 shape keys in fixed order: `Heavy`, `Slim`, `Muscle`, `Chest`, `Hips`, `Shoulders`.
- **Skeleton:** Own shared skeleton (`art/blender/lib/rig.py`), Mixamo-like bone names, 31 bones total (`Root` + 24 deforming bones + 6 non-deforming `Attach_*` bones), rest pose A-pose 45°, neutral height 1.70 m.
- **Animations:** All 21 clips authored directly in Blender Python (`art/blender/gen_anims.py` → `public/assets/anim/library.glb` + `library.json`).

**Reasons:**
1. Continuous body sliders (`Heavy`, `Slim`, `Muscle`, `Chest`, `Hips`, `Shoulders`) require controlled shape keys on both the base body and every fitted garment (`fit_garment.py`).
2. External modular packs bake clothing into body segments or split characters into rigid parts without matching shape keys.
3. Scripted generation gives deterministic, reproducible builds with zero external archive downloads and zero licence ambiguity (`own-CC0`).

### Candidate evaluation (`phase-07a` §3.1)

*Note: Direct `curl` / archive download from the sandbox environment was blocked by outbound HTTP proxy policy (`Request to GET ... not allowed by policy`). Licence and pack metadata below were verified via web search on `2026-11-14`; archive-internal details (exact bone counts/names, clip contents, mesh separation, shape keys) are marked `not verified` where no local archive was downloaded or inspected in Blender.*

| Candidate | URL | Verified date | Licence evidence | Rig / bone names | Clothes separation | Shape keys | Verdict |
|---|---|---|---|---|---|---|---|
| **Quaternius Universal Animation Library** | `https://quaternius.com/packs/universalanimationlibrary` (`https://quaternius.itch.io/universal-animation-library`) | 2026-11-14 | CC0 1.0 Universal (Public Domain; commercial & modification allowed without attribution per quaternius.com / itch.io) | Humanoid rig designed for engine retargeting; exact bone list & names **not verified** (archive not downloaded/inspected) | N/A (animations) | **not verified** (archive not downloaded) | Not used — authoring clips directly in `gen_anims.py` against `rig.py` avoids retargeting drift on seated desk/sofa/bed heights |
| **Quaternius Ultimate Modular Men / Women** | `https://quaternius.com/packs/ultimatemodularmen`, `https://quaternius.com/packs/ultimatemodularwomen` | 2026-11-14 | CC0 1.0 Universal (Public Domain per quaternius.com) | Includes 24 animations & humanoid rig per pack page; exact bone names **not verified** (archive not downloaded/inspected) | Models split into 4 modular body-region parts; separate layered garment fitting vs baked parts **not verified** (archive not downloaded) | **not verified** (archive not downloaded) | Not used — lacks our 6-key body slider system across female/male bases and garment fitting |
| **KayKit Character Packs (Adventurers / Skeletons / Animations)** | `https://kaylousberg.itch.io/kaykit-character-pack-adventurers`, `https://kaylousberg.com/` | 2026-11-14 | CC0 1.0 Universal (free personal/commercial, no attribution required per itch.io) | Exact bone list **not verified** (archive not downloaded/inspected) | Fantasy/RPG themed characters with accessories; modern office layered separation **not verified** | **not verified** (archive not downloaded) | Not used — chibi/RPG proportions do not match our 1.70 m modern office style guide |
| **Kenney Characters (Blocky / Mini Characters)** | `https://kenney.nl/assets/blocky-characters`, `https://kenney.nl/assets/mini-characters` | 2026-11-14 | CC0 1.0 Universal (Public Domain per kenney.nl) | Exact bone list **not verified** (archive not downloaded/inspected) | Blocky/mini stylized skins; separable garment meshes **not verified** | **not verified** (archive not downloaded) | Not used — blocky/mini proportions and non-layered outfits do not fit slider-based office wardrobe |
| **Own base (`gen_body.py` + `rig.py` + `gen_anims.py`)** | Local project scripts | 2026-11-14 | `own-CC0` (AI Office project) | 31 bones (`Root` + 24 deform + 6 `Attach_*`), verified in `art/blender/lib/rig.py` | Layered garments fitted per base via `fit_garment.py` with hide masks | 6 shape keys (`Heavy`, `Slim`, `Muscle`, `Chest`, `Hips`, `Shoulders`) | **Chosen** |

### Frozen skeleton bone list (`art/blender/lib/rig.py`)

31 bones total (`Root` + 24 deforming + 6 non-deforming attach bones):

| # | Bone name | Parent | Deform | Role |
|---|---|---|---|---|
| 1 | `Root` | `—` | No | Character origin on floor (0, 0, 0) |
| 2 | `Hips` | `Root` | Yes | Pelvis root (location + rotation animated) |
| 3 | `Spine` | `Hips` | Yes | Lower spine |
| 4 | `Spine1` | `Spine` | Yes | Mid spine |
| 5 | `Spine2` | `Spine1` | Yes | Upper chest |
| 6 | `Neck` | `Spine2` | Yes | Neck |
| 7 | `Head` | `Neck` | Yes | Head (faces −Y in Blender, +Z in glTF) |
| 8 | `LeftShoulder` | `Spine2` | Yes | Left clavicle |
| 9 | `LeftArm` | `LeftShoulder` | Yes | Left upper arm (45° A-pose) |
| 10 | `LeftForeArm` | `LeftArm` | Yes | Left forearm |
| 11 | `LeftHand` | `LeftForeArm` | Yes | Left hand |
| 12 | `LeftHandGrip` | `LeftHand` | Yes | Left fingers / grip |
| 13 | `LeftUpLeg` | `Hips` | Yes | Left thigh |
| 14 | `LeftLeg` | `LeftUpLeg` | Yes | Left shin |
| 15 | `LeftFoot` | `LeftLeg` | Yes | Left foot |
| 16 | `LeftToeBase` | `LeftFoot` | Yes | Left toe |
| 17 | `RightShoulder` | `Spine2` | Yes | Right clavicle |
| 18 | `RightArm` | `RightShoulder` | Yes | Right upper arm (45° A-pose) |
| 19 | `RightForeArm` | `RightArm` | Yes | Right forearm |
| 20 | `RightHand` | `RightForeArm` | Yes | Right hand |
| 21 | `RightHandGrip` | `RightHand` | Yes | Right fingers / grip |
| 22 | `RightUpLeg` | `Hips` | Yes | Right thigh |
| 23 | `RightLeg` | `RightUpLeg` | Yes | Right shin |
| 24 | `RightFoot` | `RightLeg` | Yes | Right foot |
| 25 | `RightToeBase` | `RightFoot` | Yes | Right toe |
| 26 | `Attach_Head` | `Head` | No | Rigid head accessory / hair attach |
| 27 | `Attach_Neck` | `Neck` | No | Rigid neck accessory attach |
| 28 | `Attach_Back` | `Spine2` | No | Rigid back / bag attach |
| 29 | `Attach_HandL` | `LeftHand` | No | Left palm prop attach |
| 30 | `Attach_HandR` | `RightHand` | No | Right palm prop attach |
| 31 | `Attach_WristL` | `LeftForeArm` | No | Left wrist accessory attach |

### Animation clip sources (`art/CHARACTER-PIPELINE.md` §6)

All 21 clips in `public/assets/anim/library.glb` are procedurally authored in `art/blender/gen_anims.py` (30 fps authored, exported at 15 fps):

| Clip | Source |
|---|---|
| `idle` | authored: `gen_anims.py` |
| `walk` | authored: `gen_anims.py` |
| `carry_walk` | authored: `gen_anims.py` |
| `sit_idle` | authored: `gen_anims.py` |
| `sit_type` | authored: `gen_anims.py` |
| `sit_read` | authored: `gen_anims.py` |
| `sit_phone` | authored: `gen_anims.py` |
| `stand_talk_a` | authored: `gen_anims.py` |
| `stand_talk_b` | authored: `gen_anims.py` |
| `wave` | authored: `gen_anims.py` |
| `think` | authored: `gen_anims.py` |
| `drink` | authored: `gen_anims.py` |
| `sleep_desk` | authored: `gen_anims.py` |
| `sleep_bed` | authored: `gen_anims.py` |
| `sofa_sit` | authored: `gen_anims.py` |
| `pingpong` | authored: `gen_anims.py` |
| `arcade` | authored: `gen_anims.py` |
| `karaoke` | authored: `gen_anims.py` |
| `elevator_wait` | authored: `gen_anims.py` |
| `celebrate` | authored: `gen_anims.py` |
| `frustrated` | authored: `gen_anims.py` |
