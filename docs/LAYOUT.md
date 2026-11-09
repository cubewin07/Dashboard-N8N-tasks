# Layout & Design Direction

Design goal: **"a calm control room"**. In 3 seconds you should know: *Is the team working? Does anything need me?*
You only open detail when you choose to.

> The UI is **Vietnamese by default**. The sketches below use English labels only so they're easier to read. Real labels come from `src/i18n/vi.ts` (e.g. Overview → *Tổng quan*, Inbox → *Cần bạn xử lý*, Tasks → *Công việc*, Start work → *Giao việc*, Library → *Thư viện*, Team → *Nhân viên*, Settings → *Cài đặt*, Live → *Trực tuyến*).
>
> Branding: **"Shop HQ"** (placeholder name), jade accent, illustrated-initial avatars.

## Design principles
1. **People first, not tables.** Employees are cards with faces and colours. Tasks read like sentences ("Linh is drafting 12 replies for Shop A").
2. **One place for "needs you".** A red count badge in the sidebar and a top strip on Overview. Everything actionable lives in the Inbox.
3. **Steps are always visible** as a dot-track: `● ● ◐ ○ ○` (done, done, current, pending). The same component appears everywhere.
4. **Progressive disclosure.** Card → side drawer → full page. You never lose your place.
5. **Live but quiet.** Changes fade in softly, with no jumping layouts. The connection state is always visible in the top bar.

## Visual system
| Token | Choice |
|------|--------|
| Font | **Be Vietnam Pro** (full Vietnamese diacritics, premium geometric feel); tabular numbers for times and counts |
| Base | Warm off-white `#FAF9F7` / surfaces `#FFFFFF` / ink `#1C1B19`; dark mode: `#121211` / `#1B1A18` |
| Accent | Deep jade `#0F766E` (primary actions) |
| Status | Working = blue `#2563EB` · Needs you = amber `#D97706` · Blocked = red `#DC2626` · Done = green `#16A34A` · Idle = neutral grey · Offline = striped grey |
| Employee colours | Each employee has a soft tint for their avatar ring and step dots (Thu rose, Mai sky, Linh amber, Ha violet, Vy pink, An teal, Bao orange) |
| Shape | 14px card radius, 1px hairline borders, very soft shadow only on hover/drawers |
| Motion | 150–200ms ease-out; a gentle pulse on the `working` dot; respects `prefers-reduced-motion` |
| Density | Roomy on Overview, tighter in Tasks and Library |

## App shell

```
┌────────────┬──────────────────────────────────────────────────────────────────┐
│  ◆ Shop HQ │  Good morning, Boss · Mon 09 Nov, 09:41 ICT     ● Live   [+ Start work] │
│            ├──────────────────────────────────────────────────────────────────┤
│ ▣ Overview │                                                                  │
│ ✉ Inbox  3 │                        PAGE CONTENT                              │
│ ☰ Tasks    │                                                                  │
│ ▶ Start    │                                                                  │
│ ▦ Library  │                                                                  │
│ ☺ Team     │                                                                  │
│            │                                                                  │
│ ─────────  │                                                                  │
│ n8n ● on   │                                                                  │
│ ⚙ Settings │                                                                  │
└────────────┴──────────────────────────────────────────────────────────────────┘
```
- **Live badge:** `● Live` (green) / `◌ Reconnecting…` (amber) / `✕ Offline: data may be stale` (red, full-width banner).
- **n8n status** at the bottom of the sidebar comes from the heartbeat: "Team online" / "Team offline since 18:20 (PC off)".
- **Mobile:** the sidebar becomes a bottom tab bar (Overview · Inbox · Start · Tasks · More). Drawers become full-screen sheets.

## 1. Overview: "Team floor" (home)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ⚠ 3 things need you   [2 approvals] [1 blocked]                 Open Inbox → │  amber strip, hidden when 0
├──────────────┬──────────────┬──────────────┬──────────────┐                  │
│ Working  4   │ Waiting you 2│ Blocked  1   │ Done today 18│   ← stat tiles    │
├──────────────┴──────────────┴──────────────┴──────────────┘                  │
│ THE TEAM                                                                     │
│ ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐   │
│ │ (Li) Linh            │ │ (An) An              │ │ (Vy) Vy              │   │
│ │ Review Replier       │ │ Reviewer             │ │ Visual Producer      │   │
│ │ ● Working · 3m       │ │ ● Idle               │ │ ◆ Waiting for you    │   │
│ │ Drafting 12 replies  │ │ Free for work        │ │ Banner set · Shop C  │   │
│ │ Shop A · #142        │ │                      │ │ #139                 │   │
│ │ ● ● ◐ ○ ○  step 3/5  │ │                      │ │ ● ● ● ● ◆ ○  5/6     │   │
│ │ 🔓 Asks first         │ │                      │ │ [Review →]           │   │
│ └──────────────────────┘ └──────────────────────┘ └──────────────────────┘   │
│  … Thu, Mai, Ha, Bao                                                         │
├───────────────────────────────────────────────┬──────────────────────────────┤
│ LIVE ACTIVITY                                 │ BY SHOP (7)                  │
│ 09:41 Linh finished "Collect reviews" (#142)  │ Shop A  ●●○  2 active        │
│ 09:40 An passed QC on post #140               │ Shop B  ○    idle            │
│ 09:38 You approved banner set #137 (Telegram) │ Shop C  ◆    1 waiting       │
│ …                              View all →     │ …                            │
└───────────────────────────────────────────────┴──────────────────────────────┘
```
Click an employee card → **Employee drawer** (current task, queue, today's history, autonomy toggle).

## 2. Inbox: "Needs you"

```
┌ Filters: [All 3] [Approvals 2] [Questions 0] [Blocked 1]          ┐
├─────────────────────────────┬─────────────────────────────────────┤
│ ◆ Approve 12 review replies │  REVIEW 12 REPLIES · Shop A · #142  │
│   Linh · Shop A · 4m ago    │  Prepared by Linh · checked by An ✓ │
│ ◆ Approve banner set        │ ─────────────────────────────────── │
│   Vy · Shop C · 20m ago     │  ★☆☆☆☆ "Giao hàng chậm…"            │
│ ✕ Blocked: promo entry      │   ↳ Draft: "Dạ shop xin lỗi…" [edit]│
│   Bao · "Missing floor price│  ★★★★★ "Đẹp lắm"                    │
│    for SKU X12"             │   ↳ Draft: "Cảm ơn chị…"      [edit]│
│                             │  …                                  │
│                             │ ─────────────────────────────────── │
│                             │ [✓ Approve]  [✎ Ask for changes]    │
│                             │ [✕ Reject]   [⇄ Reassign]           │
└─────────────────────────────┴─────────────────────────────────────┘
```
- Two panes on desktop, list → full-screen detail on mobile.
- Blocked items show the **reason in plain words** plus the action (answer / retry / reassign / cancel).
- After you act, the item shows "Sent… ✓ Applied" once n8n confirms the command. If n8n is offline: "Queued: will run when the team is back online".

## 3. Tasks list + Task detail

List: a table with saved tabs **Active · Waiting · Blocked · Done · All**. Columns: #, workflow (icon), shop, owner avatar, step dots, status, updated (ICT). Filters by shop, workflow, employee, date.

Task detail (drawer, or full page at `#/tasks/142`):
```
┌──────────────────────────────────────────────────────────────────┐
│ #142 · Reply to reviews · Shop A          ● Working   started 09:30│
│ Brief: "new reviews this week"   Ask before posting: Yes          │
├───────────────────────────────┬──────────────────────────────────┤
│ STEPS                         │ OUTPUT                           │
│ ✓ Collect reviews   Linh 09:31│  (preview of drafts / images /   │
│   "Found 12 new reviews"      │   video poster, Drive links)     │
│ ✓ Draft replies     Linh 09:36│                                  │
│ ◐ Quality check     An   now  │                                  │
│ ○ Your approval     You       │                                  │
│ ○ Post replies      Linh  ★   │                                  │
├───────────────────────────────┴──────────────────────────────────┤
│ HISTORY (full event log, newest first, with source: dashboard / telegram / n8n)│
└──────────────────────────────────────────────────────────────────┘
```

## 4. Start work (3-step wizard in a side sheet, opened from "+ Start work" anywhere)

```
① What?     [💬 Chat] [⭐ Reviews] [📝 Post] [🎬 Video] [🖼 Banners] [🏷 Promo]
② Where?    Shop: [Shop A ▾]   Brief (optional): [______________]
            ☑ Ask me before publishing   (default from the employee's autonomy)
③ Preview   This will run:
            1. Collect reviews ─ Linh
            2. Draft replies   ─ Linh
            3. Quality check   ─ An
            4. Your approval   ─ You      (skipped if unticked)
            5. Post replies ★  ─ Linh
            Linh is free now · starts immediately   (or "2 tasks ahead in queue")
                                                       [Start →]
```

## 5. Library

Before Drive is connected: an empty state card that says "Kết nối Google Drive để xem hình ảnh và video", with a **[G Connect Google Drive]** button. File names and metadata are still listed from Supabase.
After connecting: the top bar shows a small `Drive ●` indicator, and the token silently renews while you are signed into Google.

Masonry/grid of produced files. Filters: shop · workflow · type (image/video/text) · employee · date range. Card = Drive thumbnail, title, shop chip, date. Click → **lightbox** (image zoom / video in the Drive preview player / text preview) with **Open in Drive**, **Copy link**, and "Go to task #".

## 6. Team

Seven profile cards: avatar, role, scope (bullets), skills, today's numbers (done / failed / average time), and the **autonomy switch**:
`Asks me first ◯━━ Works alone`. Switching to "Works alone" opens a confirm dialog listing the risky steps it unlocks ("Linh will post review replies without asking you").

## 7. Login (Supabase Auth)
```
┌─────────────────────────────────────────────┐
│                                             │
│              ◆ Shop HQ                      │
│        Đăng nhập để quản lý đội ngũ         │
│                                             │
│   Email     [______________________]        │
│   Mật khẩu  [______________________] 👁      │
│                                             │
│   [        Đăng nhập        ]               │
│   Quên mật khẩu?                            │
│                                             │
└─────────────────────────────────────────────┘
```
- A centered card on a warm background with a soft pattern. Nothing else is visible until you log in.
- No sign-up link (only the boss account exists). Errors are generic: "Email hoặc mật khẩu không đúng".
- "Quên mật khẩu?" sends a Supabase reset email that redirects back to `#/reset-password`.
- The session persists (Supabase default). "Đăng xuất" is in the sidebar footer.

## 8. Settings
Language (Tiếng Việt / English) · Google Drive connection (connect / disconnect, connected account email) · account (change password, sign out) · system info (team online/offline, last heartbeat, contract version).

## Shared components
`EmployeeAvatar` · `StatusPill` · `StepDots` · `StepTimeline` · `LiveBadge` · `TeamOnlineIndicator` · `ShopChip` · `WorkflowIcon` · `TimeAgo` (ICT tooltip) · `CommandButton` (pending → applied / failed states) · `EmptyState` · `Skeleton`
