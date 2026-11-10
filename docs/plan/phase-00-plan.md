# P00: Plan and audit

## 1. Goal and demo
Land the plan in `docs/plan/` as the single source of truth, then (after the boss approves the audit) archive the old plans and point every agent instruction file at `docs/plan/`.
**Demo after merge:** nothing changes in the app. `README.md`, `AGENTS.md` and `CLAUDE.md` all say "read `docs/plan/`"; `docs/archive/` holds the six old docs with a "superseded" banner.

## 2. Requirements
- **R1** `docs/plan/` contains: `00-overview.md`, `00-audit.md`, `data-model.md`, `contracts.md`, `assets.md`, `performance.md`, `testing.md`, `stacked-prs.md`, `after-this-phase.md`, `questions-and-assumptions.md`, and one `phase-NN-*.md` per layer listed in `00-overview.md` §4.
- **R2** Every phase file has the 9 sections of the format (§3.1 below) and task IDs `PNN-Tkk` (or `PNNa-Tkk`).
- **R3** No application code changes in this PR.
- **R4** After approval: old plans moved with `git mv` to `docs/archive/`, each with the superseded banner as its first line; nothing deleted except the merged branch `feat/mvp-ui`.
- **R5** After approval: `AGENTS.md`, `CLAUDE.md` and a new `README.md` say only `docs/plan/` is current.
- **R6** All internal links in `docs/plan/*.md` resolve (relative file names exist).

## 3. Specs
### 3.1 Phase file format (all phase files)
1. Goal and demo · 2. Requirements (numbered `R#`, testable) · 3. Specs · 4. Design choices (options → choice → reason → revisit-if) · 5. Tasks (`PNN-Tkk`: files, steps, acceptance; `∥` = can run in parallel) · 6. Dependencies (needs / later phases rely on) · 7. Branch and PR · 8. Review checklist · 9. Risks and open questions.

### 3.2 Archive banner (exact text)
```md
> **Superseded by [docs/plan/](../plan/00-overview.md) on 2026-11-10.** Kept for history only. Do not implement from this file. See docs/plan/00-audit.md for what was kept.
```

### 3.3 New `AGENTS.md` outline (P00-T05)
1. What this repo is (AI Office: 3D building + 2D fallback + Supabase config; simulator now, real AI later).
2. **Read before working: `docs/plan/00-overview.md`, then the phase file for your task. Only `docs/plan/` is current; `docs/archive/` is history.**
3. Stack (from `00-overview.md` §2.3).
4. Commands (add `test:e2e`, `content:validate`, `art:build`, `assets:check`).
5. Repo layout (from `00-overview.md` §2.4).
6. Hard rules: keep old 1, 2, 4, 5, 6, 7, 8, 10; rule 3 replaced by `contracts.md` §5; rule 9 replaced by "config is data in `src/content/` (seeded to Supabase from P09)"; add: boundary rule (`00-overview.md` §5.4), asset licence rule (§5.7), 3D rules (§5.5).
7. Working process: stacked PRs (`stacked-prs.md`), DoD (`00-overview.md` §6), stop at the end of each phase with a test checklist for the human.

## 4. Design choices
| Topic | Options | Choice | Reason | Revisit if |
|---|---|---|---|---|
| Where the plan lives | single big file · `docs/plan/` folder · GitHub issues | **folder of markdown files** | Agents read files offline; each phase file is one agent's brief; diffs review well | The boss wants to track progress in a board → mirror tasks as issues, keep files as source |
| Archiving | delete · move to `docs/archive/` · leave in place with banner | **move with banner** | History kept, no ambiguity about what is current | – |
| Old personas | drop · keep as seed | **keep names in the seed org** | Continuity for the family who already saw the MVP | Boss wants new names |

## 5. Tasks
- [ ] **P00-T01** Write the plan files (this PR's first commit set). *Files:* `docs/plan/*`. *Acceptance:* R1, R2, R6 (link check: `grep -o '\][(][^)]*[)]' docs/plan/*.md` targets exist).
- [ ] **P00-T02** Add the one-line banner at the top of `AGENTS.md` pointing to `docs/plan/` (done 2026-11-10, uncommitted, alongside the boss's own pending edits). *Acceptance:* first lines of `AGENTS.md` mention `docs/plan/`.
- [ ] **P00-T03** **Gate:** boss approves `00-audit.md` §4 (A0–A7), possibly with changes. Record the answer at the bottom of `00-audit.md` ("Approved on … with changes: …").
- [ ] **P00-T04** Archive (after T03). *Steps:* A0 (commit the boss's pending doc edits if approved) → `mkdir -p docs/archive` → `git mv docs/{PLAN,CONTRACT,EMPLOYEES,LAYOUT,MVP-NOTES,OPEN-QUESTIONS}.md docs/archive/` → prepend banner (§3.2) to each. *Acceptance:* `ls docs/*.md` is empty; each archived file starts with the banner; `git log --follow docs/archive/PLAN.md` shows history.
- [ ] **P00-T05** Rewrite `AGENTS.md` per §3.3, update `CLAUDE.md` (point to `docs/plan/`, drop the n8n paragraph, keep the skills list), add `README.md` (purpose, live URL, "current plan: `docs/plan/`", dev commands). *Acceptance:* `grep -rn "docs/PLAN.md\|docs/CONTRACT.md\|docs/LAYOUT.md\|docs/EMPLOYEES.md" AGENTS.md CLAUDE.md README.md docs/plan` returns nothing except mentions inside `00-audit.md`.
- [ ] **P00-T06** Delete merged branch `feat/mvp-ui` (A6) if approved. *Acceptance:* `git ls-remote --heads origin feat/mvp-ui` is empty.

## 6. Dependencies
- Needs: nothing.
- Everything later relies on: the phase list, the data model, the contracts, conventions and DoD.

## 7. Branch and PR
- Branch `stack/p00-plan` from `main`. PR base `main`. Title: `[P00] AI Office plan + audit of old plans`.
- Description template:
```md
<stack map>
## What
Plan for AI Office in docs/plan/ (no code). Audit of old plans in 00-audit.md.
## Needs your decision
- [ ] Approve audit actions A0–A7 (00-audit.md §4)
- [ ] Top questions (questions-and-assumptions.md §1)
## After approval this PR also
- archives old docs, rewrites AGENTS.md/CLAUDE.md, adds README.md
```

## 8. Review checklist
- [ ] Every vision requirement (sections 2–9 of the brief) maps to at least one requirement in a phase file (see `questions-and-assumptions.md` §3 traceability table).
- [ ] Phase order gives a visible result by P02 and moving people by P04.
- [ ] Each phase has tasks small enough for one agent, each with files, steps and an acceptance test.
- [ ] Data model and contracts are consistent across files (names: `OfficeEvent`, `OfficeFeed`, `ApprovalLevel`, `AppearanceV1`).
- [ ] No code in the diff. Nothing deleted or moved before T03.
- [ ] Links resolve.

## 9. Risks and open questions
- The boss may want a different phase order (e.g. wardrobe earlier for the sister). The stack allows moving P08 after P05 if P07 also moves; record the change in `00-overview.md` §4.
- The boss's pending doc edits are uncommitted; A0 decides where they go.
