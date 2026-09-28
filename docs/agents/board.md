# Board: planned work

Planned work lives as **cards** on the GitHub Project board https://github.com/users/GauranshMathur/projects/1. Cards are draft items on the board, never repo issues. GitHub Issues stay for incoming requests (content, bugs) and for `architecture` findings; see `issue-tracker.md`.

One orchestrator session runs the board with `/orchestrate` and dispatches workers (`card-designer`, `card-builder`). Workers never dispatch other agents.

## State lives on GitHub

Work can stop at any moment and resume from any machine with a local clone, so nothing that matters stays local:

- **Progress** is the board (Status, Sprint, Owner) plus, for code, the card's draft PR. The maintainer reads both from anywhere.
- **Work in progress** is pushed: a code card's branch is pushed and its draft PR opened on the first commit, and every commit after that is pushed. A design card publishes to the canvas after each card. A worktree is a disposable local copy of the branch, never the only copy.
- **Plans** are written where the next session will look: the card body (`Blocked:` lines) and the PR description's checklist. Session memory is lost on stop.
- **The maintainer steers from the board.** Moving a card between columns or sprints, editing its body, or clearing its Owner takes effect on the next round; the orchestrator re-reads the board every round and caches nothing.
- **One orchestrator at a time.** Any In Progress card whose worker is not running belongs to the next orchestrator to resume.

## Cards

A title reads `[CODE] Area: what`. The prefix names the canvas page (`F`, `P`, `R`, `A`, `AD`, `AC`, `S`; see `design-canvas.md`). Code cards use `C`.

A body has three parts:

```
<what to change, 1–3 lines>
Files: <the files this card edits>
Done when: <one observable line>
Blocked by: <card codes that must be Done first, or none>
```

Code cards cut from the spec by `to-tickets` carry `Blocked by:`; a card is ready only when every card it names is Done.

**Size.** A card is one artboard or one state, one lane, one `Done when` line. A card that needs two is split: remove the parent and create children with suffixed codes (`P8` → `P8a`, `P8b`), each with its own `Done when`. Only the orchestrator splits.

## Fields

| Field | ID | Values |
|---|---|---|
| Status | `PVTSSF_lAHOAm0pms4Bk1LBzhjkTMw` | Todo `f75ad846` · In Progress `47fc9ee4` · Done `98236657` |
| Sprint | `PVTSSF_lAHOAm0pms4Bk1LBzhjlFwI` | 0 `3ad2db80` · 1 `ec5cba1c` · 2 `9bd8950b` · 3 `bc546063` · 4 `42ff5017` · 5 `420a1181` |
| Owner | `PVTF_lAHOAm0pms4Bk1LBzhjlEXM` | text: the worker name holding the card |

Project ID `PVT_kwHOAm0pms4Bk1LB`, number `1`, owner `GauranshMathur`. What each sprint is for: `docs/sprints.md`.

```bash
# Todo cards in a sprint, with owner
gh project item-list 1 --owner GauranshMathur --limit 200 --format json \
  --jq '.items[] | select(.status=="Todo" and .sprint=="Sprint 1 · Design foundations") | {id, title, owner, body: .content.body}'

# Set a single-select field (Status or Sprint)
gh project item-edit --project-id PVT_kwHOAm0pms4Bk1LB --id <item-id> \
  --field-id <field-id> --single-select-option-id <option-id>

# Set Owner (claim) / clear it (release)
gh project item-edit --project-id PVT_kwHOAm0pms4Bk1LB --id <item-id> \
  --field-id PVTF_lAHOAm0pms4Bk1LBzhjlEXM --text "<worker>"
gh project item-edit --project-id PVT_kwHOAm0pms4Bk1LB --id <item-id> \
  --field-id PVTF_lAHOAm0pms4Bk1LBzhjlEXM --clear

# New card (then set Status Todo and its Sprint)
gh project item-create 1 --owner GauranshMathur --title "[CODE] Area: what" --body "..."
```

## Claim

**Owner is the lock.** A card with an Owner belongs to that worker; nobody else touches it. The orchestrator claims before dispatch: set Owner, then Status In Progress. Re-read the card after writing; if another Owner landed first, drop it and pick again.

## Lanes

Cards that edit the same file share a **lane** and run in order; cards on different files run in parallel lanes, as many as there are. All `F` cards edit Foundations, so they form one lane and finish before any card that uses what they add.

## Done when

A worker moves its own card to Done once the card's type bar is met. Owner stays set, as the record of who did it.

**Design card**
- The `Done when` line holds on the canvas.
- Light and dark both render from `tokens()`; a new artboard ships with its `-dark` wrapper.
- Only Foundations patterns are used.
- New artboards (file, width, height, page) are reported to the orchestrator, who updates `canvas.json` and the STATUS sticky.

**Code card**
1. **Branch.** If the branch `<code>-<slug>` already exists on origin, you are resuming: check it out and read its draft PR checklist. Otherwise create it: `git worktree add ../BeyondLeetcode.worktrees/<code> -b <code>-<slug> origin/main` (see `superpowers:using-git-worktrees`).
2. **Draft PR.** On the first commit, push and open `gh pr create --draft` with the card code in the title (`feat(beyondleetcode): P8 run/submit states`) and a checklist of the steps left. Push every commit after that and tick the checklist as you go.
3. Build test-first with `mattpocock-skills:tdd`.
4. Review the diff with `mattpocock-skills:code-review` and `codex-headless:advise`; fix what they find or record why not in the PR body. Where the Codex CLI is not installed, `advise` runs its Fable half only; say so in the PR.
5. Mark the PR ready, wait for CI green (`gh pr checks --watch`), squash-merge, remove the worktree (`superpowers:finishing-a-development-branch`), then move the card to Done.

A card touching the code runner or its container flags also gets a `sandbox-security-reviewer` pass before merge.

## Blocked

When a worker cannot finish (a decision nobody has made, a missing Foundations pattern, a second publish conflict):

1. Append `Blocked: <the question, one line>` to the card body.
2. Leave it In Progress with its Owner.
3. Report the question to the orchestrator, who asks the maintainer. Guessing a product decision is never the way through.

## After a major feature

When a sprint's feature lands, the orchestrator runs `mattpocock-skills:improve-codebase-architecture`. Each finding worth doing becomes a GitHub issue labelled `architecture` + `needs-triage`, linking the files involved.
