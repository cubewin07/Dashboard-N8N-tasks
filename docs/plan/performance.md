# Performance plan

The scene is many small things: ~10 floors, hundreds of furniture pieces, up to 80 animated people, labels and icons. The plan is to keep draw calls and per-frame JavaScript low by construction, measure from P04 on, and record numbers in every PR.

## 1. Targets

| Device | Target |
|---|---|
| **Mac Studio (M-series), 1440p–4K, Chrome/Safari** (main device) | 60 fps steady with 80 people, 10 floors, in every camera mode; no frame > 33 ms during normal play |
| MacBook (M-series, integrated display) | ≥ 40 fps, adaptive DPR allowed |
| Phone | **No office 3D by default** (2D fallback). Only the wardrobe preview (one character): ≥ 30 fps, first frame ≤ 2 s after GLBs cached |
| Any | Time to first 3D frame of `#/office` ≤ 3 s on a warm cache, ≤ 6 s cold on 50 Mbit; main 2D shell interactive ≤ 1.5 s |

Reference scene for all measurements: seed org + 10 temps + simulator scenario **"đông người"** (pads to 80 people, P03 scenario list), speed 30×, seed `perf-1`, camera presets `overview`, `floor:cs`, `follow:emp_linh`.

## 2. Budgets

| Budget | Overview | Floor focus |
|---|---|---|
| Draw calls (`renderer.info.render.calls`) | ≤ 600 | ≤ 350 |
| Triangles | ≤ 1.5 M | ≤ 900 k |
| JS per frame (scripting, `useFrame` total) | ≤ 6 ms | ≤ 6 ms |
| React commits per second while idle-watching | ≤ 5 (overlays only; none from the canvas tree) | same |
| GPU memory (textures + geometry, `renderer.info.memory` estimate) | ≤ 300 MB | – |
| JS heap after 10 min | ≤ 350 MB, no upward trend (> 5 %/min = leak) | – |

Budget split for draw calls (overview): building shells ≤ 40 · instanced furniture/decor ≤ 120 · people ≤ 80 (+ ≤ 40 props/unmerged accessories) · elevators/doors ≤ 20 · status sprites/piles (instanced) ≤ 20 · text ≤ 60 · shadows pass ≤ 200 (shadow casters limited, see §3.6) · misc ≤ 20.

Bundle and assets:

| Item | Budget (gzip) |
|---|---|
| Main bundle (shell, login, 2D screens' shared code) | ≤ 250 KB, **never contains three, r3f, drei or troika** (CI check: grep the chunk manifest) |
| Office chunk (three + r3f + drei subset + scene code) | ≤ 450 KB |
| Character/wardrobe shared chunk | ≤ 80 KB (code only) |
| Simulator chunk (lazy, only with `VITE_FEED=sim`) | ≤ 60 KB incl. Vietnamese content |
| Each 2D route chunk | ≤ 60 KB |
| Assets needed for first office frame (palette, building kit, core furniture, capsule/character base, animation library, font) | ≤ 8 MB transferred |
| All `public/assets` | ≤ 30 MB on disk; single file ≤ 1.5 MB (`assets.md` §6) |
| Catalogue thumbnails | ≤ 15 KB each, lazy |

## 3. Techniques (by construction, not afterthought)

1. **Instancing for everything repeated.** One `InstancedMesh` per furniture/decor model for the whole building (desks, chairs, monitors, plants, papers), matrices written once at layout time; per-instance colour via `instanceColor` for department accents. Paper piles: instanced sheets, count = pile height (cap 12 visible + SDF number).
2. **Merged floor shells.** Each floor's walls/floor/ceiling-edge merge into one geometry per floor (per material); the whole building frame merges into one. Cutaway is geometric (no front wall), not transparency.
3. **One draw call per person** (P07b): merged skinned mesh, shared material, baked morphs, vertex-colour tints.
4. **Animation LOD:** mixer rates 30/15/5/0 Hz by focus and distance, staggered (P07b §3.6). Director logic ticks at 10 Hz, never per frame; per-frame work is only interpolation along the current action.
5. **Floor culling and fade:** in floor-focus mode other floors render shell-only (people and small props hidden) or are hidden above the focused floor; in overview, people on floors outside the frustum are skipped. Layer visibility is toggled imperatively, not by React re-render.
6. **Lights and shadows:** one directional light with one 2048² shadow map fitted to the building; shadow casters = people + large furniture only; everything else gets contact darkness from baked vertex AO in the assets (static "baked look"). One hemisphere/environment light. No point lights per desk: desk status uses emissive instanced sprites. Shadows auto-update only when something moved in the shadow frustum (throttled to 30 Hz).
7. **No per-frame React state.** `useFrame` reads refs and transient zustand subscriptions (`store.subscribe`), never `setState`. The canvas tree re-renders only on layout change (floors/desks added) or people set change.
8. **Text and labels:** troika SDF text with the bundled Be Vietnam Pro subset (Vietnamese glyph set preloaded in one atlas); label LOD: names only for selected/followed/hovered people and on the focused floor within 20 m; floor signs always. Pile counts and status icons come from an **instanced sprite atlas**, not text. No `drei <Html>` per character (allowed: one tooltip for the hovered person).
9. **Adaptive resolution:** drei `PerformanceMonitor` lowers DPR in steps (2 → 1.5 → 1.25 → 1) on sustained < 50 fps and raises it back; antialias via MSAA at DPR ≤ 1.5. No post-processing passes by default (optional outline for the selected person only, single mesh mask).
10. **Render on demand when nothing moves:** `frameloop` switches to `demand` when the tab is hidden, the simulator is paused and the camera is still for 2 s; wakes on input or feed event. The wardrobe preview is always `demand` except during drag/clip play.
11. **Textures:** the palette (256², nearest) and the face atlas (512²) are the only colour textures for models; icon atlas 512²; no mipmapped photo textures. All sRGB handled once in the shared material.
12. **Geometry compression:** meshopt via `gltf-transform` (`assets:optimize`), quantised attributes, no Draco (decoder weight and worker startup not worth it at these sizes).
13. **Code splitting and preload order:** route-level `lazy` chunks; the office chunk and first-frame assets start loading (`<link rel="modulepreload">` + `useGLTF.preload`) as soon as a boss session exists and the device gate says "3D"; order: palette → building kit → core furniture → people base + animation library → decor → leisure props → wardrobe items in use. The scene shows as soon as shells are ready; furniture and people pop in by floor.
14. **Memory hygiene:** every assembled character, preview and removed floor disposes geometries/materials; caches are keyed and bounded (appearance cache ≤ 150 entries LRU); event log ring buffer of 500.
15. **Picking:** raycast only against per-person proxy capsules and floor slabs (not skinned meshes), throttled to pointer-move at 30 Hz.
16. **Elevator and path updates:** pathfinding results cached per (floor, from-cell, to-cell); A* runs outside `useFrame` in the director tick with a per-tick node budget.

## 4. How to measure

- **Debug surface:** `window.__office_debug` (dev and `?debug=1`): `{ fps, frameMsP95, drawCalls, triangles, geometries, textures, people, mixersPerSec, characters: { assembled, cacheSize }, reactCommits }` and `setCamera(preset)`, `setScenario(key)`. Read-only numbers come from `renderer.info` and a rolling frame timer.
- **Automated check (from P04):** `npm run perf:check` → `scripts/perf-check.mjs` runs Playwright (headed Chrome on the developer Mac with GPU; not in CI) through the reference scene and camera presets, 20 s each, and writes `perf-report.json` + a markdown table to paste into the PR. It fails when a budget in §2 is exceeded by > 10 %.
- **CI (headless, SwiftShader):** frame rate is meaningless there. CI checks only the **structural** numbers, which are deterministic: draw calls, triangles, geometries, React commits, bundle sizes (`scripts/size-budget.mjs` prints a job summary and fails on budget), "main chunk has no three".
- **Dev tools:** `r3f-perf` panel in dev (`?perf=1`), Chrome Performance traces for JS frame cost, Spector.js for draw-call inspection when a number jumps.
- **Leak check:** `perf:check --soak` runs 10 minutes at 60× and compares heap and `renderer.info.memory` start vs end.

## 5. Numbers to record in each PR body

| Layer | people | draw calls (ov / floor) | triangles (ov) | fps ov / floor / follow (Mac Studio) | JS ms p95 | main / office chunk KB gz | first-frame assets MB | assets total MB |
|---|---|---|---|---|---|---|---|---|
| P02 building | 0 | | | | | | | |
| P04 people (capsules) | 80 | | | | | | | |
| P05 office life | 80 | | | | | | | |
| P06b env art | 80 | | | | | | | |
| P07b characters | 80 | | | | | | | |
| P08b wardrobe | 80 (+ preview) | | | | | | | |
| P11 polish (final) | 80 | | | | | | | |

The author fills the row for their layer and copies the table (with earlier rows) into the PR body so the trend is visible in the stack review (`stacked-prs.md` §6).

## 6. Regression policy

- A PR that worsens any §2 budget number by **> 10 %** versus the layer below must either fix it or justify it in the PR body with the reviewer's explicit sign-off.
- A PR that **exceeds** a budget cannot merge without applying fallbacks (§7) or amending this file (with the boss's OK when it lowers visual quality).
- Bundle budgets are hard CI failures. Structural scene numbers are hard CI failures from P05 on.

## 7. If budgets fail: ordered fallbacks

| # | Fallback | Cost |
|---|---|---|
| F1 | Lower shadow map to 1024² and limit casters to people on the focused floor | Slightly softer look |
| F2 | Lower DPR cap to 1.5 on 4K displays | Less crisp |
| F3 | Tighter animation LOD (15/8/2 Hz) and freeze people on non-focused floors in overview | Stiffer distant motion |
| F4 | Far LOD: people beyond 60 m drawn as instanced billboards/capsules with department colour | Less detail in overview |
| F5 | Hide small decor (`decor`-tagged instances) in overview | Emptier overview |
| F6 | Merge whole-floor static furniture into one geometry per floor (lose per-instance culling, save calls) | Rebuild on layout change |
| F7 | Cap simultaneous walkers (queue idle wander starts) | Calmer scene |
| F8 | GPU-instanced skinning with bone textures for all people (large rewrite of `scene/characters`) | Only if > 200 people are needed |

## 8. Phone and low-power handling

- Device gate (P01): phones and no-WebGL devices get the 2D fallback and never download the office chunk. A manual "Xem 3D" switch exists in Settings with a warning; it starts at DPR 1, shadows off, F3 + F5 on.
- `prefers-reduced-motion`: camera transitions cut instead of fly; idle wander density halved; no celebratory one-shots.
- Battery/thermal: on `visibilitychange` hidden → rendering stops and the simulator pauses its clock (events do not pile up).
