# Release checklist (P11-T15, 2026-11-28)

Final whole-stack review of `git diff main...stack/p11b-demo-polish` per `stacked-prs.md` §6.2, the phase-11 §8 review checklist, the automated verification, and what a human still has to check.

## 1. Whole-stack review findings

| # | Finding | Layer | Status |
|---|---|---|---|
| F1 | `check:sim-removable` failed: the tour's scenario keys shipped sim vocabulary (`angry_refund`) in a build without a simulator | P11b (T10) | **Fixed** in d73581c: sim directions live in `adapters/sim/content/tourDirections.json` by step id (P11 D30) |
| F2 | AGENTS.md rule 12 allowed only CC0 / CC-BY, but the shipped font is OFL 1.1 (allowed by `assets.md`) | docs | **Fixed**: rule names fonts under SIL OFL 1.1 |
| F3 | `data-model.md` still said "office-model v1.0 (draft)" after four additive contract versions | docs | **Fixed**: versioned with the contract (v1.4) |
| F4 | Six selectors (`pileFor`, `queueFor`, `waitingSeatsFor`, `whyLevel`, `floorSummary`, `activitySentenceParts`) accept both argument orders through overloads, a leftover of phases written in parallel | P03/P05 | **Deferred**: harmless and tested; pick one order when the worker service imports `src/domain` (`after-this-phase.md` §2) |
| F5 | Two functions named `allocateSeats` (waiting-bench seats in `scene/director/seating.ts`, desk assignment in `scene/layout/allocate.ts`) | P04/P10 | **Deferred**: different jobs, different modules; rename on next touch |
| F6 | Two `newEmployeeId` (admin and sim) | P10 / sim | **Accepted**: the sim must not import feature code (removability) |
| F7 | Adapter imports outside `src/adapters` | all | **OK**: only the six registry files on the lint allowlist |
| F8 | `Date.now()` / `new Date()` in `src/domain` | all | **OK**: none (one comment mentions it) |
| F9 | Contract changes vs docs | P08b–P11 | **OK**: `CONTRACT_VERSION` 1.4 = `contracts.md` (enforced by `contracts.test.ts`); changelog v1.1–v1.4 |
| F10 | Legacy remnants (`lib/mock`, `hooks/queries`, `RealtimeProvider`, legacy i18n keys) | P11a (T07) | **OK**: none |
| F11 | Licence ledger | P06a–P08a | **OK**: 322 asset files, all in `credits.json` (400 rows); licences `own-CC0`, `OFL-1.1` |
| F12 | Secrets | all | **OK**: `.env.example` has empty public values only; no service-role key in `src` or `public` |

## 2. Phase-11 review checklist (§8)

- [ ] Budgets met with numbers from the target machine: **measured on an M4 Pro, not the Mac Studio** (`performance.md` §4: 60 fps in all three presets, frame p95 17.4–17.5 ms, 71–214 draw calls, 80 people). The Mac Studio run is human check H1.
- [x] No legacy import remains; no dead i18n keys for deleted screens; old URLs redirect (`legacyRedirects.ts`, e2e).
- [x] `no-sim` build works (`check:sim-removable` OK, 47 JS files) and nothing under `src/scene`, `src/domain`, `src/features` imports the simulator (lint + grep).
- [x] The tour uses only the public camera API + optional `tourControls`; exits cleanly (e2e `p11-tour`); reduced motion and E2E use camera cuts.
- [x] Context loss and no-WebGL paths verified (P11-T05 e2e).
- [x] Phone never downloads the 3D chunk unless asked (P11-T03 network assertion).
- [x] Credits page complete; `assets:check` (8.0 MB of 30 MB) and `size:budget` (initial JS within budget) green.
- [x] Docs match the code: AGENTS.md layout = `tree -L 2 src`, commands = `package.json`, contract version 1.4.
- [x] Whole-stack findings resolved or deferred (§1; F4, F5 are low and listed here).

## 3. Automated verification (2026-11-28, `stack/p11b-demo-polish`)

| Check | Result |
|---|---|
| `npm run typecheck` · `npm run lint` | pass |
| `npm run test` | 151 files, 1031 tests pass |
| `npm run build` | pass |
| `npm run test:e2e` | 102 passed, 34 skipped (project-specific: desktop-only or phone-only specs), 0 failed |
| `npm run size:budget` · `assets:check` · `catalog:validate` · `check:sim-removable` | pass |
| `npm run content:validate` | pass on a clean checkout. A local copy fails only because of three untracked `src/content/floor-templates/* (1).json` duplicates, which are not part of the repo |

## 4. Human test checklist

Tick each on the real devices. Anything odd: a screenshot of **Cài đặt → Giới thiệu → Chẩn đoán** plus what you did.

- [ ] **H1** Mac Studio, Chrome and Safari: open the live URL, log in as boss, run **Chế độ trình diễn** to the end. Optional numbers: `?perf=1` shows fps and draw calls; with the "Đông người" scenario fps should stay near 60.
- [ ] **H2** Orbit, zoom, free mode, focus each floor, follow three different people from the **Nhân sự** list.
- [ ] **H3** In **Duyệt**, type a request in **Nhắn cho quản lý…**; watch it become a task and travel in the building.
- [ ] **H4** Approve, request changes on, and reject one item each from **Chờ sếp duyệt**.
- [ ] **H5** **Quản trị**: add a department (a floor appears), hire two people, lower the temp cap, test a rule. Download a backup in **Sao lưu** first and restore it afterwards.
- [ ] **H6** Phone: log in as stylist → only **Tủ đồ**; change a look → it changes on the Mac.
- [ ] **H7** Phone as boss: all five tabs; approve one item; try **Xem 3D (thử nghiệm)** and back.
- [ ] **H8** Turn Wi-Fi off and on: the badge goes "Mất kết nối" → "Trực tuyến", nothing breaks.
- [ ] **H9** Read every screen once for odd Vietnamese (native reader).
- [ ] **H10** Keyboard only on the Mac: Tab from the top reaches "Bỏ qua, đến nội dung chính"; the tour runs with Space / → / Esc.
- [ ] **H11** Rehearse `demo-script.md` once end to end (about 10 minutes).
