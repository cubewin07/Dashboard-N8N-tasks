# P11: Polish, performance and handover

## 1. Goal and demo
Make the whole thing demo-ready and leave a clean base for the real AI work: smooth on the Mac Studio, complete on a phone, legacy screens gone, a guided tour for dad, proof that the simulator can be removed without touching the 3D code, and up-to-date docs.

**Demo after merge:** on the Mac Studio the boss presses **"Chế độ trình diễn"**. For five minutes the camera tours the building with Vietnamese captions: the whole building, one department at work, a document riding the elevator to the boss floor, the boss approving, the waiting seats filling during a rush, lunch nap, the games floor, a new hire arriving, a quick outfit change. Then dad picks up his phone, opens the same URL and approves an item from the queue in the 2D fallback.

## 2. Requirements
- **R1** Performance budgets in `performance.md` §2 are met on the reference scene (seed org + 10 temps, all floors, overview camera) and the numbers are recorded in the PR.
- **R2** Phone fallback is complete: Sơ đồ (org), Duyệt (queue with approve / request changes / reject), Hoạt động (activity), Tủ đồ (wardrobe), Cài đặt. Bottom tab bar, no horizontal scroll at 375×812, no three.js download unless the wardrobe preview or "Xem 3D" is opened.
- **R3** Phones can opt into 3D through "Xem 3D (thử nghiệm)" with a warning about battery and data; the choice is remembered per device and can be turned off.
- **R4** Legacy screens and their data layer are deleted (§3.2). `grep -r "lib/mock" src` returns nothing. Bundle size of the initial chunk does not grow versus P10.
- **R5** Simulator removal is proven: a CI job builds and runs the E2E smoke with the sim adapter aliased to a stub, and `docs/plan/removing-the-simulator.md` lists the exact steps.
- **R6** Guided demo mode exists (§3.4): start, pause, skip step, exit; runs unattended for ~5 minutes; restores the previous camera and sim state on exit.
- **R7** First-run legend/onboarding explains the visual language (working ring, desk status colours, paper piles, waiting seats, platform badges, elevator = work, stairs = break) and can be reopened from the help button.
- **R8** The canvas is wrapped in an error boundary; WebGL context loss shows a calm message and recovers on restore or with "Tải lại cảnh"; if WebGL is unavailable the app falls back to the 2D screens with an explanation.
- **R9** Every screen has loading, empty and error states with Vietnamese copy.
- **R10** Accessibility: the `web-design-guidelines` audit has no open high-severity item; the 3D page is operable by keyboard through the people list, floor picker and camera bar; `prefers-reduced-motion` disables camera fly-throughs and the tour's motion (cuts instead of moves).
- **R11** Vietnamese copy pass done by one agent across all features (consistent terms table, §3.6); `en` keys complete.
- **R12** Settings reworked: language, account (role, change password, sign out), display (3D quality, reduced motion override), Giới thiệu (version, contract version, asset credits from `credits.json`), simulator link (only when the sim is present).
- **R13** Branding: title, favicon, PWA-less meta tags, app name from i18n ("Shop HQ" placeholder until the boss names it).
- **R14** Docs are current: `README.md`, `AGENTS.md`, `00-overview.md` (status → built), `after-this-phase.md` (what was actually built, deviations), `docs/plan/demo-script.md`.
- **R15** Final whole-stack review (`stacked-prs.md` §6.2) is done and its findings are fixed or ticketed.

## 3. Specs
### 3.1 Performance pass (method)
1. Add `?perf=1` overlay (r3f-perf, dev and preview builds only) and `window.__office_debug.stats()` returning `{fps, frameMsP95, drawCalls, triangles, geometries, textures, programs, jsHeapMB}`.
2. Playwright perf spec (`e2e/perf.spec.ts`, runs on the Mac locally, not in CI): loads the reference scene, waits 20 s, samples 10 s, writes `perf-report.json`.
3. Fix in this order, measuring after each: instancing gaps (furniture not instanced), per-frame allocations (vectors in `useFrame`), animation LOD (off-focus floors update mixers at 10 Hz, hidden floors at 0), shadow cost (one directional light, shadow map only for the focused floor), text glyph count (names only for focused floor / followed person), React re-renders (why-did-you-render style check on store selectors), texture and geometry disposal on layout rebuild.
4. Bundle: `vite build --report`; 3D chunk lazy; wardrobe chunk separate; supabase-js dynamic; no legacy code.
5. Loading: building shell first (< 2 s on the Mac), furniture and people stream in; a progress bar in Vietnamese; assets cached with hashed filenames.

### 3.2 Legacy removal (T07)
Delete: `src/features/{overview,inbox,tasks,start,team}/`, `src/lib/mock/`, `src/lib/api.ts`, `src/lib/commands.ts` (old), `src/lib/payloads.ts`, `src/lib/database.types.ts` (old hand-written; the generated one lives in `adapters/supabase`), `src/hooks/queries.ts`, `src/hooks/useCommand.ts` (replaced by the office command hook from P03), `src/app/RealtimeProvider.tsx`, `src/app/startWork.tsx`, their i18n files, per-employee tint tokens (`--emp-*`) in `src/index.css`, `ownerTint` in `src/lib/status.ts`.
Keep: design tokens, `components/ui`, shared components still used, `src/lib/time.ts`.
**Library + Drive (decided):** keep `src/features/library`, `src/app/drive.tsx`, `src/lib/drive.ts` **frozen and unrouted** behind `VITE_FEATURE_LIBRARY=1`. Their read of mock artifacts is replaced by a tiny fixture `src/features/library/demoArtifacts.ts` so the code keeps compiling and typechecking without the mock store. It returns when real media exists (`after-this-phase.md` §5).
Routes after cleanup: `/login`, `/reset-password`, `/` (office or, on phones, org), `/org`, `/queue`, `/activity`, `/wardrobe`, `/admin`, `/settings`. Old hashes (`#/inbox`, `#/tasks`, `#/team`, `#/start`) redirect to `/queue`, `/activity`, `/org`, `/`.

### 3.3 Simulator-removal proof (T09)
- `vite.config.ts` gains an alias switch: `VITE_FEED=none` aliases `@/adapters/sim` to `src/adapters/_nosim/index.ts`, a 20-line `NullFeed` (empty snapshot from config, no events, `send` rejects with `no_feed`, no control panel).
- CI job `no-sim`: build with `VITE_FEED=none`, run the E2E smoke (building renders, people sit idle at desks, org list works, wardrobe works).
- A lint/test check asserts no file outside `src/office/feedRegistry.ts` and `src/adapters/sim/**` imports `adapters/sim`.
- `removing-the-simulator.md`: (1) implement `SupabaseFeed` per `after-this-phase.md` §7; (2) set `VITE_FEED=supabase`; (3) delete `src/adapters/sim/` and the registry line; (4) delete sim i18n keys and the settings link; (5) run the `no-sim` job as the regression test. States which files are touched: none under `src/scene/**`, `src/domain/**`, `src/features/**` except settings.

### 3.4 Guided demo mode ("Chế độ trình diễn")
- Lives in `src/features/office/tour/`. A tour is data: `tour.vi.json` = ordered steps `{ id, caption: Label, durationSec, camera: {mode, floorKey?, followRole?, shot?}, sim?: {scenario?, speed?}, waitFor?: eventType, highlight?: selector }`.
- The runner talks to the camera rig through its public API and to the simulator **only through the optional extension** `officeExtensions.tourControls` (run scenario, set speed, set seed). When the sim is absent, steps with `sim` are skipped, so the tour still works on real data later.
- Default tour (about 5 min): 1 building overview → 2 lobby and manager receiving a Telegram request → 3 task lands on a CS desk (follow the courier) → 4 working desk close-up with status and platform badge → 5 review pile at the reviewer desk → 6 elevator ride to the boss floor → 7 boss pile; caption invites the viewer to approve (auto-approves after 10 s) → 8 rush hour: waiting seats fill → 9 cross-department help (Marketing asks Design) → 10 lunch nap and games floor → 11 a temp hire arrives; cap drops one idle temp → 12 wardrobe teaser → 13 overview, closing caption.
- Uses a fixed sim seed so the tour is repeatable. Captions bottom-centre, large type, readable from across a room; progress dots; Space = pause, → = next, Esc = exit.

### 3.5 Resilience
- `CanvasErrorBoundary` + `webglcontextlost/restored` handlers; one automatic retry, then a manual button.
- Capability check at boot (WebGL2, `MAX_TEXTURE_SIZE`, device memory): chooses quality `high | medium | low | off`; the user can override in Settings.
- Feed errors (invalid event) are counted and shown in Settings → Giới thiệu → Chẩn đoán, never thrown to the UI.
- Tab hidden → sim keeps time but rendering pauses; on return people snap to their current planned positions (no 10-minute catch-up walk).

### 3.6 Copy terms (Vietnamese, used everywhere)
| Concept | Term |
|---|---|
| Office (3D) | Văn phòng |
| Org list | Sơ đồ |
| Approval queue | Duyệt / Chờ duyệt |
| Activity feed | Hoạt động |
| Wardrobe | Tủ đồ |
| Admin | Quản trị |
| Boss / Manager / Dept manager / Lead / Reviewer / Worker | Sếp / Quản lý / Trưởng phòng / Trưởng nhóm / Kiểm duyệt / Nhân viên |
| Temp staff | Nhân viên tạm |
| Help request | Nhờ hỗ trợ |
| Demo mode | Chế độ trình diễn |
| Simulator | Mô phỏng |

## 4. Design choices
| # | Topic | Options | Choice | Reason | Revisit if |
|---|---|---|---|---|---|
| D1 | Legacy screens | keep as "Bản cũ" · delete | **Delete** | Two data models and two simulators confuse both users and agents; queue/activity/org cover them | Dad misses a specific old screen → rebuild it on the office store |
| D2 | Library + Drive | delete · keep routed on fixtures · keep frozen, unrouted | **Frozen, unrouted, flag-gated** | Needed again with real media; showing fake media now would mislead | Media arrives earlier than workers |
| D3 | Sim-removal proof | written procedure only · CI job with stub | **CI job + procedure** | A promise that is not tested rots; the job is cheap | – |
| D4 | Tour implementation | hard-coded sequence · data-driven steps | **Data-driven JSON** | Captions and order will be tuned after showing dad; no code change needed | – |
| D5 | Phone 3D | never · opt-in · auto by capability | **Opt-in with warning** | Requirement says fallback without 3D; modern phones can still show it on request | Phones handle it well → auto on capable devices |
| D6 | Perf test in CI | yes · local only | **Local on the Mac Studio** (CI uses software GL, numbers meaningless) | Real target hardware gives real numbers | A GPU runner becomes available |
| D7 | PWA / offline | add · skip | **Skip** | Not requested; service workers complicate Pages deploys | Dad wants a home-screen app |

## 5. Tasks
- [ ] **P11-T01** Perf tooling: `?perf=1`, `__office_debug.stats()`, `e2e/perf.spec.ts`, baseline report. *Files:* `src/scene/debug/*`, `e2e/perf.spec.ts`, `performance.md` (baseline table). *Acceptance:* baseline numbers committed to `performance.md` §4 before any fix.
- [ ] **P11-T02** Perf fixes per §3.1.3 until R1 holds. *Files:* `src/scene/**`. *Acceptance:* report meets every budget; before/after table in the PR; no visual regression in the screenshot specs.
- [ ] **P11-T03** ∥ Bundle and loading: chunking, dynamic imports, progressive scene load, progress UI. *Acceptance:* initial JS (gz) and 3D chunk sizes within `performance.md` §2; phone route loads no `three` chunk (network assertion in E2E).
- [ ] **P11-T04** ∥ Phone fallback completion + bottom tab bar + "Xem 3D" opt-in. *Files:* `src/app/AppLayout.tsx`, `src/app/deviceGate.ts`, `src/features/{org,queue,activity,settings}/*`. *Acceptance:* R2, R3; Playwright 375×812 screenshots of all five tabs; approve from the phone queue changes the pile count in a desktop session of the same browser profile.
- [ ] **P11-T05** ∥ Resilience: error boundary, context loss, capability check, hidden-tab handling, diagnostics. *Acceptance:* R8; test forces `WEBGL_lose_context` and asserts recovery; diagnostics list shows a deliberately malformed replay event as skipped.
- [ ] **P11-T06** ∥ Loading / empty / error states on every screen. *Acceptance:* R9; a checklist table (screen × state) in the PR with screenshots.
- [ ] **P11-T07** Legacy removal per §3.2 + redirects + token cleanup. *Acceptance:* R4; typecheck, lint, tests, E2E green; `git grep -n "lib/mock\|hooks/queries\|RealtimeProvider"` empty; old hash URLs redirect.
- [ ] **P11-T08** Settings rework + credits page + branding. *Files:* `src/features/settings/*`, `index.html`, `public/favicon.svg`. *Acceptance:* R12, R13; credits page lists every row of `credits.json` with licence and link.
- [ ] **P11-T09** Simulator-removal proof per §3.3. *Files:* `src/adapters/_nosim/index.ts`, `vite.config.ts`, `.github/workflows/ci.yml`, `docs/plan/removing-the-simulator.md`. *Acceptance:* R5; `no-sim` job green; import-boundary test passes.
- [ ] **P11-T10** Tour runner + default tour + `tourControls` extension. *Files:* `src/features/office/tour/*`, `src/office/extensions.ts`, `src/adapters/sim/ui/tourControls.ts`, i18n. *Acceptance:* R6; unit test for the step runner with fake timers; full run completes unattended twice with the same seed; reduced motion uses cuts.
- [ ] **P11-T11** ∥ Legend / onboarding. *Files:* `src/features/office/Legend.tsx`. *Acceptance:* R7; shown once per user (localStorage flag), reopenable; each legend row matches the actual 3D visuals (reviewer checks against `phase-05` §3).
- [ ] **P11-T12** Accessibility audit and fixes. *Steps:* run the `web-design-guidelines` skill on all features; keyboard walk-through script; contrast check on overlays over the 3D scene. *Acceptance:* R10; findings table with status in the PR.
- [ ] **P11-T13** Vietnamese copy pass + `en` completion. *Acceptance:* R11; terms table respected (`grep` for banned variants listed in the task); a native-reader check by the human is on the test checklist.
- [ ] **P11-T14** Docs: `demo-script.md` (what to say and click, 10 minutes, including recovery tips), README, AGENTS.md refresh, overview status, `after-this-phase.md` update. *Acceptance:* R14; links resolve; `AGENTS.md` repo layout matches `tree -L 2 src`.
- [ ] **P11-T15** Final whole-stack review + release checklist + human test checklist. *Steps:* `git diff main...stack/p11-polish` review per `stacked-prs.md` §6.2; contract/version consistency; duplicated helpers; boundary rules; licence ledger; size budgets. *Acceptance:* R15; review comment posted on the PR; checklist file `docs/plan/release-checklist.md` ticked.

### Human test checklist (goes into the PR and `release-checklist.md`)
1. Mac Studio, Chrome and Safari: open the live URL, log in as boss, run Chế độ trình diễn to the end.
2. Orbit, zoom, free mode, focus each floor, follow three different people from the list.
3. Type a request to the Manager; watch it become a task and travel.
4. Approve, request changes and reject one item each from the boss queue.
5. Quản trị: add a department, hire two people, lower the temp cap, test a rule.
6. Phone: log in as stylist → only Tủ đồ; change a look → it changes on the Mac.
7. Phone as boss: all five tabs; approve one item; try "Xem 3D".
8. Turn Wi-Fi off and on: badge goes reconnecting → live, nothing breaks.
9. Read every screen once for odd Vietnamese.

## 6. Dependencies
- **Needs:** everything before it; in particular `performance.md`, P05 visual language, P08b wardrobe, P09 runbook, P10 admin.
- **Later work relies on:** the `NullFeed`/alias and removal doc (feed swap), the tour data format (re-usable on real data), diagnostics (first tool when real events arrive), the cleaned routes and store (no legacy data model left to confuse the worker integration).

## 7. Branch and PR
- Branch `stack/p11-polish` from `stack/p10-boss-controls`. PR base `stack/p10-boss-controls`. Title: `[P11] Polish, performance, phone fallback, legacy removal, demo mode`.
- If large, split: `stack/p11a-cleanup-perf` (T01–T03, T05, T07, T09) and `stack/p11b-demo-polish` (the rest).
- Description template:
```md
<stack map>
## What
Perf pass, complete phone fallback, legacy screens removed, simulator-removal proof, guided demo mode, a11y + copy pass, docs.
## Numbers (Mac Studio, reference scene)
| metric | budget | before | after |
## Deleted
<list of legacy paths, net line count>
## Evidence
- no-sim CI job: …
- a11y findings table: …
- 375px screenshots: …
## Human test checklist
<the 9 steps>
```

## 8. Review checklist
- [ ] Budgets met with numbers from the target machine, not from CI.
- [ ] No legacy import remains; no dead i18n keys for deleted screens; old URLs redirect.
- [ ] `no-sim` build works and no file under `src/scene`, `src/domain`, `src/features` (except settings) imports the simulator.
- [ ] The tour uses only public camera API + optional `tourControls`; exits cleanly; works with reduced motion.
- [ ] Context loss and no-WebGL paths verified.
- [ ] Phone never downloads the 3D chunk unless asked.
- [ ] Credits page complete; licence check and size budget scripts green.
- [ ] Docs match the code (layout, commands, contract version).
- [ ] Whole-stack review findings all resolved or explicitly deferred in `after-this-phase.md`.

## 9. Risks and open questions
- **Perf fixes can ripple** into P04–P07 code. Keep each fix a separate commit with its measurement so regressions are bisectable.
- **Deleting legacy screens is irreversible in spirit** (git keeps them). If dad liked the old Inbox, the new queue must be at least as clear; compare side by side before T07.
- **Safari WebGL differences** (context limits, colour space). Test Safari early in T02.
- **Tour timing depends on the sim.** Steps use `waitFor` events with timeouts so a slow scenario cannot hang the tour.
- **App name and logo** are still placeholders (question for the boss).
- Open: should the tour auto-start on first login for role boss? Assumed no; a visible button on the office page instead.
