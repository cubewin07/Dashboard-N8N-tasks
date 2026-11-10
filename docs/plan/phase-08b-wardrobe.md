# P08b: Wardrobe ("Tủ đồ") and roles

## 1. Goal and demo
A fashion-game appearance editor for every employee (and the boss avatars), stored per employee, plus the first real role split: a **stylist** account that can do nothing except dress people.
**Demo after merge:** log in as the demo stylist → only "Tủ đồ" is visible. Pick Linh, change her hair, put on an áo dài, drag the build slider, save. Log in as boss → Linh walks around the office in the new look. Works on a phone at 375 px with a 3D preview of the single character.

## 2. Requirements
- **R1** `#/wardrobe` lists all active employees and owners (search by name, filter by department), plus archived ones under a toggle. A stylist can open and save the look of **every** one of them: owners, core staff and temps.
- **R2** The editor shows a 3D turntable preview (drag to rotate, zoom head/body) in its **own small canvas**; without WebGL it shows the worn items as a thumbnail stack and still allows editing.
- **R3** The base body is chosen as "Nữ / Nam" (`AppearanceV1.base`); only items whose `bases` include it are offered, and switching base swaps unsupported items to that base's defaults after a confirm. Slot tabs for every `WardrobeSlot` with thumbnail grids; selecting an item updates the preview within 150 ms (after its GLB is cached); "none" option where the slot is optional.
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
| Stylist scope | wardrobe only · wardrobe + read-only office | **Wardrobe only, for every person (owners, core, temps)** | The brief: "only change appearance and nothing else"; the boss confirmed she may dress everyone | Sister wants to watch the building → add `viewer` capability (question) |

## 5. Tasks

Conventions for every task in this phase:
- Types `AppearanceV1`, `CatalogItem`, `WardrobeSlot`: `data-model.md` §2.10–2.11. Ports: `contracts.md` §1. Shared names: `00-overview.md` §7.
- The base body is `AppearanceV1.base: 'female' | 'male'`, shown as "Nữ / Nam". An item is offered only when its `bases` includes the current base.
- **Stylist scope (decided):** the stylist may change the appearance of everyone (owners, core staff, temps, archived) and nothing else.
- `features/wardrobe/**` never imports `src/adapters/**`; it uses `src/office/appearanceStore.ts` and `src/office/configStore.ts`.
- All strings go in `src/i18n/vi/wardrobe.ts` and `src/i18n/en/wardrobe.ts` in the same commit as the component that uses them.

- [ ] **P08b-T01** `AuthPort` and `LocalAuth`
  - *Files:* `src/ports/AuthPort.ts` (exists from P01; adjust only if it differs from `contracts.md` §1), `src/adapters/local/LocalAuth.ts`, `src/adapters/local/LocalAuth.test.ts`, `src/app/auth.tsx`, `src/features/login/LoginPage.tsx`, `src/i18n/{vi,en}/login.ts`.
  - *Depends on:* –
  - *Steps:*
    1. Implement `LocalAuth implements AuthPort` with the account table `[{ email: 'boss@demo.local', role: 'boss', displayName: 'Giám đốc' }, { email: 'stylist@demo.local', role: 'stylist', displayName: 'Stylist' }]`.
    2. `signIn(email, password)`: wait 600 ms; reject with `Error('invalid_credentials')` unless the email is in the table and the password has ≥ 6 characters; store `{ userId, email, role, displayName }` under `localStorage['aioffice.session']`.
    3. Implement `session()`, `onChange(cb)`, `signOut()`, `sendPasswordReset()` (resolves after 600 ms, does nothing).
    4. Rewrite `src/app/auth.tsx` so `AuthProvider` takes an `AuthPort` instance (chosen in `src/app/providers.tsx`) and `useAuth()` keeps returning `{ session, signIn, signOut, sendPasswordReset }`; `session` now has `role`.
    5. On the login page, when the adapter is `LocalAuth`, show a hint listing the two demo emails (i18n key `login.demoHint`).
    6. Remove the old key `shophq.demo-session` on first load.
  - *Acceptance:* `LocalAuth.test.ts`: sign-in with each account yields the right role; unknown email rejects; short password rejects; `signOut` clears the session and fires `onChange(null)`. The existing login e2e passes using `boss@demo.local`.
  - *Out of scope:* Supabase auth (P09).

- [ ] **P08b-T02** Roles table, route guard, nav filter, command guard
  - *Files:* `src/app/roles.ts`, `src/app/roles.test.ts`, `src/app/RoleGuard.tsx`, `src/app/router.tsx`, `src/app/AppLayout.tsx`, `src/app/providers.tsx`, `src/office/store.ts` (the `send` wrapper), `e2e/stylist-gating.spec.ts`.
  - *Depends on:* T01.
  - *Steps:*
    1. In `roles.ts` export `type Role = 'boss' | 'stylist'`, `type Action = 'command' | 'editAppearance' | 'editConfig' | 'viewOffice'`, `can(role, action): boolean` (boss: all; stylist: only `editAppearance`), `routeAccess: Record<Role, string[]>` (boss: `['*']`; stylist: `['/wardrobe', '/settings', '/login']`), `landing(role)` (boss → `/`, stylist → `/wardrobe`), `isRouteAllowed(role, path)`.
    2. `RoleGuard` reads `useAuth().session.role`; if `!isRouteAllowed`, render `<Navigate to={landing(role)} replace />`. Wrap the authenticated route group in `router.tsx` with it.
    3. `AppLayout`: build the nav from a list where each entry has a `path`; filter with `isRouteAllowed`. For a stylist the settings page shows only language and sign out (pass a `limited` prop).
    4. In the office store's `send(cmd)`: `if (!can(role, 'command')) return { commandId: cmd.id, status: 'rejected', reason: 'forbidden' }` before calling the feed.
    5. In `providers.tsx`: when the session role is `stylist`, do not call `feed.start()` and do not render any component that imports the office canvas chunk. Config (employee list) still loads.
    6. Write the e2e: sign in as stylist, visit `#/queue`, `#/`, `#/admin`, `#/org` → URL ends with `#/wardrobe`; assert no network request matched `/assets/OfficeCanvas-` (the lazy office chunk name).
  - *Acceptance:* `roles.test.ts` covers every role × action and role × route; `e2e/stylist-gating.spec.ts` passes; unit test: `send()` as stylist returns `rejected: 'forbidden'` and the feed mock is not called.
  - *Out of scope:* server-side enforcement (RLS/RPC in P09).

- [ ] **P08b-T03** ∥ `LocalAppearanceStore` and the appearance registry
  - *Files:* `src/ports/AppearanceStore.ts` (exists; verify), `src/adapters/local/LocalAppearanceStore.ts`, `src/adapters/local/LocalAppearanceStore.test.ts`, `src/office/appearanceStore.ts`, `src/office/hooks.ts`.
  - *Depends on:* –
  - *Steps:*
    1. Storage key `aioffice.appearance.v1`, value `{ schema: 1, items: { [employeeId]: { doc: AppearanceV1, version: number } } }`.
    2. `get(id)` returns the doc or `null`; `getAll()` returns all docs; both run each doc through `migrateAppearance` (P07b).
    3. `save(id, doc, expectedVersion)`: read the current version (0 if absent); if it differs from `expectedVersion`, throw `AppearanceConflictError { serverDoc, serverVersion }`; else write `version + 1` and return `{ version }`.
    4. `subscribe(cb)`: call `cb` after each local save and on the window `storage` event for that key (so two tabs stay in sync).
    5. Corrupt JSON: copy the raw value to `aioffice.appearance.v1.bak`, reset to an empty store, `console.warn`.
    6. `src/office/appearanceStore.ts`: hold the active `AppearanceStore` (set from `providers.tsx`), a zustand map `byEmployee`, and export `useAppearance(employeeId): AppearanceV1` which falls back to `generateAppearance(employeeId)` when nothing is stored.
  - *Acceptance:* tests: version increments 0→1→2; stale `expectedVersion` throws the conflict error with the stored doc; a simulated `storage` event triggers `subscribe` callbacks; corrupt data is backed up and reset; `useAppearance` returns the generated default for an unknown id.
  - *Out of scope:* Supabase store (P09).

- [ ] **P08b-T04** ∥ Pure wardrobe logic and presets
  - *Files:* `src/features/wardrobe/logic.ts`, `src/features/wardrobe/logic.test.ts`, `src/content/catalog/presets.json`, `src/domain/config.ts` (zod schema for presets).
  - *Depends on:* –
  - *Steps:*
    1. `itemsForSlot(catalog, slot, base)`: items of the slot whose `bases` includes `base` and that are not `retired`.
    2. `applyItem(draft, item | null, slot, catalog): { next: AppearanceV1; needsClamp: BodyKey[] }`. Rules: a `fullbody` clears nothing but marks top/bottom hidden (keep their ids so removing the fullbody restores them); an item with `requires` that is unmet returns the draft unchanged plus an error code; `conflicts` removes the conflicting worn item; `needsClamp` lists body keys outside the new `effectiveLimits`.
    3. `setBase(draft, base, catalog)`: switch base; every worn item that does not support the new base falls back to the slot default for that base.
    4. `clampBody(draft, limits)`, `randomise(draft, catalog, locks: Set<WardrobeSlot>, seed: string)` (seeded RNG, respects locks, base and `generator-weights.json`), `applyPreset(draft, preset, catalog, seed)`, `diffLooks(a, b): string[]` (changed slots/sliders).
    5. All functions return new objects; never mutate the input.
    6. Write `presets.json` with the four presets of R8 using the shape in §3.6 and add its zod schema so `npm run content:validate` checks it.
  - *Acceptance:* tests: fullbody hides top/bottom and removing it restores them; outer without top is refused; conflict pair resolves; `needsClamp` reported for a `fitted` item; `setBase` swaps unsupported items; `randomise` with the same seed gives the same result and never changes a locked slot; inputs are not mutated (deep-freeze in tests).
  - *Out of scope:* React state (T05), UI.

- [ ] **P08b-T05** Editor state with undo/redo
  - *Files:* `src/features/wardrobe/useWardrobeEditor.ts`, `src/features/wardrobe/useWardrobeEditor.test.ts`.
  - *Depends on:* T03, T04.
  - *Steps:*
    1. Create a zustand store with the state of §3.2.
    2. Actions: `open(employeeId)` (loads saved doc + version, resets history), `edit(fn: (d: AppearanceV1) => AppearanceV1)` (pushes to history, truncates redo, caps history at 50), `undo()`, `redo()`, `toggleLock(slot)`, `resetToGenerated()`, `save()`, `discard()`.
    3. `dirty` = `draft` not deep-equal to `saved`.
    4. `save()` calls `appearanceStore.save(id, draft, version)`; on success set `saved = draft` and the new version; on `AppearanceConflictError` set `conflict = { serverDoc, serverVersion }` for T11's dialog.
    5. Bind Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z in a `useWardrobeShortcuts()` hook.
  - *Acceptance:* tests: 60 edits keep 50 history entries; undo then a new edit clears redo; `dirty` flips correctly; a conflict sets `conflict` and leaves `draft` untouched.
  - *Out of scope:* the dialogs themselves (T11).

- [ ] **P08b-T06** People picker
  - *Files:* `src/features/wardrobe/WardrobePage.tsx`, `src/features/wardrobe/PeoplePicker.tsx`, `src/features/wardrobe/PeoplePicker.test.tsx`, `src/app/router.tsx` (route `/wardrobe`, lazy).
  - *Depends on:* T02.
  - *Steps:*
    1. Read employees and departments from the config store. Group: owners first ("Ban giám đốc"), then the manager, then each department by `order`; temps carry a small "Tạm" tag.
    2. Search box filters by name (diacritic-insensitive: normalise with `String.prototype.normalize('NFD')` and strip combining marks).
    3. Department filter chips; an "Đã lưu trữ" toggle adds archived employees.
    4. The list is a `listbox`: arrow keys move, Enter opens the editor (`#/wardrobe/:employeeId`).
    5. If the current editor is dirty, selecting another person triggers the leave prompt (T11).
  - *Acceptance:* R1; test: typing "ha" matches "Hà" and "Hạnh"; arrow keys and Enter select; archived people appear only with the toggle; owners are listed and selectable by a stylist session.
  - *Out of scope:* editing names or roles (P10).

- [ ] **P08b-T07** 3D preview
  - *Files:* `src/features/wardrobe/WardrobePreview.tsx`, `src/features/wardrobe/PreviewFallback.tsx`, `e2e/wardrobe-preview.spec.ts`.
  - *Depends on:* T05.
  - *Steps:*
    1. Follow §3.3: own `<Canvas frameloop="demand" dpr={[1, 2]}>`, one key light + ambient, ground disc.
    2. Call P07b `assembleCharacter(draft, { mode: 'preview' })` so body morph targets stay live; re-assemble on item or base change, debounced 80 ms; update morph influences directly on slider change (no re-assemble).
    3. Turntable: pointer drag rotates the character; buttons ↺ ↻; zoom presets "Toàn thân" / "Khuôn mặt".
    4. Clip buttons: `idle` (default), `walk`, `sit_idle`, `wave`. While a clip plays, invalidate at 15 fps.
    5. On unmount dispose geometry, materials and the mixer.
    6. `PreviewFallback`: when `useDeviceTier()` reports no WebGL (or `?nowebgl=1` in e2e builds), show the thumbnails of worn items stacked in body order.
    7. Add an `aria-label` describing the outfit, built from `diffLooks`-style item labels.
  - *Acceptance:* R2; e2e: with `?nowebgl=1` the thumbnail stack is visible and editing still works; in the debug hook (`window.__office_debug.characters`) geometry count returns to its baseline after leaving the route.
  - *Out of scope:* showing the office scene behind the character.

- [ ] **P08b-T08** Slot tabs and item grids
  - *Files:* `src/features/wardrobe/SlotTabs.tsx`, `src/features/wardrobe/ItemGrid.tsx`, `src/features/wardrobe/ItemGrid.test.tsx`.
  - *Depends on:* T05.
  - *Steps:*
    1. Tabs in the order of §3.1: Dáng, Mặt, Tóc, Áo, Quần, Váy/Bộ, Khoác, Giày, Phụ kiện (sub-tabs head, glasses, ears, neck, wrist, bag). "Mặt" holds eyes, brows, mouth, facial hair.
    2. `ItemGrid` lists `itemsForSlot(catalog, slot, draft.base)`, each a radio item with thumbnail (`loading="lazy"`, from `import.meta.env.BASE_URL + item.thumb`), label and a lock toggle for the slot.
    3. A "Không" tile where the slot is optional (everything except eyes, brows, mouth).
    4. Tag filter chips built from the tags present in the slot.
    5. Selecting calls `editor.edit(d => applyItem(d, item, slot, catalog).next)`; if `needsClamp` is non-empty, open the clamp dialog (T10) first.
    6. Virtualise when a slot has more than 60 items; arrow-key navigation across the grid.
  - *Acceptance:* R3, R15; test: only items supporting the current base are listed; selecting an item updates the draft; keyboard arrows move the selection; the "Không" tile is absent for eyes.
  - *Out of scope:* colours (T09), body sliders (T10).

- [ ] **P08b-T09** Colour pickers
  - *Files:* `src/features/wardrobe/ColourPicker.tsx`, `src/features/wardrobe/ColourPicker.test.tsx`.
  - *Depends on:* T08.
  - *Steps:*
    1. For the selected item show one swatch row per entry in `item.tint.regions` ("Màu chính", "Màu phụ", "Điểm nhấn"), listing `colors.json` swatches of group `fabric` or `metal`.
    2. Writing a colour sets `draft.colors[item.id][region] = swatchKey`.
    3. Skin picker (group `skin`) and eye colour live in the "Dáng"/"Mặt" tabs; hair colour (group `hair`) in "Tóc".
    4. Each swatch is a radio button with `aria-label` from the swatch's `label`.
  - *Acceptance:* R4; test: choosing a swatch writes the expected path in the draft; items with `tint: null` show no colour row; swatches have accessible names.
  - *Out of scope:* free colour wheel (palette swatches only).

- [ ] **P08b-T10** Body tab: base, sliders, limits, clamp dialog
  - *Files:* `src/features/wardrobe/BodyTab.tsx`, `src/features/wardrobe/ClampDialog.tsx`, `src/features/wardrobe/BodyTab.test.tsx`.
  - *Depends on:* T08.
  - *Steps:*
    1. Base selector: two radio cards "Nữ" / "Nam" calling `setBase`. If items will be swapped, list them in a confirm dialog first.
    2. One native `<input type="range" step="0.01">` per `BodyKey` (height, build, muscle, chest, hips, shoulders) with a visible label and value.
    3. `min`/`max` come from P07b `effectiveLimits(draft, catalog)`; when a worn item narrows a range, show the note "‹tên món› giới hạn ‹tên thanh trượt›" under the slider.
    4. Slider input updates the draft through `editor.edit` on pointer release, and updates the preview morphs live while dragging.
    5. `ClampDialog`: shown when an item needs body values outside the current ones; options "Điều chỉnh dáng người" (apply `clampBody`) or "Huỷ".
  - *Acceptance:* R5, R6; test: wearing a `fitted` item lowers the slider `max`; the note names the item; choosing "Huỷ" leaves the draft unchanged; switching base swaps unsupported items.
  - *Out of scope:* per-base different slider sets (both bases share the six keys).

- [ ] **P08b-T11** Toolbar: randomise, presets, copy, reset, compare, save, leave prompt
  - *Files:* `src/features/wardrobe/Toolbar.tsx`, `src/features/wardrobe/ConflictDialog.tsx`, `src/features/wardrobe/CopyLookDialog.tsx`, `src/features/wardrobe/useLeavePrompt.ts`, `e2e/wardrobe-save.spec.ts`.
  - *Depends on:* T05, T07.
  - *Steps:*
    1. "Ngẫu nhiên" → `randomise` with a fresh seed, respecting locks. "Mẫu ▾" lists `presets.json` → `applyPreset`.
    2. "Hoàn tác" / "Làm lại" call the editor; disabled at the ends of history.
    3. "Đặt lại" → `resetToGenerated()` after a confirm.
    4. "So sánh": while held, the preview shows `saved` instead of `draft`.
    5. "Sao chép cho…" opens `CopyLookDialog` (people picker); copying keeps the target's own `base` and body sliders and copies outfit, hair, accessories and colours that support the target's base.
    6. "Lưu thay đổi" uses `CommandButton`-style states (sending → saved / failed). On `conflict` show `ConflictDialog`: "Giữ bản của tôi" (save again with the server version) or "Dùng bản mới" (replace the draft).
    7. `useLeavePrompt(dirty)`: block route changes and `beforeunload` while dirty.
    8. Show the notice "Chỉ lưu trên thiết bị này" when the store is `LocalAppearanceStore`.
  - *Acceptance:* R7–R9, R11; e2e: open the same employee in two tabs, save in tab A then in tab B → the conflict dialog appears and each option behaves as described; leaving with unsaved changes prompts.
  - *Out of scope:* autosave.

- [ ] **P08b-T12** Live update in the office scene
  - *Files:* `src/scene/characters/CharacterVisual.tsx`, `src/scene/characters/CharacterVisual.test.ts`.
  - *Depends on:* T03.
  - *Steps:*
    1. `CharacterVisual` reads its look with `useAppearance(employeeId)`.
    2. When the doc's `updatedAt` changes, re-run `assembleCharacter` for that employee only; keep the old mesh visible until the new one is ready, then dispose the old one.
    3. Increment `window.__office_debug.characters.assembled` on each assembly.
  - *Acceptance:* R10; e2e or integration test: saving one employee's look raises the `assembled` counter by exactly 1 and other characters keep their mesh uuid.
  - *Out of scope:* animating the outfit change.

- [ ] **P08b-T13** Phone layout
  - *Files:* `src/features/wardrobe/WardrobePage.tsx`, component styles, `e2e/wardrobe-phone.spec.ts`.
  - *Depends on:* T06–T11.
  - *Steps:*
    1. Below 768 px: the picker is its own screen; the editor has a header (back, name, department, "Lưu"), the preview at 40 % of viewport height, horizontally scrolling tabs, then the grid.
    2. Touch targets ≥ 44 px; sliders full width; the toolbar collapses into a "…" menu.
    3. Verify `overflow-x` never appears at 375 px.
  - *Acceptance:* R14; Playwright at 375 × 812: screenshot attached to the PR; `document.documentElement.scrollWidth <= 375`; the preview and the first grid row are visible without scrolling.
  - *Out of scope:* tablet-specific layout.

- [ ] **P08b-T14** i18n, accessibility review, definition of done
  - *Files:* `src/i18n/{vi,en}/wardrobe.ts`, `src/i18n/{vi,en}/login.ts`, any component fixed by the review.
  - *Depends on:* T01–T13.
  - *Steps:*
    1. Search for hard-coded strings in `src/features/wardrobe` and `src/app/RoleGuard.tsx`; move them to i18n. Vietnamese must be natural, with full diacritics.
    2. Run the `web-design-guidelines` skill on the wardrobe files and fix the findings.
    3. Check with the keyboard only: pick a person, change an item, a colour and a slider, save.
    4. Run `npm run typecheck && npm run lint && npm run test && npm run build && npm run test:e2e`.
    5. Record the wardrobe chunk size and confirm the main bundle still has no three (`00-overview.md` §6).
  - *Acceptance:* R15, R16; all commands exit 0; chunk sizes are in the PR body.
  - *Out of scope:* translating catalogue labels (they come from the catalogue JSON).

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
- Decided: the stylist sees only the wardrobe (no read-only office) and may dress everyone, including the boss avatars; nothing is lockable.
