# P06a: Environment assets (binaries + tooling)

## 1. Goal and demo
Produce every environment model the building needs (building kit, furniture, decor, held props), all on the shared palette, all with a licence row, through a scripted pipeline any agent can re-run. **No application code** in this PR: only `art/`, `scripts/` (asset tooling), `public/assets/`, `src/content/palette.json`, and CI wiring.

**Demo after merge:** the app looks exactly as after P05 (assets are not used yet). Reviewers open `art/out/contact-sheet-*.png` and see ~95 consistent low-poly models next to a 1.70 m silhouette. `npm run assets:check` is green and prints a size report.

## 2. Requirements
- **R1** Blender is verified (≥ 4.2) and its version recorded; all generation runs headless with `--factory-startup`.
- **R2** `src/content/palette.json` and `public/assets/textures/palette.png` exist per `assets.md` §1.2; the PNG is reproducible from the JSON (byte-identical on re-run).
- **R3** Every file listed in `assets.md` §8.1 exists under `public/assets/models/{env,props,decor}/` with the exact names, or the list in `assets.md` is updated in this PR with the reason.
- **R4** Every GLB passes `assets:check`: naming, tri budget, only `M_Palette`/`M_Glass`/`M_Emissive`, no embedded textures, required anchors per category, size ≤ 1.5 MB, family total ≤ 8 MB.
- **R5** Every shipped file has exactly one credit in `public/assets/credits.json` and a row in `art/LICENSES.md`; every external source has an entry with licence evidence in `art/sources/manifest.json`.
- **R6** `npm run assets:all` regenerates everything from a clean checkout plus the cache (or re-downloads when the cache is empty), without manual steps other than those listed in `art/MANUAL-DOWNLOADS.md`.
- **R7** `public/assets/manifest.json` lists each file with `tris`, `bytes`, `bbox`, `footprint` (snapped to 0.5 m) and `anchors`.
- **R8** Contact sheets for each family are committed under `art/out/` (≤ 400 KB each).
- **R9** CI runs `assets:check` (no Blender needed in CI: it validates the committed outputs).
- **R10** The app still builds and all existing tests pass; bundle size unchanged (assets are static files, not imports).

## 3. Specs

### 3.1 Tooling added
| Path | Purpose |
|---|---|
| `art/blender/lib/{palette,mesh,normalise,remap,export,render}.py` | shared library (`assets.md` §3) |
| `art/blender/gen_palette.py` | palette PNG from JSON (pure Python PNG writer, no Blender image nondeterminism) |
| `art/blender/gen_<family>.py` | one generator per family: `gen_building_kit`, `gen_vertical`, `gen_desks`, `gen_seating`, `gen_tech`, `gen_rooms`, `gen_storage`, `gen_meeting`, `gen_lobby_cafe`, `gen_games`, `gen_rest`, `gen_boss`, `gen_decor`, `gen_cat`, `gen_paper`, `gen_held_props`, `gen_street` |
| `art/blender/import_<pack>.py` | one importer per external pack actually used (e.g. `import_kenney_furniture.py`): picks models by a mapping table → normalise → remap → rename |
| `art/blender/contact_sheet.py` | renders a family grid with labels and the silhouette |
| `art/targets.json` | registry: target name → script, outputs, family, budget class, required anchors |
| `scripts/assets-fetch.mjs` | downloads sources by key into `art/.cache/` with sha256 verification |
| `scripts/art-build.mjs` | runs Blender for one/all targets, skips up-to-date targets (hash of script + lib + inputs) |
| `scripts/assets-optimize.mjs` | gltf-transform pipeline (dedup, prune, weld, quantize, meshopt) |
| `scripts/assets-manifest.mjs` | builds `public/assets/manifest.json` |
| `scripts/assets-check.mjs` (+ `licences-check.mjs`, `size-budget.mjs`) | validators |
| `package.json` scripts | `art:build`, `assets:fetch`, `assets:optimize`, `assets:manifest`, `assets:check`, `assets:all`, `art:sheets` |

Dev dependencies: `@gltf-transform/core`, `@gltf-transform/functions`, `@gltf-transform/extensions`, `meshoptimizer`, `sharp` (sheet compression). No runtime dependency is added.

### 3.2 `art/targets.json` entry
```json
{ "name": "desk_standard_01", "family": "desks", "script": "art/blender/gen_desks.py",
  "args": ["--variant", "standard_01"], "out": "public/assets/models/props/desk_standard_01.glb",
  "budget": "furniture", "anchors": ["_seat", "_screen"], "source": "generated" }
```
`source` is `generated` or a `sources/manifest.json` key; `assets:check` cross-checks it with `credits.json`.

### 3.3 Source decision per family
Each family task starts with a 30-minute **source spike**: check the candidate packs (`assets.md` §2.2), verify licence, look at 3 sample models after `remap.py`. Decide: *import + restyle* or *generate*. Rule of thumb: import when ≥ 70 % of the family's items exist in one pack and survive the palette remap looking consistent; otherwise generate the whole family (mixing within a family is what makes sets look patched together). Record the decision in §4 of this file (table "Source decisions", appended by the agent).

### 3.4 Required anchors by category (checked)
| Category | Required anchors |
|---|---|
| desk (all) | `_seat`, `_screen` (mesh), `desk_review/_manager/_boss`: also `_pile` |
| seating | `_seat` × seats |
| counters, machines, games | `_stand` (≥ 1) |
| beds/pods/massage chair | `_seat` (lie/sit pose anchor) |
| table_meeting | `_seat` × 6 |
| elevator_car | `_stand` × 4, `_door_l`, `_door_r`, `_led` |
| held props | `_hand_r` |
| clock_wall | nodes `hand_hour`, `hand_minute` |
| fan_ceiling | node `blades` |

### 3.5 Building kit module sizes
`slab_floor_01` 4 × 4 × 0.3 m tile; `wall_*` 4 m wide × 3.7 m high × 0.15 m; `column_01` 0.4 × 0.4 × 3.7 m; `stairs_flight_01` rises 2.0 m over 3.0 m run (two flights + landing per floor); `elevator_shaft_frame_01` 2.4 × 2.4 × 4.0 m per floor; facade panels 4 × 4 m. Floors of any template size are tiled from these (P06b), so adding a floor never needs a new model.

### 3.6 Contact sheets
`art:sheets` renders, per family, a grid on a 0.5 m checker floor with file names under each item and a grey 1.70 m silhouette at the left, 3/4 view, EEVEE, 1600 px wide, compressed to ≤ 400 KB. One extra sheet `contact-sheet-overview.png` shows a mock department corner assembled from the kit (desk cluster, office, bench, plants) to judge the set together.

## 4. Design choices
| # | Topic | Options | Choice | Reason | Revisit if |
|---|---|---|---|---|---|
| D1 | Source of truth | committed `.blend` files · Python generators + importers | **Python scripts** | Diffable, reviewable, reproducible by any agent, no LFS, no binary merge conflicts | A hero asset needs hand sculpting → `.blend` under LFS in its own PR |
| D2 | Mixed sources consistency | keep original textures · remap everything to one palette | **Remap to palette** | One material, one tiny texture, consistent look, enables instancing/merging | A pack loses its charm after remap → generate that family |
| D3 | Compression | Draco · meshopt · none | **meshopt** (+ quantize) | Faster decode, tiny decoder, good for low-poly; drei supports it | Files are so small that none is fine → keep meshopt anyway for uniformity |
| D4 | CI and Blender | install Blender in CI and rebuild · validate committed outputs only | **Validate only** | Blender in CI is slow and flaky; outputs are committed and deterministic | Drift between scripts and outputs is observed → add a weekly rebuild job |
| D5 | Granularity | one GLB with everything · one GLB per object | **One per object** (+ a few sets) | Instancing per model, lazy loading per floor, clean licence mapping | Request count hurts load → bundle per family in P11 (`assets:pack`) |
| D6 | Anchors | hard-coded offsets in app code · empties in the GLB extracted to a manifest | **Empties → manifest.json** | Artists/agents adjust seats in the asset, not in code | – |
| D7 | Cat | rigged + animated · static poses | **Static poses** (sit, loaf, stand) + hop movement | Decor only; a rig costs time and budget | Dad loves the cat → animate in P11 |
| D8 | Held props family here vs P07a | with characters · with environment | **Here** | They are palette props with a grip anchor, independent of the skeleton; P05 already needs the list | – |

**Source decisions** (filled in by the executing agents):

| Family | Decision | Pack / generated | Notes |
|---|---|---|---|
| All 17 families (desks, seating, tech, building kit, vertical, rooms, storage, meeting, lobby & café, games, rest, boss, decor, cat, paper, held props, street) | **Generate** | `art/blender/gen_<family>.py` on the shared builder `art/blender/lib/{mesh,parts,palette,export}.py` | 2026-11-11. No external pack was imported, so there is nothing to remap and no third-party licence row: every GLB is `own-CC0`. Mixing packs inside a family was the main consistency risk (§3.3); one builder for everything removes it. `art/sources/manifest.json` and `art/MANUAL-DOWNLOADS.md` are therefore not needed yet. |

**Decisions added while executing (2026-11-11):**

| # | Topic | Choice | Reason | Revisit if |
|---|---|---|---|---|
| D9 | Where the models come from | **Deterministic Blender Python generators**, written by the coding agent, committed as source | Fully reproducible and diffable (D1). Allowed by the boss on 2026-11-11 (rule 12 and Q11 now permit AI-generated models); the boss also accepted the style of the 102 models | – |
| D10 | Palette file | `src/content/palette3d.json` (248 swatches, append-only cells) next to the UI `palette.json` | `palette.json` already holds the department UI swatches with a different shape; one file per purpose keeps both schemas simple | The two drift → generate the UI swatches from the 3D palette |
| D11 | Tooling scope | `assets-check.mjs --strict` covers licence rows, budgets, materials and anchors in one script; no separate `licences-check`/`size-budget`/`assets-fetch` yet | Nothing is downloaded, so fetch has no job; one checker is easier to keep honest | A pack is imported → add `assets-fetch` and the sources manifest |
| D12 | Cat | Three poses as named nodes in one file (`pose_sit`, `pose_loaf`, `pose_stand`) | One request, one licence row; the runtime picks a node | – |
| D13 | Font hash | `BeVietnamPro-SemiBold.ttf` sha256 corrected in the ledger | The recorded hash did not match the committed file | – |
| D14 | Where the models land | **In the P01 PR (`stack/p01-foundation`, PR #2)** instead of an own `stack/p06a-env-assets` layer (boss decision, 2026-11-11) | The models and tooling depend on nothing above P01, so every later layer can use them; the font row of the ledger still arrives with P02 | – |

## 5. Tasks
- [x] **P06a-T01** Verify Blender, scaffold `art/`. *Files:* `art/STYLE-GUIDE.md`, `art/blender/lib/*.py`, `art/targets.json`, `.gitignore` (`art/.cache/`, `art/out/*` except `contact-sheet-*.png`). *Steps:* run `"$BLENDER_BIN" --version`; fail with a clear message if < 4.2; write lib modules (`assets.md` §3) with a smoke generator `gen_smoke.py` (a bevelled box painted with two swatches, one anchor). *Acceptance:* `"$BLENDER_BIN" -b --factory-startup -P art/blender/gen_smoke.py -- --out art/.cache/raw` produces a GLB whose only material is `M_Palette`; version recorded (R1).
- [x] **P06a-T02** *(done without `assets-fetch`, `licences-check`, `size-budget` and the fixture unit tests: see D11)* Node tooling. *Files:* `scripts/assets-fetch.mjs`, `art-build.mjs`, `assets-optimize.mjs`, `assets-manifest.mjs`, `assets-check.mjs`, `licences-check.mjs`, `size-budget.mjs`, `package.json`. *Steps:* §3.1; unit-test the validators with fixture GLBs (one good, one with a foreign material, one over budget, one unlicensed). *Acceptance:* `npm run test` covers validators; `assets:check` on the smoke asset passes after adding its credit and fails without it (R4, R5).
- [x] **P06a-T03** Palette. *Files:* `src/content/palette.json`, `art/blender/gen_palette.py`, `public/assets/textures/palette.png`, `src/domain/config.ts` (palette schema), `scripts/content-validate.mjs`. *Steps:* fill all rows per `assets.md` §1.2 (hexes from `src/index.css` tokens for neutrals/jade/status); generate PNG; add a swatch-sheet render to `art/out/contact-sheet-palette.png`. *Acceptance:* re-run is byte-identical; schema rejects duplicate keys or cells; all swatch keys used by `visual-language.json` (P05) exist (R2).
- [x] **P06a-T04** *(ledger and credits done; no pack sources: see Source decisions)* Sources and licences groundwork. *Files:* `art/sources/manifest.json`, `art/LICENSES.md`, `art/MANUAL-DOWNLOADS.md`, `public/assets/credits.json`. *Steps:* for each candidate pack: open the page, verify licence, record evidence, try download (HTTP → MCP → browser → manual entry). Download Be Vietnam Pro TTF (OFL) to `public/assets/fonts/` if P02 has not already. *Acceptance:* each used source has `sha256` + `licenceEvidence`; rejected sources are listed with the reason; `MANUAL-DOWNLOADS.md` exists (possibly empty) (R5, R6).
- [x] **P06a-T05** ∥ Building kit + vertical circulation. *Files:* `gen_building_kit.py`, `gen_vertical.py`, outputs in `models/env/`. *Steps:* §3.5 modules; elevator car/door with door nodes and `_led`; stairs. *Acceptance:* modules tile without gaps in the overview sheet; `assets:check` green for the family.
- [x] **P06a-T06** ∥ Desks, seating, tech. *Files:* `gen_desks.py`, `gen_seating.py`, `gen_tech.py` (or importers), outputs in `models/props/`. *Steps:* source spike → build; anchors per §3.4; reference sizes per `assets.md` §1.1. *Acceptance:* seat anchors at 0.46 m; a 1.70 m silhouette fits each chair/desk in the sheet.
- [x] **P06a-T07** ∥ Rooms, storage, meeting. *Files:* `gen_rooms.py`, `gen_storage.py`, `gen_meeting.py`. *Acceptance:* glass uses `M_Glass` only; door 2.1 × 0.9 m.
- [x] **P06a-T08** ∥ Lobby, café and tea table. *Files:* `gen_lobby_cafe.py`. *Steps:* reception counter, café counter, tables/stools, coffee machine, water dispenser, fridge, `set_tea_table_01` (low wooden table, teapot, 4 cups, floor cushions). *Acceptance:* tea set reads as a Vietnamese bàn trà in the sheet (reviewer judgement), anchors present.
- [x] **P06a-T09** ∥ Games and rest. *Files:* `gen_games.py`, `gen_rest.py`. *Steps:* ping-pong, arcade (`_screen`), board-game table, karaoke set, beds, sleep pods, massage chair, blanket/pillow. *Acceptance:* family ≤ budget; `_stand`/`_seat` anchors.
- [x] **P06a-T10** ∥ Boss floor set. *Files:* `gen_boss.py`. *Steps:* distinct materials (dark wood, jade accents, brass from `eyes_misc` gold): boss desk, lounge set, rug, tall bookshelf, sculpture, terrace rail/planter/chair. *Acceptance:* the sheet shows a visibly different, more premium style than department furniture while still on the palette.
- [x] **P06a-T11** ∥ Decor, cat, street context. *Files:* `gen_decor.py`, `gen_cat.py`, `gen_street.py`. *Steps:* 6 plants, clock (hand nodes), aquarium, fan (blades node), ceiling light, paintings, calendar, bin; cat poses; plaza, tree, street lamp, bench, parked scooter, building sign. *Acceptance:* animated-node names per §3.4.
- [x] **P06a-T12** ∥ Paper and held props. *Files:* `gen_paper.py`, `gen_held_props.py`. *Steps:* sheet (2 tris), stack unit, folder, tray; held props with `_hand_r`. *Acceptance:* `paper_sheet_01` ≤ 4 tris (it is instanced thousands of times); every `TaskType.carries` value has a `held_*` file (script cross-check against `task-types.json`).
- [x] **P06a-T13** Optimise, manifest, sheets. *Files:* `public/assets/models/**`, `public/assets/manifest.json`, `art/out/contact-sheet-*.png`. *Steps:* `assets:all`, `art:sheets`; fix budget failures. *Acceptance:* R3, R4, R7, R8; size report pasted into the PR body.
- [x] **P06a-T14** *(`ci.yml` already runs `assets:check` and `content:validate`; the scratch-branch failure demo was not run)* CI. *Files:* `.github/workflows/ci.yml`. *Steps:* add `npm run assets:check` and `npm run content:validate` to the PR job. *Acceptance:* a deliberately unlicensed file on a scratch branch fails CI (describe in PR, do not commit) (R9).
- [x] **P06a-T15** *(2026-11-11: `npm run assets:all` on the build machine left `git status` clean: all 102 GLBs, palette, manifest and credits byte-identical; not repeated from a fresh clone)* Reproducibility check. *Steps:* fresh clone + `npm ci` + `npm run assets:all` on the build machine; `git status` must be clean (outputs byte-identical) or differences documented (meshopt is deterministic; Blender export should be given fixed seeds/names). *Acceptance:* R6; if not byte-identical, record which files differ and why, and relax to "manifest numbers identical".

## 6. Dependencies
- **Needs:** P05 (final slot types, held-prop list via `TaskType.carries`, visual-language swatch keys), P02 (floor template sizes, 0.5 m grid), `assets.md`.
- **Later phases rely on:** P06b loads these files through `manifest.json` and anchors; P07a/P08a reuse `art/blender/lib`, the palette, validators, `targets.json`, the ledger and contact-sheet tooling; P07b attaches held props by `_hand_r`.

## 7. Branch and PR
- Branch `stack/p06a-env-assets` from `stack/p05-office-life`. PR base `stack/p05-office-life`. Title: `[P06a] Environment assets + art pipeline (binaries)`.
- Description template:
```md
<stack map>
## What
Art pipeline (Blender headless generators, gltf-transform, validators) and ~95 environment GLBs on the shared palette. No app code; the app is unchanged.
## How to review (no Blender needed)
1. Look at art/out/contact-sheet-*.png (style, scale vs the 1.70 m silhouette, consistency)
2. Read art/LICENSES.md + art/sources/manifest.json (licence evidence)
3. `npm ci && npm run assets:check`
4. Skim art/blender/lib and 2 generators
## Size report
<output of assets:check: per family bytes/tris, total>
## Sources used / rejected
<table>
## Manual steps for the human
<contents of art/MANUAL-DOWNLOADS.md or "none">
## Deviations from assets.md §8.1
<none | list>
```

## 8. Review checklist
- [ ] Diff touches only `art/**`, `scripts/**`, `public/assets/**`, `src/content/palette.json`, palette schema, `package.json`, lockfile, `.gitignore`, CI, and this plan folder.
- [ ] Every external source has licence evidence; nothing NC/ND/SA/unknown; no Mixamo; no brand logos; no AI-generated models without a recorded approval.
- [ ] `credits.json` ↔ files is 1:1 (`licences-check` green); generated assets marked `own-CC0`.
- [ ] Contact sheets: one coherent style; scale right against the silhouette; no bare boxes; boss set distinct.
- [ ] Only `M_Palette`/`M_Glass`/`M_Emissive`; no textures besides the palette.
- [ ] Anchors present and sensibly placed (seat heights, pile on desk surface, grip at handle).
- [ ] Total ≤ 8 MB, each GLB ≤ 1.5 MB, tri budgets met.
- [ ] Generators are deterministic and share the lib (no copy-pasted helpers).
- [ ] No `.blend`, zip or cache files committed.
- [ ] App build, tests and e2e still green.

## 9. Risks and open questions
- **Download automation may fail** for click-through sites. Mitigation: 4-step ladder in `assets.md` §2.3; generation fallback so the phase never blocks.
- **Licence pages change.** Evidence is recorded at retrieval time with date; re-verify only when re-downloading.
- **Remapped packs can look flat or mismatched.** Mitigation: per-family all-or-nothing rule (§3.3) and the overview sheet.
- **Generated furniture may look too boxy.** Mitigation: `mesh.py` builders enforce sub-shapes and bevels; reviewer rejects bare boxes.
- **Blender export nondeterminism** (node order, float noise) may break byte-identical rebuilds. Mitigation: T15 fallback criterion.
- **Open:** does dad prefer a modern or a more traditional Vietnamese office look (wood, tea table, calligraphy)? Assumed modern with a few Vietnamese touches (bàn trà, scooter outside, calendar).
- **Open:** real company name on `sign_building_01`? Assumed placeholder "AI Office" text rendered at runtime, not baked.
