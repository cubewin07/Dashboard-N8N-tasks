# P05: Office life and visual language

## 1. Goal and demo
Make the building **readable and alive** while the art is still blockout. After P04 people move for real reasons; after P05 you can *see why*: who is working (and on which platform), who is waiting, where approvals pile up, who is carrying what to whom, and what idle people do for fun.

**Demo after merge:** open `#/office`, press the "Ngày bận rộn" scenario. Working people sit at desks with a bright ring, a held item, a glowing monitor and a progress ring; platform badges float over those handling Shopee/Zalo/Facebook tasks. Papers stack on reviewers', department managers' and the boss's desks with a number. When the Marketing manager's question queue is long, workers sit on the bench outside the office. Couriers carry papers into the elevator, and the car shows its floor. Idle people chat at the water dispenser, drink tea, play ping-pong, sing karaoke, nap at 12:00. A cat wanders. A legend ("Chú giải") explains every symbol in Vietnamese.

Everything is still primitives (boxes, capsules, sprites). Real models arrive in P06b/P07b through the same components.

## 2. Requirements
- **R1** A person with `activity ∈ {working, reviewing, helping}` at their desk shows: ground ring in the status colour, status icon billboard, held item matching `TaskType.carries` (or a paper when reviewing), monitor glow, and a progress ring driven by `task.progress`.
- **R2** Idle/resting people show **no** ring and no icon, and render at reduced saturation (factor from `visual-language.json`), so a floor with 3 workers and 10 idle people reads as "3 working" at a glance.
- **R3** A person whose `platformKey` is set shows a platform badge built from `platforms.json` `badge {text, swatch}`; adding a platform row needs no code and no new image file.
- **R4** Every employee whose role has `caps.approveLevel` (and each owner) has a paper pile at their `pile_anchor`: height grows with `pileFor(id).length` (capped visually at 30 sheets, number keeps counting), a count label, and the top sheet's edge coloured by the highest effective priority in the pile.
- **R5** A question with `inPerson: true` puts the asker on a `waiting_seat` near the target's room; seats fill in order of arrival; when seats run out, people stand in a line behind the bench. The seat frees when `question.answered`/expired.
- **R6** Document trips (`review.requested`, `review.escalated`, `task.handed_off`, `task.assigned` across desks) show the carrier holding a paper/folder; the paper leaves the hand and joins the pile on arrival (pile count increments at arrival, not at event time; the 2D queue increments at event time).
- **R7** Elevator cars move between floors with door open/close, show occupants inside, and a floor indicator above each door; waiting people queue at the `elevator_door` slot.
- **R8** Idle behaviour is chosen by `idleBrain` (seeded utility scoring) from the idle slots that exist in the layout; with the same seed, config and event log, two runs produce identical choices.
- **R9** **Only people with `activity ∈ {idle, resting, off_shift}` use idle behaviours.** Idle trips between floors use the **stairs**; the elevator is used only by work trips. A unit test asserts no idle-origin plan contains an elevator action.
- **R10** Lunch nap: between `policy.calendar.lunch` start and end, idle people nap (desk or rest floor); non-24/7 departments rest at night (`off_shift`), `24_7` departments keep their shift workers at desks.
- **R11** Decorative life exists and costs no domain state: plants, wall clock showing sim time, office cat moving between `cat_spot`s, aquarium, ceiling fans, optional day/night lighting from sim time (toggle, default on).
- **R12** Label LOD by camera distance: **far** = floor chips only (name + working/waiting/pile counts); **mid** = rings, piles with counts, badges; **near** = names and task titles. At most `maxEmotes` (default 12) emotes visible at once, nearest-to-camera first.
- **R13** A legend overlay lists every symbol with Vietnamese text; it is keyboard reachable and dismissible; the selection drawer (2D) shows the same facts for the selected person (status, task, platform, carrying, pile count, waiting position).
- **R14** "Giảm chuyển động" (reduced motion) setting, defaulting from `prefers-reduced-motion`: no bobbing, no emote pop, no day/night transitions, idle animations replaced by static poses; movement along paths remains.
- **R15** With 60 people on 8 floors the scene stays within `performance.md` §2 budgets (draw calls, frame time) on the reference machine; all new per-person visuals are instanced or batched.
- **R16** All thresholds, colours, sizes and behaviour weights live in `src/content/visual-language.json` and `src/content/idle-behaviours.json`, validated by zod.

## 3. Specs

### 3.1 Visual language (`src/content/visual-language.json`)
```ts
interface VisualLanguage {
  status: Record<'working' | 'reviewing' | 'helping' | 'delivering' | 'asking' | 'waiting_answer' | 'blocked' | 'in_meeting',
                 { swatch: string; icon: string; ring: boolean; ringPulse: boolean }>
  idle: { saturation: number /*0.55*/; ring: false }
  pile: { sheetHeight: number /*0.012 m*/; maxSheets: 30; priorityEdge: Record<Priority, string /*swatch*/> }
  lod: { nearMax: number /*18 m*/; midMax: number /*45 m*/ }      // camera distance to floor centre
  emotes: { max: 12; ttlSeconds: 2.5 }
  deskGlow: { off: string; working: string; blocked: string; done: string }
}
```
Status → look (seed values; colours are palette swatch keys mirroring UI tokens):

| activity | ring | icon | extra |
|---|---|---|---|
| working | blue, steady | laptop/pen | held item, monitor glow blue, progress ring |
| reviewing | blue, steady | magnifier | holds a sheet from own pile |
| helping | blue, dashed | handshake | stands/sits at the asker's or own desk |
| delivering | none (moving) | none | paper/folder in hand |
| asking / waiting_answer | amber | "?" | sits on waiting seat when in person |
| blocked (task) | red, slow pulse | "!" | monitor glow red |
| in_meeting | blue | speech | at meeting table |
| idle / resting / off_shift | none | none | desaturated |

Icons are cells of a generated sprite atlas (`statusAtlas`), not DOM.

### 3.2 Components (all in `src/scene/render/`, read only `src/office` selectors + director output)
| Component | Technique |
|---|---|
| `StatusRings` | one `InstancedMesh` (flat ring quad, instance colour + per-instance pulse phase attribute) |
| `StatusIcons`, `PlatformBadges`, `Emotes` | one instanced billboard mesh each, UV offset per instance into an atlas |
| `BadgeAtlas` | built at runtime on a 2D canvas from `platforms.json` (rounded square in `badge.swatch` + `badge.text` in Be Vietnam Pro) → `CanvasTexture`; rebuilt on `config.changed` |
| `HeldItems` | instanced placeholder props per `carries` kind, positioned at the person's hand anchor (P04 capsule exposes `handR` position; P07b replaces with the bone) |
| `DeskStatus` | instanced monitor quad with emissive colour + instanced progress ring (shader uniform per instance = progress) |
| `DocPiles` | one `InstancedMesh` of sheets (max `piles × 30`), small deterministic jitter per sheet; count via drei `<Text>` pooled (one Text per visible pile at mid/near LOD) |
| `WaitingSeats` | no mesh of its own: provides seat allocation (`director/seating.ts`), people render as usual in a sit pose |
| `ElevatorCars` | box car + two door panels, position from `nav/elevator.ts` state; floor indicator via atlas digits |
| `Decor`, `Cat`, `WallClock`, `Fans`, `Aquarium` | primitives; clock hands from `feed.now()`; cat follows a seeded loop of `cat_spot`s on its floor (uses stairs never; one cat per building, lives on `games_rest` + lobby via teleport at night) |
| `DayNight` | lerps ambient/directional colour and sky gradient by sim hour; disabled → fixed noon |
| `Legend` (2D, `features/office/`) | shadcn popover + list; content from `visual-language.json` + i18n |

### 3.3 Idle brain (`src/scene/director/idleBrain.ts`, pure)
```ts
interface IdleOption { key: string; slotTypes: SlotType[]; minPeople: 1 | 2; maxPeople: number
  durationMinutes: [number, number]; floors: 'own' | 'leisure' | 'any'
  weight: number; when?: { hours?: [string, string]; lunch?: boolean; night?: boolean }; anim: string; emote?: string }
chooseIdle(person, ctx: { now, layout, occupancy, rngFor(personId, epoch) }): IdleChoice
```
- Score = `weight × timeFit × noveltyPenalty(last 3 choices) × distancePenalty × slotFree`. Pick by seeded weighted random among the top 3. `epoch` = floor(simMinutes / 5) so choices are stable within a 5-minute window and reproducible.
- Seed options (`src/content/idle-behaviours.json`): `stay_at_desk` (stretch, phone), `chat_pair` (idle_chat, idle_water; needs 2, speech-bubble emotes alternate), `coffee`, `tea_table` (bàn trà, 2–4 people sit on cushions), `window_gaze`, `sofa`, `pingpong` (2), `arcade` (1), `boardgame` (2–4), `karaoke` (1–3, note emotes), `massage_chair`, `bed_sleep`, `lunch_nap` (desk or bed; only at lunch, weight dominates), `night_rest` (night, non-24/7).
- Pairing: an option with `minPeople: 2` is only chosen when another idle person on the same floor (or already at the leisure floor) can be invited; the brain emits a joint choice for both, keyed by the lower id.
- Interrupt rule: any work event for the person cancels the idle plan immediately; the planner (P04) replans from the current position. A person walking back from the leisure floor takes the **stairs to their own floor first**, then the work trip starts (elevator if cross-floor).
- Occupancy: slots have capacity; `occupancy` is director state, not domain state.

### 3.4 Waiting seats and lines (`src/scene/director/seating.ts`, pure)
- Each room slot (`private_office`, `manager_office`, `boss_desk`, `review_desk`) has associated `waiting_seat` slots in the floor template (P02 templates already place a bench with `capacity: 4` outside rooms; this phase adds any missing ones).
- `seatFor(questionId)`: ordered by `question.createdAt`; index < capacity → seat i; else standing position `capacity + k` along the line vector behind the bench (0.6 m spacing).
- In-person is decided by the feed (`inPerson` flag, set when the target's open questions ≥ `policy.approvals.questionSeatThreshold`); this phase only visualises it.

### 3.5 Pile arrival accounting
`pileVisualCount(approverId) = pileFor(id).length − inTransit(id)`, where `inTransit` = review items whose carrier plan has not reached the `put_down` action. Kept in director state; resets to the domain count on reload (no courier replay).

### 3.6 LOD and readability
- `useLodBand()` computes far/mid/near per floor from camera distance to the floor centre (hysteresis 10 % to avoid flicker). Focus mode forces **near** for the focused floor and **far** for the rest; follow mode forces near for the followed person's floor.
- Floor chip (far): one pooled `<Text>` + 3 small counters per floor on the building's left edge (also the click target for floor focus from P02).
- Names (near): pooled troika `<Text>`, max 40 visible, prioritised: selected → working → others.

### 3.7 Design tokens carried over from `docs/LAYOUT.md`
Principles kept for 3D: *people first*, *one place for "needs you"* (the boss pile + the 2D queue badge), *progressive disclosure* (far chip → mid symbols → near names → drawer), *live but quiet* (no flashing; pulses ≤ 1 Hz; only blocked pulses). Status colours: working `#2563EB`, needs-you/waiting `#D97706`, blocked `#DC2626`, done `#16A34A`, idle neutral grey. These exist as palette swatches (`assets.md` §1.2 row 2) and in `src/scene/render/palette.ts`.

## 4. Design choices
| # | Topic | Options | Choice | Reason | Revisit if |
|---|---|---|---|---|---|
| D1 | Per-person indicators | drei `<Html>` per person · sprites per person · instanced atlas billboards | **Instanced atlas billboards** | 60–150 people × 3 indicators as DOM or separate sprites kills frame time; instancing = 3 draw calls total | We need rich text per person at far zoom (we don't) |
| D2 | Platform icons | real logos · placeholder badges from data | **Generated badges** (`text` + `swatch`) | Brief says placeholders; platforms must be data; avoids trademark assets in a public repo | Boss supplies approved icon files → `iconAsset` takes over per platform |
| D3 | **Elevator vs stairs** | everyone uses the elevator · idle never leaves the floor · **elevator = work, stairs = leisure** | **Elevator = work, stairs = leisure** | The brief wants idle people to visit leisure floors *and* elevator rides to always mean real work. Splitting by route keeps both true and is instantly learnable | Dad finds stair trips confusing → restrict idle people to their own floor + ground café |
| D4 | Idle selection | pure random · scripted schedule · utility scoring (seeded) | **Seeded utility scoring** | Varied but reproducible (tests, demo recordings); weights are data the boss can tune later | – |
| D5 | Pile count timing | at event time · at courier arrival | **3D at arrival, 2D at event time** | The paper should not appear before the person carrying it arrives; the 2D queue is the source of truth for the boss | Mismatch confuses → show "+1 đang tới" hint on the pile |
| D6 | Idle look | hide idle people · grey them fully · lower saturation | **Lower saturation, no ring** | Scene stays lively but workers pop | Still noisy with 100+ people → fade idle people on non-focused floors |
| D7 | Day/night | none · cosmetic lighting by sim hour | **Cosmetic, toggle, default on** | Cheap life; explains napping and night shifts | Costs > 0.5 ms or hurts readability → default off |
| D8 | Cat | none · one decorative cat | **One cat**, pure decor | "A lot of decorative life"; zero domain coupling | – |
| D9 | Where idle logic lives | in the feed (domain events per idle action) · in the director (visual only) | **Director only**; the feed just says `person.activity: idle/resting/off_shift` | Real AI workers will never report "playing ping-pong"; idle life is presentation | We want idle history in the activity feed (we don't) |

## 5. Tasks
- [ ] **P05-T01** Visual-language and idle-behaviour content + schemas. *Files:* `src/content/visual-language.json`, `src/content/idle-behaviours.json`, `src/domain/config.ts` (schemas), `scripts/content-validate.mjs`, i18n `vi/office.ts`, `en/office.ts` (legend strings). *Steps:* define zod schemas (§3.1, §3.3); seed values; load via `ConfigSource`. *Acceptance:* `npm run content:validate` passes; removing a required key fails it; unit test loads both files.
- [ ] **P05-T02** ∥ Status rings and icons. *Files:* `src/scene/render/StatusRings.tsx`, `StatusIcons.tsx`, `statusAtlas.ts`, `palette.ts`. *Steps:* instanced ring + billboard meshes; per-instance colour/UV from `visual-language.json`; idle people get no instance; desaturation uniform on the person material. *Acceptance:* story scene with 5 working / 5 idle shows 5 rings; `renderer.info.render.calls` increases by ≤ 2 for 60 people; unit test of `statusLook(activity)` mapping (R1, R2).
- [ ] **P05-T03** ∥ Platform badges. *Files:* `src/scene/render/PlatformBadges.tsx`, `badgeAtlas.ts`. *Steps:* canvas atlas from `platforms.json`; rebuild on config change; instance per person with `platformKey`. *Acceptance:* adding a platform row in a test config yields a new atlas cell without code changes (unit test on `buildBadgeAtlasLayout`); badge visible at mid/near only (R3).
- [ ] **P05-T04** ∥ Held items and desk status. *Files:* `src/scene/render/HeldItems.tsx`, `DeskStatus.tsx`, `src/scene/director/intents.ts` (expose `carrying`). *Steps:* placeholder primitives per `carries` kind; hand anchor follow; monitor emissive + progress ring shader. *Acceptance:* a task at progress 0.5 shows a half ring (visual e2e screenshot of a fixed replay frame); held prop changes with task type (unit test of mapping) (R1).
- [ ] **P05-T05** Document piles. *Files:* `src/scene/render/DocPiles.tsx`, `src/domain/selectors.ts` (`pileFor` ordering, `pileTopPriority`), `src/scene/director/transit.ts`. *Steps:* instanced sheets; count label pool; priority edge colour; arrival accounting (§3.5). *Acceptance:* unit tests: pile of 3 with one urgent → top priority urgent; `pileVisualCount` lags the domain count until `put_down`; 45 items render 30 sheets and label "45" (R4, R6).
- [ ] **P05-T06** Courier visuals. *Files:* `src/scene/director/planner.ts` (add `pick_up`/`put_down` actions with paper), `HeldItems.tsx`. *Steps:* document trips carry `held_document`; drop at `pile_anchor`; handoff trips drop at the assignee's desk. *Acceptance:* replay fixture `review-cross-floor.json`: carrier plan = walk → elevator → walk → put_down → return; paper visible only between pick_up and put_down (R6).
- [ ] **P05-T07** Waiting seats and lines. *Files:* `src/scene/director/seating.ts`, `src/content/floor-templates/*.json` (ensure benches), `planner.ts`. *Steps:* §3.4; sit pose on bench; standing line overflow. *Acceptance:* unit test: 6 in-person questions, capacity 4 → 4 seated in arrival order, 2 in line at 0.6 m spacing; answering #1 does not reshuffle seated people (they keep seats; line advances) (R5).
- [ ] **P05-T08** Elevator cars. *Files:* `src/scene/render/ElevatorCars.tsx`, `src/scene/nav/elevator.ts` (expose car state: floor position, door 0..1, occupants), `director.ts`. *Steps:* animate car and doors from scheduler state; occupants parented to the car while riding; indicators; queue positions at the door slot. *Acceptance:* unit test on scheduler: doors never open between floors, capacity respected; visual check: car and riders move together (R7).
- [ ] **P05-T09** Idle brain. *Files:* `src/scene/director/idleBrain.ts`, `idleBrain.test.ts`, `director.ts`, `planner.ts`. *Steps:* §3.3 scoring, pairing, occupancy, interruption, stairs-only cross-floor idle trips. *Acceptance:* determinism test (same seed/log → identical choice list over 2 sim hours); property test: no idle plan contains `callElevator`/`ride`; interruption test: work event during ping-pong → plan replaced within one director tick (R8, R9).
- [ ] **P05-T10** Idle activities rendering. *Files:* `src/scene/render/Person.tsx` (pose/anim keys), `Emotes.tsx`, `idle-behaviours.json`. *Steps:* placeholder poses per `anim` key (capsule tilt/sit/lie; real clips in P07b use the same keys); chat bubbles; karaoke notes; ping-pong ball. *Acceptance:* each seed idle option has a visible pose in a debug gallery route `#/office?debug=idle` (dev only); emote cap enforced (unit test on `selectEmotes`) (R12).
- [ ] **P05-T11** Calendar behaviour: lunch nap and night. *Files:* `idleBrain.ts`, `src/adapters/sim/brain/shifts.ts` (emit `person.activity` `resting`/`off_shift` per `Department.hours` and `policy.calendar`), tests. *Steps:* sim emits activity changes at lunch/night; brain weights `lunch_nap`/`night_rest`. *Acceptance:* at sim 12:05 ≥ 80 % of idle people are napping; at 23:00 `cs` shift workers are at desks while `marketing` people are in beds/pods; working people are never forced to nap (R10).
- [ ] **P05-T12** ∥ Decorative life. *Files:* `src/scene/render/Decor.tsx`, `Cat.tsx`, `WallClock.tsx`, `DayNight.tsx`, `Fans.tsx`, `Aquarium.tsx`. *Steps:* primitives at `decor`/`cat_spot` slots; clock from feed time; day/night toggle in the camera bar. *Acceptance:* clock shows sim time (test of `clockAngles(iso)`); toggling day/night off fixes lighting; no domain imports beyond `office` hooks (R11).
- [ ] **P05-T13** LOD bands and floor chips. *Files:* `src/scene/render/useLodBand.ts`, `FloorChips.tsx`, `NameLabels.tsx`. *Steps:* §3.6; pooled Text; hysteresis. *Acceptance:* unit test of `lodBand(distance, prev)` with hysteresis; at overview zoom no name labels are mounted (assert pool usage 0) (R12).
- [ ] **P05-T14** Legend + drawer parity + reduced motion. *Files:* `src/features/office/Legend.tsx`, `PersonDrawer.tsx`, `src/features/settings/SettingsPage.tsx` (motion toggle), `src/office/prefs.ts`, i18n. *Steps:* legend from data; drawer shows status/task/platform/carrying/pile/waiting position; reduced-motion pref (localStorage + media query default). *Acceptance:* e2e: open legend by keyboard, all rows have Vietnamese text; drawer for a waiting person shows "Đang chờ · vị trí 2"; with reduced motion on, ring pulse uniform is 0 (R13, R14).
- [ ] **P05-T15** Scenarios for the demo. *Files:* `src/adapters/sim/scenarios/busy-day.ts`, `long-queue.ts`, `lunch.ts` (sim only). *Steps:* scenario buttons that reliably produce piles, a full bench, couriers, and jump the clock to 11:58. *Acceptance:* each scenario replay fixture recorded to `e2e/fixtures/` and used by the screenshots in T16.
- [ ] **P05-T16** Perf check and e2e. *Files:* `e2e/office-life.spec.ts`, `docs/plan/performance.md` (numbers appended), PR body. *Steps:* run the scene check (`performance.md` §4) with 60 people; record draw calls and frame time; screenshots of 3 replay frames (desktop) + fallback at 375 px. *Acceptance:* within budget; screenshots attached to the PR (R15).

## 6. Dependencies
- **Needs:** P04 (people, planner, nav, elevator scheduler, follow camera, `Person` component with hand anchor), P03 (events for reviews/questions/help, sim clock, scenarios), P02 (floor templates with slot types incl. `waiting_seat`, `pile_anchor`, idle and decor slots).
- **Later phases rely on:** P06a uses the slot/prop list and anchor names fixed here; P06b swaps primitives for GLBs inside these components (same props); P07b maps `anim` keys from `idle-behaviours.json` to real clips and replaces the hand anchor with a bone; P11 tunes LOD numbers and legend copy.

## 7. Branch and PR
- Branch `stack/p05-office-life` from `stack/p04-people`. PR base `stack/p04-people`. Title: `[P05] Office life & visual language`.
- Description template:
```md
<stack map>
## What
Readable visual language (rings, icons, badges, piles, waiting seats, couriers, elevator cars) and idle life (idle brain, nap, night, decor). Still blockout art.
## Demo
1. `npm run build && npm run preview` → `#/office`
2. Sim panel → "Ngày bận rộn", then "Hàng chờ dài", then "Giờ nghỉ trưa"
3. Open "Chú giải"
## Requirements → evidence
R1 … R16: <test name or screenshot>
## Perf (60 people, 8 floors, reference machine)
draw calls: … | frame ms (p95): … | JS heap: …
## Contract / content changes
visual-language.json, idle-behaviours.json (new). No event changes. (or list)
## Decisions recorded
<new rows in §4, if any>
```

## 8. Review checklist
- [ ] No component in `src/scene/render/**` imports from `src/adapters/**`; idle logic contains no domain writes (D9).
- [ ] Idle plans never include elevator actions (test exists and is meaningful, not vacuous).
- [ ] All per-person indicators are instanced; no `<Html>` per person; Text is pooled.
- [ ] Platform badges come only from `platforms.json`; no logo files added.
- [ ] Pile counts in 3D converge to the 2D queue count after couriers arrive.
- [ ] Every number/colour/weight is in content JSON, none inline in components.
- [ ] Legend and drawer strings are in `vi` and `en`; Vietnamese reads naturally.
- [ ] Reduced motion honoured; nothing flashes faster than 1 Hz.
- [ ] Sim scenarios live in `src/adapters/sim/` only.
- [ ] Perf numbers in the PR body are within `performance.md` budgets.

## 9. Risks and open questions
- **Too many symbols.** Risk of visual noise at mid zoom. Mitigation: LOD bands, emote cap, D6. Tune with dad's feedback after the demo.
- **Stairs rule may feel odd** for trips from floor 1 to a leisure floor 6 levels up. Mitigation: stairwell travel is time-compressed (P04 stair model); see D3 revisit.
- **Placeholder poses look silly** (lying capsules). Acceptable until P07b; keep the debug gallery to verify keys.
- **Open:** should the boss avatars also idle (walk the terrace) or always sit at the desk? Assumed: owners stay at their desks, with small seated idles only.
- **Open:** night handling for real workers later (AI does not sleep). Assumed cosmetic and driven by `Department.hours`; real feed may simply never send `off_shift`.
