# P04: People and navigation

## 1. Goal and demo
Put people in the building and make them move for real reasons. Characters are **placeholders** (capsule + head) in this phase; the logic that moves them is final.

**Demo after merge:** on `#/office` every employee is visible on their floor.
- Working people sit at their own desk with a status dot above the head.
- Idle people wander on their floor, or take the **stairs** to the lobby café or the games-and-rest floor.
- A worker who needs a review, an answer or help **walks to the elevator, rides, delivers and returns**. The two elevator cars queue passengers.
- New temps arrive through the lobby; archived temps leave through it.
- The people list (search, grouped by department) is keyboard reachable; clicking a name makes the camera **follow** that person across floors. Clicking a person in 3D opens a details drawer.

## 2. Requirements
- **R1** `src/scene/nav/**` and `src/scene/director/**` are pure TS (no three, no React, no adapters, no `Date.now`/`Math.random`); they import only `src/domain` and `src/scene/layout`.
- **R2** Every active employee in `OfficeState` has exactly one visible person (or is in transit inside an elevator/stairwell); archived employees have none after leaving.
- **R3** `deriveIntent` covers every `PersonRuntime.activity` value (exhaustive, compile-time checked) and the intents table in §3.3.
- **R4** **Only `idle` and `resting` people receive wander or leisure intents.** Work intents never wander.
- **R5** **Elevators are used only by work intents; leisure trips between floors use the stairs.** A unit test enumerates all intent kinds and asserts the vertical mode.
- **R6** Paths never cross blocked cells (walls, furniture footprints); A* returns the shortest grid path, smoothed, or `null` when unreachable (then the planner falls back to a fade-teleport and logs a warning).
- **R7** Elevator scheduler: 2 cars, capacity and door timing from `building.json`, FIFO per floor and direction, deterministic for the same call sequence.
- **R8** Director logic ticks at 10 Hz independent of frame rate; rendering interpolates. Pausing the sim pauses people.
- **R9** People never teleport while their floor is visible, except the R6 fallback. Catch-up rules (§3.6) keep visuals within 20 sim-min of the state.
- **R10** Sim speed scales movement; at 120× trips stay readable (speed cap, §3.6).
- **R11** People list: search by name, group by department, status dot, current task; fully keyboard operable; Enter = follow.
- **R12** Follow camera tracks a person through elevator and stairs trips and fades floors automatically; Esc or dragging the camera leaves follow mode.
- **R13** Clicking a person selects them and opens the details drawer (name, role, department, activity, task, pile/queue counts, "Theo dõi" button).
- **R14** The renderer depends only on the `PersonVisual` interface, so P07b can replace capsules without touching nav/director.
- **R15** Performance: 60 people, 9 floors, 30×: ≥ 55 fps average on the Mac Studio, ≤ 250 draw calls, logic tick ≤ 2 ms average (`npm run perf:check` records and asserts in CI with relaxed thresholds for SwiftShader).

## 3. Specs

### 3.1 Module map
```
src/scene/nav/
  grid.ts         buildGrid(floorLayout) → NavGrid {w,h,cell:0.5,blocked:Uint8Array, toCell(), toWorld()}
  astar.ts        findPath(grid, from, to) → Vec2[] | null   (8-neighbour, no corner cutting, octile heuristic)
  smooth.ts       string-pull by line-of-sight on the grid
  routeGraph.ts   buildRouteGraph(buildingLayout) → nodes: floor elevator doors, stairs entries; route(from, to, mode)
  elevator.ts     ElevatorSystem: call(), board(), step(dt) → car states (pure state machine)
  stairs.ts       stairsTime(fromFloor, toFloor) = 6 s + 4 s × |Δfloors| (sim-scaled), entry/exit points
src/scene/director/
  intents.ts      Intent union + deriveIntent(person, state, layout, memory)
  planner.ts      plan(intent, personPose, layout, nav) → ActionPlan
  idleBrain.ts    chooseIdleIntent(person, state, layout, rng, simNow)   (seeded per person)
  slots.ts        SlotLedger: reserve/release desks, waiting seats, idle spots (no two people in one slot)
  director.ts     Director: tick(dtSim) → updates PersonSim[]; owns ElevatorSystem, SlotLedger
  types.ts        PersonSim { id, floorIndex, pos, heading, pose, plan, stepIndex, carrying, visible }
src/scene/render/
  People.tsx      reads director output per frame, drives PersonVisual instances
  PersonVisual.ts interface (§3.7)
  CapsulePeople.tsx   placeholder implementation (instanced)
  ElevatorCars.tsx    car meshes + doors from ElevatorSystem state
  StatusDots.tsx      instanced billboards
src/scene/camera/followMode.ts
src/features/office/{PeopleList,PersonDrawer}.tsx
```
The Director instance lives in a ref inside `OfficeCanvas`; it subscribes to the office store transiently (no React re-render) and is ticked from one `useFrame` with an accumulator.

### 3.2 Navigation
- **Grid:** cell 0.5 m. Blocked = walls + furniture footprints (from layout slots' footprint boxes, inflated by 0.2 m). Desk chairs, waiting seats, sofas and beds have an **approach cell** (free cell in front) stored on the slot; paths end at the approach cell, then a 0.4 s "sit" lerp moves the person onto the seat.
- **Path cache:** key `(floorKey, fromCell, toCell)`, LRU 500; cleared when the layout version changes (`config.changed`).
- **Route across floors:** `route(from, to, mode)` returns segments: `walk(floor A → door)`, `vertical(mode, A → B)`, `walk(door → target)`. `mode ∈ 'elevator' | 'stairs'`, chosen by intent kind (R5), never by distance.
- **Elevator:** cars start at lobby and the middle floor. `call(floor, dir, personId)` assigns the car with the lowest estimated arrival (deterministic tie → lower car index). Car state machine: `idle → moving → doors_opening (0.5×doorSeconds) → loading → doors_closing → moving`. Capacity 6; overflow waits for the next car. People wait on **queue cells** in front of the door (a line of up to 6 cells, then a second row). Riding people are hidden inside the car body except heads visible through the open front (cutaway), so the camera can follow.
- **Stairs:** person walks to `stairs_entry`, fades out over 0.3 s, is "in stairwell" for `stairsTime`, fades in at the target floor's entry. Intermediate floors render nothing.

### 3.3 Intents (the table that is the heart of this phase)
| Activity / condition (from `OfficeState`) | Intent | Vertical mode | Ends when |
|---|---|---|---|
| `working`, at own desk | `WorkAtDesk{deskSlot, carrying}` | – | activity changes |
| `working`, not at desk | `GoToDesk` then `WorkAtDesk` | elevator | arrives |
| `reviewing` | `ReviewAtDesk{deskSlot, reviewId}` | – | `review.decided` |
| `delivering` + pending `review.requested` by this person | `DeliverDocument{toEmployeeId, pileAnchor, reviewId}` then `ReturnToDesk` | elevator | paper dropped, back at desk |
| `delivering` + `task.assigned`/`task.handed_off` by this person | `DeliverDocument{toEmployeeId, deskSlot, taskId}` then `ReturnToDesk` | elevator | same |
| `asking` (question not inPerson) | `GoAsk{toEmployeeId}`: walk to target, 3 s chat, return | elevator | `question.answered` + returned |
| `waiting_answer` (inPerson) | `WaitInSeat{nearEmployeeId, seatSlot}` | elevator | `question.answered`, then `ReturnToDesk` |
| `waiting_answer` after `help.requested` by this person | `HelpAt{helperId}`: go to helper's desk, stand beside | elevator | `help.answered`/`escalated` |
| `helping` | `WorkAtDesk` (helper stays; emote "talk") | – | `help.answered` |
| `in_meeting` | `MeetAt{meetingTableSlot}` | elevator | activity changes |
| `staff.hired` not yet arrived | `Arrive{fromLobbyDoor, deskSlot}` | elevator | at desk |
| `staff.archived` | `Leave{toLobbyDoor}` then despawn | elevator | at lobby door |
| `idle` | `chooseIdleIntent` → `IdleWander{spot}` / `IdleAtDesk` / `RestOnLeisureFloor{spot}` | stairs | new activity (interrupt) or dwell over |
| `resting` (lunch, night) | `RestOnLeisureFloor{bed/sofa}` or `NapAtDesk` | stairs | activity changes |
| `off_shift` | `RestOnLeisureFloor{bed}` (they never go home) | stairs | activity changes |
| blocked task (`task.blocked`, person still `working`) | `WorkAtDesk` with `pose: 'stuck'` | – | unblocked |
Owners (`humanOwner`): always `WorkAtDesk` at the boss desk (`boss_desk` slot); no wandering in P04 (P05 may add idle poses).

`deriveIntent` is a pure function of `(person, state, layout, memory)` where `memory` is the person's last intent and whether its delivery was completed (so a finished delivery is not repeated). "Pending" deliveries are found by scanning `state.log` since the person's last completed intent for events with this actor (indexed by the director as events arrive, not per tick).

**Idle brain (P04 minimal; P05 adds activities):** every dwell end, pick with seeded weights: stay at desk 35%, wander to an `idle_*` slot on the own floor 40%, leisure floor trip via stairs 25% (lobby café or games-rest, whichever has free slots; at most 30% of a department away at once). Dwell 20–90 sim-min. Any work activity interrupts immediately: the person stands, and the new intent plans from the current position (from a leisure floor the trip back to the desk uses the **elevator**, because it is now a work trip).

### 3.4 Action plans
```ts
type Action =
  | { k: 'walk'; floor: number; path: Vec2[] }
  | { k: 'callElevator'; floor: number; to: number } | { k: 'ride'; to: number } | { k: 'exitElevator' }
  | { k: 'stairs'; from: number; to: number }
  | { k: 'sit'; slotId: string } | { k: 'stand' }
  | { k: 'pick'; item: Carry } | { k: 'drop'; item: Carry; at: string /*pile anchor or desk*/ }
  | { k: 'wait'; seconds: number } | { k: 'emote'; kind: 'talk' | 'think' | 'wave' | 'stuck' }
  | { k: 'despawn' }
```
Example `DeliverDocument` across floors: `stand → pick(document) → walk(to door) → callElevator → ride → exitElevator → walk(to pile approach) → drop(document) → wait(1) → walk → callElevator → ride → exitElevator → walk(desk approach) → sit`.
The planner reserves destination slots in the `SlotLedger` (waiting seats, idle spots); if none is free, `WaitInSeat` degrades to standing in a queue line by the office door, and idle intents pick another spot.

### 3.5 Tick, interpolation, speeds
- Accumulator: `acc += frameDt × simSpeedFactor`; while `acc ≥ 0.1 s` → `director.tick(0.1)`. Max 5 ticks per frame (then drop the remainder, people slow down rather than freeze the tab).
- Each `PersonSim` stores `prevPos/pos`; render lerps with `alpha = acc / 0.1`.
- **Movement speed:** base walk 1.4 m/s in *visual seconds*. `visual seconds = real seconds × moveFactor(speed)` where `moveFactor(1×)=1`, `(30×)=1.6`, `(120×)=3`. So movement does **not** scale 30× (it would be a blur); instead trips take real seconds and the sim clock runs ahead. Typical cross-floor delivery ≈ 12–20 real s at 30× (= 6–10 sim-min, plausible).
- Pause: accumulator stops; walk-bob freezes.

### 3.6 Catch-up rules (state moves faster than legs)
1. Each plan has a **deadline** = the sim time of the event that will make it stale, when known (e.g. `review.started` cannot visually start before the paper is dropped). The director, not the feed, resolves this: visual consequences queue per person in event order.
2. If a person has ≥ 2 queued intents, current plan runs at **×3 fast-forward** (walk speed ×3, waits skipped).
3. If the backlog is ≥ 4 intents or older than 20 sim-min: when the person's floor **and** destination floor are not visible (not in focus/frustum, or camera in overview beyond LOD distance) → snap to the final state of the oldest intents; when visible → fast-forward ×6 and collapse round trips (deliver A and B in one trip).
4. A pile count or desk status is always driven by `OfficeState` directly (P05), never delayed by walking, so numbers are always true even if a courier is late. The paper in the courier's hand is decoration.
5. An interrupted idle intent is dropped, never queued.

### 3.7 `PersonVisual` interface (stable seam for P07b)
```ts
interface PersonVisualInput {
  id: string; pos: Vec3; heading: number
  pose: 'stand' | 'walk' | 'sit' | 'sit_work' | 'carry_walk' | 'wait_stand' | 'sleep' | 'talk' | 'stuck'
  speed01: number; carrying: Carry | null
  tintSwatch: string            // department colour
  selected: boolean; followed: boolean; opacity: number; lod: 0 | 1 | 2
}
interface PersonVisualSystem {            // one implementation active at a time
  sync(inputs: readonly PersonVisualInput[], dt: number): void
  pick(ray: Ray): string | null           // person id under the pointer
  dispose(): void
}
```
`CapsulePeople`: two `InstancedMesh` (capsule body 0.34 m radius × 1.1 m, sphere head 0.16 m) + one instanced accent ring; poses by transform only (walk = vertical bob 4 cm + 6° sway, sit = lower 0.45 m, sleep = rotate 90°, carry = small box instance in front). Picking = ray vs capsule bounds in JS (no per-instance raycast meshes). Total draw calls for people: 4.

### 3.8 UI
- **People list** (left panel on desktop `#/office`, a tab on phone `#/org`): search input (diacritic-insensitive), groups by department with counts, row = status dot + name + role + current task (truncated) + follow button. Roving tabindex, ↑/↓ move, Enter follow, Esc clear. `aria-live="polite"` announces "Đang theo dõi {name}".
- **Person drawer:** opens on selection (3D click or list). Content per R13; links to `#/queue` filtered by person for approvers.
- **Follow mode:** `CameraControls.setLookAt` damped toward person position each frame, distance preset 9 m, keeps current azimuth; when the person changes floor, focus floor switches (P02 floor fade) at `exitElevator`/stairs exit; during a ride the camera tracks the car. User orbit input keeps following but changes angle; pan/Esc exits. URL keeps `?follow=emp_id` for shareable links.
- **Status dot:** instanced billboard 0.18 m above head; colour from `activityTone` (P03 `status.ts` mirrored in `scene/render/palette.ts`); idle people get **no dot** (subtle), working = blue, waiting = amber, blocked = red.
- Hover: cursor pointer + name label (single drei `<Text>` reused).

### 3.9 Debug and perf hooks
`window.__office_debug` (dev and e2e builds only, behind `VITE_DEBUG=1`): `{ renderer: () => gl.info, director: { people(), elevators(), tickMs() }, sim: simControls, camera: { follow(id) } }`.
`scripts/perf-check.mjs` (Playwright): open `/#/office?seed=1&debug=1`, wait for 60 people (scenario `hire_temps` + seed staff), run 20 s at 30×, sample fps (rAF deltas), `renderer.info.render.calls/triangles`, `director.tickMs`; assert against `performance.md` §2 (CI thresholds for software GL: fps ≥ 10, calls ≤ 250, tick ≤ 4 ms; real thresholds checked on the Mac with `npm run perf:check -- --real`). Writes `perf-report.json` attached to the PR.

## 4. Design choices
| Topic | Options | Choice | Reason | Revisit if |
|---|---|---|---|---|
| Pathfinding | recast navmesh (wasm) · three-pathfinding · custom grid A* | **Custom grid A\*** | Floors are flat generated rectangles; pure, deterministic, testable, ~200 lines | Floors get irregular shapes or > 150 people path at once |
| Who decides movement | feed sends positions · director derives from state | **Director derives** | Real workers will never send positions; keeps the feed contract business-only | – |
| Vertical movement meaning | anyone uses anything · elevator = work, stairs = leisure | **Elevator = work, stairs = leisure** | Satisfies "elevator movement always means something real" while still letting idle people reach leisure floors | Boss finds stairs odd → leisure trips also by elevator but with a visible "break" icon |
| Sim speed vs walking | scale walking by sim speed · near-real walking with fast-forward rules | **Near-real walking + catch-up** | 30× walking is unreadable; truth stays in state-driven numbers | Backlogs common at 30× → raise moveFactor or shorten trips |
| Placeholder look | instanced capsules · early CC0 character | **Instanced capsules behind `PersonVisual`** | Logic can be finished and tuned before the character pipeline (P07) exists; 4 draw calls | – |
| Crowd avoidance | none · full RVO · light separation | **Light separation** (push apart within 0.5 m, sideways step when head-on) | Cheap, good enough for corridors; no deadlocks because paths are re-planned after 2 s stuck | Visible clumping at doors |
| Logic rate | per frame · fixed 10 Hz | **Fixed 10 Hz + interpolation** | Frame-rate independent, cheap, deterministic tests | – |
| Elevator model | teleport with delay · simulated cars with queues | **Simulated cars** | Queueing at the elevator is part of the "living office" look | Waits make deliveries too slow → add a third car via `building.json` |
| Picking | three raycast per mesh · JS ray vs capsule | **JS ray vs capsule** | Works with instancing and later merged characters | – |
| Night | people go home · stay and rest | **Stay and rest** | AI employees do not go home; gives the sleep floor a purpose | Boss wants an empty building at night |

## 5. Tasks
- [ ] **P04-T01 ∥** Nav grid. *Files:* `src/scene/nav/grid.ts`, test, `src/scene/layout/floorLayout.ts` (add `footprint` + `approach` to slots if P02 lacks them). *Acceptance:* tests on the department template: desk footprints blocked, approach cells free, every desk/seat/idle slot approach is reachable from the elevator door (flood fill); grid build < 5 ms per floor.
- [ ] **P04-T02 ∥** A* and smoothing. *Files:* `src/scene/nav/{astar,smooth}.ts`, tests. *Acceptance:* shortest path on hand-made grids; no diagonal through blocked corners; unreachable → `null`; smoothed path has no segment crossing a blocked cell (sampled); 1 000 random paths on a 48×28 grid < 150 ms.
- [ ] **P04-T03 ∥** Route graph and stairs. *Files:* `src/scene/nav/{routeGraph,stairs}.ts`, tests. *Acceptance:* `route(deskOnFloor2, pileOnFloor6, 'elevator')` returns walk/vertical/walk with correct door slots; same-floor route has no vertical segment; annex floors included; `stairsTime` formula.
- [ ] **P04-T04 ∥** Elevator system. *Files:* `src/scene/nav/elevator.ts`, tests. *Acceptance:* tests: single call served; two cars split opposite calls; capacity overflow waits for next car; FIFO per floor/direction; same call sequence → identical state trace; no car skips a boarded passenger's stop; 10 000 steps without stuck passengers (property test with seeded calls).
- [ ] **P04-T05** Intent types and `deriveIntent`. *Files:* `src/scene/director/{intents,types}.ts`, test. *Steps:* implement §3.3 exactly; exhaustive switch on activity; vertical mode constant per intent kind. *Acceptance:* table-driven test with one case per row of §3.3; test R4 (non-idle never gets wander); test R5 (enumerate kinds → mode); owners never move.
- [ ] **P04-T06** Slot ledger and planner. *Files:* `src/scene/director/{slots,planner}.ts`, tests. *Acceptance:* plan for each intent kind matches the expected action sequence (snapshot); two people never hold the same slot; full waiting seats → queue-line fallback; unreachable target → fade-teleport plan + warning.
- [ ] **P04-T07** Director core. *Files:* `src/scene/director/{director,idleBrain}.ts`, tests. *Steps:* per-person intent queue, action execution against nav/elevator, catch-up rules §3.6, separation steering, seeded idle choices, event indexing for pending deliveries. *Acceptance:* headless test: feed the P03 golden log through reducer + director for one sim day at fixed 10 Hz → no person ends inside a blocked cell, every `review.requested` produced a completed (or collapsed) delivery, backlog never > 6, same input → same final positions; interrupt test (idle on leisure floor → task.started → elevator trip to desk).
- [ ] **P04-T08 ∥** `PersonVisual` interface and capsule implementation. *Files:* `src/scene/render/{PersonVisual.ts,CapsulePeople.tsx,StatusDots.tsx}`, `src/scene/render/palette.ts`. *Acceptance:* story/dev route `#/dev/people` shows all poses; 200 instances = 5 draw calls; `pick` unit test (ray hits nearest capsule).
- [ ] **P04-T09** Wire director into the canvas. *Files:* `src/scene/render/People.tsx`, `src/scene/OfficeCanvas.tsx`, `src/office/hooks.ts`. *Steps:* director ref, transient store subscription, accumulator in one `useFrame`, floor visibility info from P02 passed to the director (for catch-up rule 3), opacity follows floor fade. *Acceptance:* e2e: after load, `__office_debug.director.people().length` equals active employees; pausing the sim stops position changes; no React commits per frame (React Profiler check documented in PR).
- [ ] **P04-T10 ∥** Elevator cars and stairs visuals. *Files:* `src/scene/render/ElevatorCars.tsx`, `StairsFade` in `People.tsx`. *Acceptance:* cars move between floors matching `ElevatorSystem` state; doors open only when stopped; riders visible in the car; manual check recorded as a short screen capture in the PR.
- [ ] **P04-T11 ∥** People list. *Files:* `src/features/office/PeopleList.tsx`, `src/i18n/{vi,en}/office.ts`. *Acceptance:* component tests: search "bao" finds "Bảo"; keyboard navigation and Enter; axe check has no violations; at 375 px it renders as the `#/org` tab.
- [ ] **P04-T12** Selection, drawer and follow camera. *Files:* `src/scene/camera/followMode.ts`, `src/features/office/PersonDrawer.tsx`, `src/office/uiStore.ts` (selectedId, followedId), router query sync. *Acceptance:* e2e: click a list row → `?follow=` set and camera target within 2 m of the person for 10 s including a floor change (`__office_debug`); Esc exits; clicking a person in 3D opens the drawer with the right name.
- [ ] **P04-T13 ∥** Arrive/leave flows. *Files:* director + `src/scene/layout` (lobby door slot), tests. *Acceptance:* test: `staff.hired` → person spawns at lobby door, rides, sits at the allocated desk; `staff.archived` → walks out and despawns; desk slot released and reusable; layout re-allocation on `config.changed` moves nobody else's desk (stable allocation).
- [ ] **P04-T14** Speed handling and tuning pass. *Files:* director config `src/scene/director/tuning.ts` (all numbers in one place), PR notes. *Steps:* run seeds 1–5 for a sim day at 30× and 120×; tune moveFactor, dwell, weights so that: average backlog < 1.5, < 5% of deliveries collapsed at 30×. *Acceptance:* a headless stats script `scripts/director-stats.mjs` prints the table; numbers pasted in the PR.
- [ ] **P04-T15** Debug hooks and perf check. *Files:* `src/scene/debug.ts`, `scripts/perf-check.mjs`, `package.json` (`perf:check`), `ci.yml`. *Acceptance:* §3.9; CI job uploads `perf-report.json`; local `--real` run on the Mac meets R15 and the numbers are in the PR.
- [ ] **P04-T16** i18n, a11y and docs pass. *Files:* i18n files, `docs/plan/phase-04-people.md` (dated notes under §4 for any tuning decisions). *Acceptance:* DoD of `00-overview.md` §6; 3D-only facts (who is where, doing what) are also in the list/drawer.

## 6. Dependencies
- **Needs:** P02 (building/floor layout with slots, elevator door and stairs slots, floor focus/fade API, `CameraControls` rig, `OfficeCanvas`), P03 (`OfficeState`, `PersonRuntime`, events in `state.log`, selectors, `simControls`, golden log, `activityTone`).
- **Later phases rely on:** `PersonVisual` seam (P07b), intent/pose names and `Carry` (P05 held items, P07a animation clip list must cover every `pose`: stand, walk, sit, sit_work, carry_walk, wait_stand, sleep, talk, stuck), `SlotLedger` + idle brain (P05 adds activities and waiting-seat visuals), `__office_debug` + `perf:check` (every later PR reports numbers), follow mode and people list (P11 polish), stable desk allocation (P10 org edits).

## 7. Branch and PR
- Branch `stack/p04-people`, base `stack/p03-engine-sim`.
- Title: `[P04] People & navigation`.
- Size note: if over ~2 500 lines split into `p04a-nav-director` (T01–T07, T13, T14) and `p04b-people-ui` (rest).
- Description template:
```md
<stack map>
## What
Placeholder people driven by a pure director: grid A*, elevator scheduler, stairs, intents → action plans, people list, follow camera, person drawer.
## Demo
1. #/office → people at desks, idle ones wandering
2. Sim panel → "Hàng chờ duyệt dài" → watch elevator trips
3. People list → Enter on "Mai" → follow across floors
## Requirements → evidence
R1 … R15: <test or manual check>
## Numbers (perf-report.json, Mac Studio --real)
fps avg/min: … · draw calls: … · triangles: … · tick ms: … · backlog avg: … · collapsed deliveries: …%
## Screen capture
<10–20 s clip>
```

## 8. Review checklist
- [ ] `scene/nav` and `scene/director` import no three/React/adapters; no `Math.random`/`Date.now` (seeded rng passed in).
- [ ] Intent table in code matches §3.3 row by row; tests cover each row.
- [ ] Grep the planner: `callElevator` is only reachable from work intents; leisure only `stairs` (R5 test present).
- [ ] No wander for non-idle people (R4 test present).
- [ ] Renderer touches people only through `PersonVisualSystem`; no capsule-specific code in director or UI.
- [ ] One `useFrame` drives the director; no per-person React state; no `<Html>` per person.
- [ ] Watch 3 minutes at 30× and 1 minute at 120×: nobody walks through furniture, no visible teleport on a focused floor, elevator queues form and clear, nobody stuck > 10 s.
- [ ] Follow mode survives elevator and stairs trips; Esc exits; list is keyboard operable.
- [ ] All tuning numbers live in `tuning.ts`; building numbers from `building.json`.
- [ ] `perf-report.json` attached and within budget; bundle delta reported.

## 9. Risks and open questions
- **Visual lag vs truth:** at high speed, walking cannot keep up with events. Mitigated by §3.6 and by driving counts from state. If it still feels wrong, lower default speed to 20× (one constant).
- **Deadlocks in corridors/doors:** separation steering can jam at single-cell doors. Mitigation: door cells are 2 wide in templates (check with P02), re-plan after 2 s stuck, pass-through allowed after 4 s.
- **Elevator fairness:** bursts (`sale_1212`) may build long queues. Accepted as "alive"; cap queue rows and add a third car through data if needed.
- **Layout changes at runtime** (P10 adds a department) invalidate grids, paths and slots. Path cache and ledger are keyed by layout version; people on changed floors re-plan from their current position.
- **Open:** is "stairs for leisure" acceptable to the boss, or should all trips use elevators with icons? (`questions-and-assumptions.md`.)
- **Open:** should owners' avatars move (e.g. walk to the manager)? Assumed no in this phase.
