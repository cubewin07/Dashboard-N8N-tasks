# P08b: Wardrobe ("Tủ đồ") and roles

## 1. Goal and demo
A fashion-game appearance editor for every employee (and the boss avatars), stored per employee, plus the first real role split: a **stylist** account that can do nothing except dress people.
**Demo after merge:** log in as the demo stylist → only "Tủ đồ" is visible. Pick Linh, change her hair, put on an áo dài, drag the build slider, save. Log in as boss → Linh walks around the office in the new look. Works on a phone at 375 px with a 3D preview of the single character.

## 2. Requirements
- **R1** `#/wardrobe` lists all active employees and owners (search by name, filter by department), plus archived ones under a toggle.
- **R2** The editor shows a 3D turntable preview (drag to rotate, zoom head/body) in its **own small canvas**; without WebGL it shows the worn items as a thumbnail stack and still allows editing.
- **R3** Slot tabs for every `WardrobeSlot` with thumbnail grids; selecting an item updates the preview within 150 ms (after its GLB is cached); "none" option where the slot is optional.
- **R4** Colour swatches per tint region of the selected item; skin, hair and eye colour pickers.
- **R5** Body sliders are continuous (step ≤ 0.01), update the preview live, and are limited to `effectiveLimits(appearance)`; when a worn item narrows a slider the UI says which item ("Áo vest giới hạn dáng người").
- **R6** Putting on an item whose limits exclude the current body value asks: clamp body, or cancel.
- **R7** Randomise (respecting locks per slot), undo/redo (≥ 50 steps, Cmd/Ctrl+Z), reset to generated default, before/after compare (hold button).
- **R8** Presets: "Công sở", "Dạo phố", "Áo dài Tết", "Thể thao" (data in `src/content/catalog/presets.json`, tag-driven), and "copy look to…" another employee.
- **R9** Save uses `AppearanceStore.save(id, doc, expectedVersion)`; on version conflict the user chooses mine/theirs; unsaved changes prompt before leaving.
- **R10** Saved appearance appears on the character in the office scene without reload, and only that character re-assembles.
- **R11** `LocalAppearanceStore` persists in `localStorage` (`aioffice.appearance.v1`), versioned per employee, and the UI states "Chỉ lưu trên thiết bị này" until P09.
- **R12** `AuthPort` + `LocalAuth` replace the old demo auth: demo accounts `boss@demo.local` and `stylist@demo.local` (any password ≥ 6 chars), role in session.
- **R13** A stylist session can open only `/wardrobe` (and `/login`, `/settings` limited to language + sign out). Every other route redirects to `/wardrobe`; nav shows only allowed entries; `office.send()` rejects any command from a stylist; no 3D office chunk and no simulator start for stylist sessions.
- **R14** Phone (375×812): picker → editor flow, preview on top (40 % height), tabs scroll horizontally, no horizontal page scroll, touch targets ≥ 44 px.
- **R15** Keyboard and screen-reader: grids are `listbox`/radio groups with arrow keys, sliders are native ranges with labels and values, preview has a text description of the outfit.
- **R16** All strings in `src/i18n/{vi,en}/wardrobe.ts`; item names from catalogue labels.

## 3. Specs
### 3.1 Screens
```
Desktop                                            Phone
┌ People ──────┬ Preview ───────────┬ Editor ───┐  ┌ ← Linh · CSKH        [Lưu] ┐
│ 🔍 search    │                    │ [Dáng][Mặt][Tóc][Áo][Quần][Váy/Bộ]      │ │      3D preview         │
│ CSKH         │     (turntable)    │ [Khoác][Giày][Phụ kiện]                 │ │   ↺ ↻  ⤢  before/after  │
│  ● Linh      │                    │ ┌──┬──┬──┬──┐ thumbnails                │ ├─────────────────────────┤
│  ○ Mai       │  ↺ ↻ ⤢ 👁 so sánh   │ │  │  │  │  │                         │ │ tabs → → →              │
│ Marketing    │                    │ └──┴──┴──┴──┘                           │ │ ▢ ▢ ▢ ▢  grid          │
│  ○ Hà …      │ [Ngẫu nhiên][Mẫu ▾]│ Màu: ● ● ● ●   tags: [Công sở][Tết]    │ │ Màu ● ● ● ●            │
│              │ [Hoàn tác][Làm lại]│ [Đặt lại]            [Lưu thay đổi]     │ └─────────────────────────┘
└──────────────┴────────────────────┴─────────────────────────────────────────┘
```
"Phụ kiện" groups head, glasses, ears, neck, wrist, bag as sub-tabs. "Dáng" holds the base body (Nữ / Nam), height, build, muscle, chest, hips, shoulders, skin.

### 3.2 State (`features/wardrobe/useWardrobeEditor.ts`, zustand slice local to the feature)
`{ employeeId, saved: AppearanceV1, draft: AppearanceV1, version, history: AppearanceV1[], cursor, locks: Set<slot>, dirty }`. Pure helpers in `features/wardrobe/logic.ts`: `applyItem(draft, item, catalog)` (handles `hides`, `requires`, conflicts, limit clamp decision), `randomise(draft, catalog, locks, seed)`, `applyPreset(draft, preset, catalog, seed)`, `diffLooks(a, b)`. All unit-tested, no React.

### 3.3 Preview (`features/wardrobe/WardrobePreview.tsx`)
- Separate `<Canvas>` (the one-canvas rule in `00-overview.md` §5.5 applies to the office scene; the wardrobe route never mounts the office canvas at the same time), `frameloop="demand"` except while dragging or playing the idle clip at 15 fps, DPR ≤ 2, one light rig, soft ground disc.
- Uses P07b `assembleCharacter` in **preview mode**: runtime morph targets kept for the body sliders so dragging is instant; re-assemble (baked) on item change, debounced 80 ms.
- Plays `idle`; buttons to preview `walk`, `sit_idle`, `wave` (to check the outfit in motion).
- Bundle: wardrobe chunk shares the three/character chunk with the office chunk; main bundle still has no three.

### 3.4 Ports and adapters
- `src/ports/AppearanceStore.ts`, `src/ports/AuthPort.ts` (as in `contracts.md` §1; created in P01 as interfaces, implemented here).
- `src/adapters/local/LocalAppearanceStore.ts`: storage shape `{ schema: 1, items: { [employeeId]: { doc, version } } }`; `storage` event → `subscribe` callbacks (two tabs stay in sync); corrupt JSON → reset with backup key.
- `src/adapters/local/LocalAuth.ts`: accounts table in code (demo only, no secrets), session in `localStorage` (`aioffice.session`), same UX as today (600 ms fake delay, generic error).
- `src/office/appearanceStore.ts`: registry + `useAppearance(employeeId)` hook (falls back to `generateAppearance`), consumed by `CharacterVisual`.

### 3.5 Role gating
- `src/app/roles.ts`: `routeAccess: Record<Role, RoutePattern[]>`, `can(role, action)`; data-like table so P09 can reuse it against real roles.
- `RoleGuard` wraps route groups; `AppLayout` nav filters by `can`; default landing: boss → `/office`, stylist → `/wardrobe`.
- `office.send` guard: `if (!can(role,'command')) reject('forbidden')` (defence in depth; real enforcement is RLS/RPC in P09).
- For a stylist session `providers.tsx` does not start the feed (no simulator, no office store subscription); wardrobe needs only config (employee list) + appearance store.

### 3.6 Presets (`presets.json`)
`{ key, label, picks: { slot: { tagsAny: string[], fallback: itemId } }, colours?: {...} }`; the preset resolver picks seeded-random matching items so the same preset gives varied results per employee.

## 4. Design choices
| Topic | Options | Choice | Reason | Revisit if |
|---|---|---|---|---|
| Preview on phone | none (thumbnails only) · single-character 3D | **Single-character 3D with thumbnail fallback** | One 8k-tri character is light; a fashion game without a preview is no fun | Low-end phones stutter → auto-fallback when first frame > 50 ms |
| Preview canvas | reuse office canvas (view) · separate canvas | **Separate small canvas** | Stylist must not load/run the office; simpler lifecycle | Memory pressure when switching routes → dispose on unmount (already required) |
| Live sliders | re-assemble per change · runtime morphs in preview | **Runtime morphs in preview only** | Instant feedback; office stays baked | – |
| Save model | autosave · explicit save with undo | **Explicit save, undo/redo, leave-prompt** | Sister can experiment freely; boss sees only finished looks | Users forget to save → autosave draft locally |
| Roles before Supabase | wait for P09 · local demo roles now | **Local demo roles now** | UI gating, routes and ports get built and tested early; P09 only swaps adapters | – |
| Stylist scope | wardrobe only · wardrobe + read-only office | **Wardrobe only** | The brief: "only change appearance and nothing else" | Sister wants to watch the building → add `viewer` capability (question) |
| Office write gate (2026-11-21) | pass the role into the office layer · a boolean switch | **`setCommandsAllowed(boolean)` in `src/office/sessionRole.ts`, set by the auth layer** | The office layer stays role-agnostic; P09 sets the same switch from the real session | More than two roles need different command sets → a permission map |
| Route access (2026-11-21) | per-route guards · one table | **`routeAccess` table of exact paths or prefixes per role; unknown paths go to the role's landing page; the office route is lazy and role-checked** | A stylist never downloads the office or three.js chunk; one place to audit | – |
| Stylist actions (2026-11-21) | wardrobe + settings · wardrobe only | **`can(stylist, …)` allows wardrobe and credits only**; email lookup for demo logins is case-insensitive | Matches "only change appearance" | – |
| Hidden picks (2026-11-21) | drop on hide · keep in the doc | **Keep**: a top under a fullbody stays in the doc and returns when the fullbody comes off | Taking off a dress should not lose the shirt the stylist chose | – |
| Pick side effects (2026-11-21) | refuse · last action wins | **Last action wins**: conflicting items are removed, required slots cannot be emptied, an outer with nothing under it adds the first `requires` default; the editor shows what was removed or restored | Fewer dead ends than a refusal | – |
| Body clamp on pick (2026-11-21) | silent clamp · ask | **`applyItem` returns `clamps[]`; the editor asks (clamp body or cancel)**; presets, randomise and base switch clamp silently with a note | R6; bulk actions would otherwise ask several times | – |
| Randomise (2026-11-21) | own random picker · reuse the generator | **Reuses `generateAppearance` with seed `wardrobe:<seed>:<i>`, then reapplies locked slots** | One set of weights (`generator-weights.json`) for seeded and random looks | – |
| Presets (2026-11-21) | fixed item ids · tag rules | **`presets.json` picks per slot `{tagsAny, fallback, chance?}`** | New items join presets by tag, no code change | – |
| History (2026-11-21) | unbounded · capped | **100 steps; a slider drag commits one step after 150 ms quiet or on release** | Bounded memory; one drag is one undo | – |
| Live office update (2026-11-21) | rebuild all on any save · rebuild changed only | **The appearance cache keeps doc identity while the hash is unchanged; `CharacterVisual` reads `useSavedAppearance`, so only the saved person re-assembles**; a cumulative `assemblies` counter sits beside the `assembled` gauge for e2e | Saving one look must not rebuild the building | – |
| Retired items (2026-11-21) | hide everywhere · keep when worn | **Grids and seeded/random looks skip retired items; a worn retired item stays shown so the selection is visible** | Ids are permanent; old saved looks keep working | – |
| Item grid size (2026-11-21) | virtualise · lazy thumbnails | **No virtualisation: lazy thumbnails + `content-visibility: auto`** | The largest slot has 14 items | A slot passes ~200 items |
| Copy look to… (2026-11-21) | merge · overwrite after confirm | **Overwrite after a confirm, saved at the target's cached version; a conflict shows an error toast** | Rare action; the target's owner can undo by re-editing | – |
| Contract (2026-11-21) | v1.0 · v1.1 | **v1.1 (additive): `AppearanceStore.getEntries()` and `AppearanceConflictError`** | Live update and the save-conflict dialog need both | – |
| Preview character (2026-11-21) | own loader · reuse the office character system | **`CharacterPeople` with `capacity: 1` inside the preview canvas, poses mapped from the clip buttons (stand→`wait_stand`, walk, sit, wave→`greet`)** | Same assembly, materials and animation code as the office, so the preview is what the office will show | – |
| Live sliders, revised (2026-11-21) | runtime morphs in the preview · baked morphs re-assembled | **Baked morphs, re-assembled 80 ms after the last slider change** (replaces "runtime morphs" above) | One code path with the office (which bakes); a re-assembly of one character is fast enough to feel live | Slider drag feels laggy on low-end phones → add runtime morph targets to the preview only |
| Turntable (2026-11-21) | orbit the camera · rotate the character | **Rotate the character (drag, or the two rotate buttons); the camera only zooms between full body and face** | Lighting stays fixed on the face; buttons give a keyboard/tap alternative to the drag | – |
| Reduced motion (2026-11-21) | same easing · instant | **With `prefers-reduced-motion` rotation and zoom snap instead of easing** | – | – |
| Selection in URL (2026-11-21) | component state · query param | **`#/wardrobe?id=<employee>`** | Deep links, back button returns to the list on phone, the leave prompt sees the change | – |
| People picker owners (2026-11-21) | filter owners by department · always show | **Owners (`caps.humanOwner`) stay listed first under any department filter** | They have no department in practice and are edited most | – |
| Blush (2026-11-21) | colour region · toggle | **A "Má hồng" checkbox on the face tab** | The appearance doc has `face.blush: boolean` | – |
| Slot tabs (2026-11-21) | horizontal scroll · wrap | **Wrap onto two rows** | With 9 slots the scroller hid Khoác/Giày/Phụ kiện at desktop column width with no cue | – |
| Saves from another tab (2026-11-21) | ignore until next pick · follow | **A clean editor adopts a newer saved version; a dirty one keeps its draft and gets the conflict dialog on save** | No stale look on screen, no lost work | – |

## 5. Tasks
- [x] **P08b-T01** `AuthPort` + `LocalAuth`, migrate `src/app/auth.tsx` to the port (keep `useAuth` API shape), login page shows the two demo accounts hint in demo mode. *Acceptance:* R12; unit tests sign-in/out/role; existing login e2e still green.
- [x] **P08b-T02** `roles.ts`, `RoleGuard`, nav filtering, landing redirects, `office.send` guard, feed not started for stylist. *Acceptance:* R13 unit tests for `can`/`routeAccess`; e2e: stylist visiting `#/queue`, `#/office`, `#/admin` lands on `#/wardrobe`; network panel shows no office chunk.
- [x] **P08b-T03** ∥ `LocalAppearanceStore` + `office/appearanceStore.ts` + `useAppearance`. *Acceptance:* R11 tests (version increments, conflict detection, storage-event sync, corrupt data recovery).
- [x] **P08b-T04** ∥ `features/wardrobe/logic.ts` (`applyItem`, `randomise`, `applyPreset`, `diffLooks`) + `presets.json`. *Acceptance:* tests: fullbody hides top/bottom and restores them when removed; outer requires top; limit clamp decision; randomise respects locks and is seeded.
- [x] **P08b-T05** Editor state (`useWardrobeEditor`) with undo/redo and dirty tracking. *Acceptance:* R7 tests (50-step history, redo cleared after new edit).
- [x] **P08b-T06** People picker (search, department groups, archived toggle, owners first). *Acceptance:* R1; keyboard navigation test.
- [x] **P08b-T07** `WardrobePreview` (canvas, turntable, zoom presets, clip buttons, no-WebGL fallback). *Acceptance:* R2; e2e with WebGL disabled flag shows the thumbnail stack; disposes on unmount (geometry count returns to baseline).
- [x] **P08b-T08** Slot tabs + thumbnail grids + tags filter + "none". *Acceptance:* R3, R15; lazy thumbnails (`loading="lazy"`), grid virtualised if > 60 items.
- [x] **P08b-T09** Colour pickers (tint regions, skin, hair, eyes). *Acceptance:* R4; swatches have accessible names from `colors.json` labels.
- [x] **P08b-T10** Body tab: base a/b, sliders with live limits and explanation, clamp dialog. *Acceptance:* R5, R6 tests on `effectiveLimits` wiring; slider `max` changes when a `fitted` item is worn.
- [x] **P08b-T11** Toolbar: randomise + locks, presets, copy look to…, reset, compare, save with conflict dialog, leave prompt. *Acceptance:* R7–R9; conflict simulated by a second tab in e2e.
- [x] **P08b-T12** Live office update: `CharacterVisual` subscribes via `useAppearance`; only the edited person re-assembles. *Acceptance:* R10; debug counter `assembled` increments by exactly 1 after a save.
- [x] **P08b-T13** Phone layout + touch polish. *Acceptance:* R14 Playwright at 375×812 screenshot, no horizontal scroll, preview visible.
- [ ] **P08b-T14** i18n (`wardrobe.ts`, `login.ts` additions), a11y review with the `web-design-guidelines` skill, DoD run. *Acceptance:* R15, R16.

## 6. Dependencies
- **Needs:** P07b (`assembleCharacter`, `effectiveLimits`, `generateAppearance`, schema), P08a (catalogue, thumbs, colours, tags), P01 ports and nav shell.
- **Later phases rely on:** P09 swaps `LocalAppearanceStore`→`SupabaseAppearanceStore` and `LocalAuth`→`SupabaseAuth` behind the same ports and reuses `roles.ts`; P10 admin screens reuse `RoleGuard`; P11 phone fallback includes this screen. **Expensive to change later:** role names (`boss`, `stylist`), storage/version semantics of `save`.

## 7. Branch and PR
- Branch `stack/p08b-wardrobe` from `stack/p08a-wardrobe-assets`. Base `stack/p08a-wardrobe-assets`. Title: `[P08b] Wardrobe editor + boss/stylist roles (local)`.
```md
<stack map>
## What
Tủ đồ editor, local appearance store, demo roles (boss / stylist).
## Demo
1. Login stylist@demo.local → only Tủ đồ. 2. Dress Linh, save. 3. Login boss@demo.local → see Linh in #/office.
Screenshots: desktop, 375 px, no-WebGL fallback.
## Tests
unit: logic, store, roles · e2e: stylist gating, save → office update, phone layout
## Contract changes
none expected (ports implemented as specified)
## Perf
wardrobe chunk size · preview frame time on phone
```

## 8. Review checklist
- [ ] Stylist cannot reach any other route by URL, nav, deep link or back button; no commands possible; office chunk not fetched.
- [ ] Nothing in `features/wardrobe` imports `adapters/**` directly (goes through `office/appearanceStore`).
- [ ] Logic helpers are pure and tested; no appearance mutation in place (history relies on immutability).
- [ ] Preview disposes GPU resources on unmount; `frameloop="demand"` when idle.
- [ ] Sliders respect limits and explain them; clamp dialog works.
- [ ] 375 px layout correct; keyboard path complete; Vietnamese copy natural.
- [ ] "Device-only" notice visible (removed in P09).

## 9. Risks and open questions
- **localStorage looks are per device**: sister's edits will not reach dad until P09. The notice says so; if that is a problem, move P09 before P08b (the ports make that swap cheap) — listed as a question.
- **Two canvases** if a future layout shows office and wardrobe together: not planned; would need the shared-canvas `View` approach.
- **Thumbnail count** (80+) on phones: lazy loading + virtualisation.
- Open: should the stylist also see the office read-only? Should boss avatars be lockable against edits?
