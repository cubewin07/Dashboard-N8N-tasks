# Stacked PR workflow

One branch per phase (or per sub-PR such as `p06a`), each based on the previous one. Each PR targets the branch below it. Any prefix of the stack builds and runs.

## 1. Tooling (decided)

| Option | Verdict |
|---|---|
| **Plain git ≥ 2.38 + `gh` CLI, with `git rebase --update-refs`** | **Chosen.** No extra service, account or install; every agent already has git and `gh`; `--update-refs` moves every branch in the stack in one rebase. git 2.54 is installed. |
| Graphite (`gt`) | Nice UX, but needs an account and its own sync model; agents would have to learn it. Revisit if the stack grows past ~20 open PRs. |
| git-town / spr / ghstack | Extra tool with its own conventions; no clear gain at 15 PRs. |

One-time setup (each clone):
```bash
git config --global rebase.updateRefs true     # every rebase moves stacked branches too
git config --global rerere.enabled true        # remember conflict resolutions across restacks
git config --global push.autoSetupRemote true
```

## 2. The stack

```
main
 └─ stack/p00-plan
     └─ stack/p01-foundation
         └─ stack/p02-building
             └─ stack/p03-engine-sim
                 └─ stack/p04-people
                     └─ stack/p05-office-life
                         └─ stack/p06a-env-assets
                             └─ stack/p06b-env-art
                                 └─ stack/p07a-char-assets
                                     └─ stack/p07b-characters
                                         └─ stack/p08a-wardrobe-assets
                                             └─ stack/p08b-wardrobe
                                                 └─ stack/p09-supabase
                                                     └─ stack/p10-boss-controls
                                                         └─ stack/p11-polish
```

Create a layer:
```bash
git switch stack/p02-building && git pull
git switch -c stack/p03-engine-sim
# … commits …
git push
gh pr create --base stack/p02-building --head stack/p03-engine-sim \
  --title "[P03] Work engine & simulator" --body-file .github/pr-bodies/p03.md --draft
```
PR body template: each phase file §7. Every PR body starts with a **stack map** (the list above with ✅ merged / 👉 this PR / ⏳ open) so reviewers know where they are.

## 3. Size rules

- Code PRs: aim for ≤ 1 500 changed lines excluding lockfiles, generated types and JSON content. If a phase grows past ~2 500, split it into `pNNa`/`pNNb` layers (record the split in the phase file).
- **Binary assets get their own PR** (`p06a`, `p07a`, `p08a`). These contain only `public/assets/**`, `art/**`, `scripts/**` (asset tooling) and `credits.json`. Reviewers check scripts, licences and the size report, and spot-check renders. The code PR above it is then small and readable.
- **No Git LFS** (decided): total `public/assets` budget is 30 MB, single files ≤ 1.5 MB (see `assets.md` §6). Low-poly GLBs with meshopt and a shared palette are small. LFS would add bandwidth quotas and `actions/checkout lfs: true` to Pages deploys for little gain. Blender sources are **Python generator scripts**, not `.blend` files. If a hand-authored `.blend` is ever unavoidable, it goes to `art/sources-blend/` **under LFS**, added in its own PR with `.gitattributes`. Revisit if `public/assets` passes 30 MB.

## 4. Working in parallel

The logical graph (`00-overview.md` §4) allows P02 ∥ P03 and P06 ∥ P07. To work in parallel:
1. Branch the parallel phase from the latest common ancestor (for P03: `stack/p01-foundation`).
2. When the lower phase's PR is ready, restack: `git switch stack/p03-engine-sim && git rebase stack/p02-building`, fix conflicts, re-run DoD, force-push with lease.
3. Open its PR against its stack position only after the restack.

## 5. When a lower PR changes (review fixes)

Review fixes are **new commits on the layer** (no amend, no force-push of that layer), so the old layer tip stays an ancestor and a plain rebase works. Example: `p02` got fix commits.
```bash
git fetch origin && git switch stack/p02-building && git pull --ff-only
git switch stack/p11-polish                  # the TOP of the stack (moves every layer above p02)
git rebase --update-refs stack/p02-building
# resolve conflicts once (rerere remembers), re-run DoD on each moved layer, then:
git push --force-with-lease origin $(git for-each-ref --format='%(refname:short)' 'refs/heads/stack/')
```
If a lower layer *was* rewritten (amended/squashed), use its old tip explicitly:
`git rebase --update-refs --onto stack/p02-building <old-p02-tip-sha> stack/p11-polish`.

Rules:
- Only the **owner of a layer** pushes to it. The restacker force-pushes upper layers with `--force-with-lease` and comments "restacked on <sha>" on each affected PR.
- After a restack every affected layer re-runs CI. A layer whose CI breaks because of the change below gets a fix commit on that layer, not below.
- Prefer fixing review feedback **in the layer where the code was introduced**, then restack. Don't patch it in a higher layer.

## 6. Reviewing

1. **Per layer:** the reviewing agent reviews the PR diff against its parent branch only (`gh pr diff N`), using the phase file's §8 checklist + `00-overview.md` §6 DoD. It runs the branch (`npm ci && npm run build && npm run preview`) and checks the demo. Verdict: approve / request changes with file:line comments.
2. **Whole stack (before merging starts, and again before P09 and P11):** a reviewer checks out the top branch and reviews `git diff main...stack/pNN-top` for:
   - integration problems (a later layer silently changing an earlier layer's behaviour),
   - contract changes not reflected in `contracts.md` / `data-model.md` version + changelog,
   - duplicated work (two helpers doing the same thing, e.g. two priority functions),
   - boundary violations (imports from `adapters/**`, domain using `Date.now()`),
   - perf budget and bundle size trend (`performance.md` §4 numbers per layer in PR bodies).
   Output: one comment on the top PR with findings mapped to the layer that should fix each.

## 7. Merging (bottom-up)

GitHub repo settings (human, once): enable **"Automatically delete head branches"**. With it on, merging a PR whose branch is the base of another PR **auto-retargets** the upper PR to the merged PR's base.

Merge procedure for the bottom PR (`stack/p00-plan` → `main`), then repeat upward:
1. Bottom PR approved + green → **Squash and merge** (keeps `main` history one commit per phase).
2. The next PR is auto-retargeted to `main`, but its branch still contains the *original* (un-squashed) commits of the merged layer, which would show up as duplicates or conflicts. Fix it:
   ```bash
   git fetch origin
   # rebase only the commits that belong to p01 (and, via --update-refs, everything above)
   TOP=stack/p11-polish          # whatever the current top layer is
   git rebase --update-refs --onto origin/main <sha-of-p00-tip-before-merge> $TOP
   git push --force-with-lease origin $(git for-each-ref --format='%(refname:short)' refs/heads/stack/)
   ```
   `<sha-of-p00-tip-before-merge>` is the last commit of the merged branch (`gh pr view <N> --json headRefOid -q .headRefOid`). Rebasing the **top** branch replays every layer's commits once, and `--update-refs` moves each intermediate `stack/*` branch to its new position. (Rebasing only `p01` would leave the layers above on the old commits.)
3. If auto-retarget did not happen: `gh pr edit <next> --base main`.
4. CI re-runs on the retargeted PR; merge it when green. Repeat.
5. `main` deploys to GitHub Pages on every merge, so each merge is a demo-able release.

Never merge a layer whose lower layer is unmerged. Never use "Rebase and merge" for layers that other branches depend on (it rewrites SHAs the same way squash does, with more commits to skip).

## 8. CI for stacked PRs

`.github/workflows/ci.yml` (P01-T02) runs on `pull_request` **for any base branch** (no `branches:` filter) and on `push` to `stack/**`: `npm ci`, typecheck, lint, test, build, e2e (Playwright, Chromium only), content/catalogue/licence validators (from the phase that adds them), bundle-size report as a job summary. `deploy.yml` stays `main`-only.
