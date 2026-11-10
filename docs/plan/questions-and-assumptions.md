# Questions and assumptions

## 1. Decisions (all questions are closed as of 2026-11-10)

"Boss" = answered by the boss. "Plan" = decided by the planner as the most sound default; each can be reopened, and the last column says what it would cost.

| # | Question | Decision | By | Cost of changing later |
|---|---|---|---|---|
| **Q1** | Simulator runs separately in each browser? | **Yes.** Same building, people and looks for everyone; fake activity differs per viewer | Boss | A shared sim needs a server process and `SupabaseFeed` early |
| **Q2** | Elevator only for work, stairs for idle leisure trips? | **Yes** | Plan | Director rule + a test in P04/P05 |
| **Q3** | Existing Supabase project? | **None.** P09 creates it (human steps in `phase-09-supabase.md`) | Boss | – |
| **Q4** | Worker runtime | **Dedicated worker service** (not n8n) | Boss | Only `after-this-phase.md` |
| **Q5** | Body bases | **Separate female and male bases**, shared skeleton, garments fitted per base | Boss | Every garment depends on it; frozen after P07a |
| **Q6** | What may the sister (stylist) change? | **Appearance of everyone**: boss avatars, fixed staff and temps. Nothing else. She sees names, roles and departments so she knows who she is dressing | Boss | RLS in P09 |
| **Q7** | People on screen | Design for ~40, test at **80** | Plan | Above ~150 the character rendering changes (P07b) |
| **Q8** | React 19 upgrade | **Yes**, in P01 (required by React Three Fiber 9 / drei 10) | Plan | Harder the later it happens |
| **Q9** | Boss avatar names, product type | "Giám đốc", "Phó giám đốc"; general household and fashion goods. All editable data | Plan | Seed/content only |
| **Q10** | Licences | **CC0 and CC-BY 4.0** with an in-app credits page; nothing else | Plan | CC0-only means more Blender generation |
| **Q11** | AI-generated models | **No.** Blender generator scripts instead (free, reproducible, licence-clean) | Plan | Asset phases could go faster with it |
| **Q12** | Shop names | Placeholders: Shopee 1–3, Lazada 1, TikTok Shop 1 | Plan | Seed only |
| **Q13** | Library / Google Drive screen | Code kept, hidden from navigation in P11, returns with real media | Plan | One nav item |
| **Q14** | Wardrobe earlier for the sister? | **No.** It needs real characters (P07) first | Plan | Reorders P06–P08 |

## 2. Assumptions

**Product**
1. The 3D building becomes the home screen; the MVP card dashboard is legacy and is removed in P11 once the new 2D screens cover it.
2. Two humans have the boss role (you and your dad); your sister has the stylist role. No public sign-up.
3. Vietnamese is the default language; English stays as a switch.
4. The stack is TypeScript, React, Vite, three.js through React Three Fiber + drei, and Zustand (confirmed by the boss), plus zod, TanStack Query, Tailwind/shadcn and Supabase.
4a. The seed company has 4 departments (CS, Marketing, Design, Accounting) with the hierarchy from the brief; the old 7 names are reused.
5. Approvals of a boss-level item pass every level on the way up at first (`every_level_up_to_required`), switchable in policy.
6. Boss approvals in this phase happen in the web app only (Telegram comes later).
7. "Dropped" temps are archived, keep their look and history, and can be restored. Core staff are never dropped.
8. Voice intake is represented as a flag on simulated messages; no real speech-to-text in this phase.
9. Platform icons are neutral placeholder badges, not real logos.
10. AI employees never leave the building; at night, non-24/7 departments rest on the leisure floors.

**Technical**
11. No Supabase project, migrations or real auth exist today (confirmed: no `supabase/` folder). The app must keep running with no backend (Local adapters), so CI and previews need no secrets.
12. GitHub Pages hosting, HashRouter and the `/Dashboard-N8N-tasks/` base path stay.
13. WebGL2 through three.js; WebGPU not used in this phase.
14. Blender is installed at `/Applications/Blender.app` and usable headless; P06a-T01 verifies the version.
15. Assets stay under 30 MB total, so no Git LFS.
16. Stacking uses plain git (`rebase --update-refs`, already enabled in this clone's git config) and the `gh` CLI; no extra tool to install.
17. Each PR is reviewed by an agent first; you merge bottom-up, with squash merges.
18. Real workers will be a dedicated service (decided); the n8n repo is not a dependency.
19. The boss's 5 uncommitted doc edits (5 shops on 3 marketplaces) are intended and will be committed (audit action A0).
20. Sim time runs 30× real time by default; all domain timestamps are feed time.

## 3. Traceability: brief → plan

| Brief section | Where it is planned |
|---|---|
| §0 Audit | `00-audit.md`, P00 |
| §1 Simulator now, real later, no rewrite | `00-overview.md` §2.1, `contracts.md`, P03, P11-T09, `after-this-phase.md` |
| §2 Building: floors per department, no limit, boss top, leisure floors, elevators/stairs, people as data | `data-model.md` §2.1, §2.9; P02 (layout, annexes), P04 (elevator, stairs), P10 (add department live) |
| §3 Hierarchy, tiers, core/temp + cap, specialties + cross-department help, all editable | `data-model.md` §2.2–2.5, §4; P03 (staffing, help), P10 (editing) |
| §4 Three approval levels, rules as data, priority queue with aging, piles and waiting seats | `data-model.md` §2.5–2.6; P03 (engine, queue screens), P05 (piles, seats), P10 (rules editor) |
| §5 Behaviour and visuals, platform badges, art style, camera modes, phone fallback | P02 (cameras), P04 (movement, follow), P05 (visual language, idle life), P06b (art), P01/P11 (fallback) |
| §6 Appearance customisation, sliders, per-employee storage, sister account | `data-model.md` §2.10–2.11; P07a/b, P08a/b, P09 (stylist login + RLS) |
| §7 Free assets, Blender, style guide, minimal manual work | `assets.md`; P06a, P07a, P08a |
| §8 Simulator: Vietnamese tasks, timings, handoffs, approvals, scenario buttons, removable | P03, P11-T09 |
| §9 After this phase + expensive-to-change list | `after-this-phase.md` |
| §10 Plan format | `phase-00-plan.md` §3.1, all phase files |
| §11 Stacked PRs | `stacked-prs.md`, each phase §7–§8 |
