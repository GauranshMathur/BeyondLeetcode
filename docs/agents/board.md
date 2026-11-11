# Board: planned work

Planned work starts as a **GitHub issue** and is done through **cards** on the GitHub Project board https://github.com/users/GauranshMathur/projects/1. The issue says what is wrong or wanted. Its cards say how it is done. Cards are draft items on the board, each linked to its issue both ways (see Issues are the unit of work). For the issue commands, see `issue-tracker.md`.

One orchestrator session runs the board with `/orchestrate` and dispatches workers (`card-designer`, `card-builder`). The orchestrator also calls the `sprint-planner` agent (see Planning). Workers never dispatch other agents.

## State lives on GitHub

Work can stop at any moment and resume from any machine with a local clone, so nothing that matters stays local:

- **Progress** is the board (Status, Sprint, Owner) plus, for code, the card's draft PR. The maintainer reads both from anywhere.
- **Work in progress** is pushed: a code card's branch is pushed and its draft PR opened on the first commit, and every commit after that is pushed. A design card publishes to the canvas after each card. A worktree is a disposable local copy of the branch, never the only copy.
- **Plans** are written where the next session will look: the card body (`Blocked:` lines) and the PR description's checklist. Session memory is lost on stop.
- **The maintainer steers from the board.** Moving a card between columns or sprints, editing its body, or clearing its Owner takes effect on the next round; the orchestrator re-reads the board every round and caches nothing.
- **One orchestrator at a time.** Any In Progress card whose worker is not running belongs to the next orchestrator to resume.

## Issues are the unit of work

The maintainer's rule since 2026-11-10 (#591): every card belongs to an issue. That covers bugs, `architecture` findings, accessibility and docs findings, and enhancements. No finding is closed as `wontfix` because it is only a refactor: it stays an issue and waits in the Backlog (the maintainer's decision, 2026-11-11).

1. **Intake.** Every open issue has a ticket on the board. Triage (`triage-labels.md`) ends by creating it:
   - The ticket is a draft item titled `[#N] <the issue's title>`. Its body starts `From #N.` and has a `Refs #N` line. Its `Issue` field is N, its Status is **Backlog**, and it has no Sprint, Release or Owner.
   - Each round, the orchestrator lists the open issues and creates the ticket of any that has none.
   - The content reviews (`ready-for-human`) and the MVP1 spec (#24) get a ticket too, so the board shows them. They are the maintainer's: no agent starts them, and they get no milestone and no cards.
   - An issue waiting on the maintainer keeps `needs-triage` or `needs-info`, and its ticket stays in the Backlog.
2. **Work later.** A Backlog ticket is not started, and it does not change the sprint in progress. The `sprint-planner` pulls from the Backlog when it plans the next sprints (see Planning), by priority:
   - first bugs and security problems, then what a planned card depends on, then everything else, oldest first;
   - the maintainer can reorder the Backlog column, and the planner follows that order.

   When the planner cuts an issue into cards, it archives the issue's Backlog ticket: the cards take its place. The issue then carries the GitHub milestone of the sprint whose card closes it. A milestone is named exactly like that sprint's Sprint option, for example `Sprint 18 · Submission, Runner and Identity seams`.
3. **The exception: critical work joins the current sprint at once.** Critical means one of these:
   - a bug that hurts users;
   - a security problem;
   - a broken CI or release;
   - a dependency: something a planned card cannot be built without.

   The orchestrator has the planner cut it into cards in the current sprint, and they run in the next round. Everything else waits for its sprint.
4. **Cut into cards.** The `sprint-planner` cuts each issue into cards that say how it is done (see Planning). A card serves one issue. Where one change completes two, the card's `Issue` field holds the one it is mainly for, and its `Refs` line names both.
5. **Link both ways.**
   - **The card.** The board's `Issue` field holds the issue number, and the body has a `Refs #N` line.
   - **The PR.** Its body has `Refs #N`, and only the issue's last card's PR also has `Closes #N`. GitHub ignores negation, so "does not close #N" closes #N. Never put `close`, `closes`, `fix`, `fixes` or `resolves` before an issue number the PR does not close. Write "#N stays open".
   - **The issue.** It has one comment that starts `Cards:`. The comment lists the issue's cards in order, says which lanes they run in, and names the last card. The planner writes it. Whoever adds or splits a card edits that comment rather than adding another.
   - **The plan.** Each sprint's section in `docs/sprints.md` lists issue → cards.
6. **Close.** An issue closes only when its last card merges. A PR that closes one early is a mistake: reopen the issue.
7. **Count.** Every sprint report, and the sprint's exit check, counts issues closed as well as cards done.

The sprint's last card (`docs/releasing.md`, The last card) is the one card with no issue. Its `Issue` field is empty.

## Cards

A title reads `[CODE] Area: what`. The prefix names the canvas page (`F`, `P`, `R`, `A`, `AD`, `AC`, `S`; see `design-canvas.md`). Code cards use `C`.

A body has six parts, plus a `Batch:` line on a small card. The board's `Issue` field holds the issue number:

```
From #N. <what to change, 1–3 lines>
Refs #N
Files: <the files this card edits>
Done when: <one observable line>
Blocked by: <card codes that must be Done first, or none>
Release: <Release option> · commit type <type>
Batch: <lane>          (small cards only: see Small cards share a PR)
```

Code cards cut from the spec by `to-tickets` carry `Blocked by:`; a card is ready only when every card it names is Done. Every card gets its sprint's Release when it is filed (one Release per sprint: `docs/releasing.md`). Which commit type a card uses: see Commit types below.

**Size.** A card is one artboard or one state (code: one PR touching one area), one lane, one `Done when` line. A card that needs two is split: remove the parent and create children with suffixed codes (`P8` → `P8a`, `P8b`), each with its own `Done when`. Only the `sprint-planner` splits, called by the orchestrator.

**Small cards share a PR** (the maintainer's rule, 2026-11-10). Some cards are small: they are expected to change fewer than about 15 lines, or to change only comments or docs. The planner marks each one with a `Batch: <lane>` line. All of a lane's small cards in a sprint go into **one PR per lane per sprint**, built in lane order in one round:
- Its title names every code: `fix(beyondleetcode): C301, C305, C309 <what they share>`. It takes the most user-visible type among the cards (`feat`, then `fix`, then the rest).
- Its body has one `Refs #N` line per issue, a `Closes #N` for each issue whose last card is in the batch, and one `Changelog:` line per card that has one.
- It gets the review any of its cards needs.
- Each card goes Done when that PR merges.

One card per PR stays the rule for every other card.

## Commit types

A card's PR title uses the type that matches what a user sees. The type is filed on the card (`Release: ... · commit type <type>`).

| Type | Use it for |
| --- | --- |
| `feat` | A user-visible feature only. |
| `fix` | A user-visible fix, and hardening or security fixes. |
| `test`, `ci`, `docs`, `refactor`, `build` | Everything else. |
| `chore` | Everything else that needs no changelog entry (hidden from the changelog). |

**The sprint sets the version, not the commit.** One release per sprint (`docs/releasing.md`): the `sprint-planner` picks the version when it plans the sprint, the next minor if any of its cards is `feat` and the next patch otherwise, and the sprint's last card sets it with a `Release-As` footer. release-please still proposes a version from the commit types, but nothing ships until the sprint's exit, and the footer overrides its proposal. The type then decides where the card's Changelog line goes in the release's changelog (`docs/release-notes-template.md`).

**Content PRs.**

- A PR that adds a Topic is `feat`.
- Chapters or Problems added inside a Topic not yet in any release are `chore(content)` or `docs`.
- Chapters or Problems added to a Topic that has already shipped in a release are user-visible, so they are `feat`. (The orchestrator's reading of the maintainer's rule; flagged for the maintainer.)
- A content fix a learner would notice (a wrong test, a broken citation) is `fix`.

**Changelog line.** Every card PR's description ends with `Changelog: <one short sentence a user would understand>`, or `Changelog: none` for internal work. The orchestrator builds each release's notes from these lines (`docs/release-notes-template.md`). `.github/pull_request_template.md` carries the field. Never add a `Release-As` footer: only the orchestrator does, on the sprint's last card.

## Planning

The orchestrator calls the `sprint-planner` agent (`.claude/agents/sprint-planner.md`) at the start of every sprint that has no plan, to plan the Backlog into sprints by priority (Issues are the unit of work, Work later), to cut a critical issue into the current sprint, and for every card a worker or the orchestrator flags as too big. The planner checks its plan before filing it, and reports each result:

- A sprint is one coherent theme drawn from the open issues, typically 12 to 25 cards, with testable exit criteria. Cards stay small; sprints are long.
- Each card is one PR touching one area, and has a `Done when`.
- Cards that share a file are an ordered chain in one lane, planned up front.
- One Release per sprint: every card has its sprint's Release, whose version the planner picks now, and the sprint's last card carries `Release-As` (`docs/releasing.md`).

- It plans issue first. For each issue it gives the sprint, the cards, their order, the lane conflicts, the risks and the acceptance check.

It writes each sprint's section in `docs/sprints.md`, the Sprint option row in the Fields table, and, in `docs/releasing.md`, each sprint's Release option and its row in Planned releases, all through one plan PR that the orchestrator reviews and merges at green CI. It also does the following, and never claims or dispatches a card:
- creates the cards with Status Todo, Sprint, Release and `Issue` set;
- gives each issue its sprint's milestone;
- writes each issue's `Cards:` comment.

**The planner runs on the latest Fable model.** Its definition sets `model: fable` (2026-11-10). After each planner run, the orchestrator checks the planner's sub-agent log for the model it ran on, and says so in its report.

**The orchestrator reviews each sprint's plan before the sprint starts.** It checks the plan against the rules above and against the code. Then:
- it has the planner split any card that is too big or that touches files shared with another lane;
- it resolves lane conflicts by ordering cards into one lane;
- it sends back to the planner anything wrong, with the reason. Examples: a card with no issue or `Refs`, an issue in no sprint, a missing `Done when`, a wrong file.

The planner revises its own plan. The orchestrator does not replan from scratch.

A new Sprint option, or a new Release option `R vX.Y.Z: Sprint N · <Theme>`, is added with `updateProjectV2Field`. That mutation replaces the whole option list, so every existing option is resent with its id; count the cards per option before and after, and they must match.

## Fields

| Field | ID | Values |
|---|---|---|
| Status | `PVTSSF_lAHOAm0pms4Bk1LBzhjkTMw` | Backlog `7c82888f` (an issue's ticket, not started) · Todo `f75ad846` · In Progress `47fc9ee4` · Done `98236657` |
| Sprint | `PVTSSF_lAHOAm0pms4Bk1LBzhjlFwI` | 0 `3ad2db80` · 1 `ec5cba1c` · 2 `9bd8950b` · 3 `bc546063` · 4 `42ff5017` · 5 `420a1181` · 6 `b06bc1b7` · 7 `0738df2b` · 8 `4f7b943d` · 9 `2d37a7f3` · 10 `c4925fcc` · 11 `2e87bf36` · 12 `5a6498ca` · 13 `7014a845` · 14 `ebb2e444` · 15 `2365b98c` · 16 `447f928f` · 17 `92c82f88` · 18 `3324fd3e` · 19 `49a0f9e3` · 20 `7234eeee` · 21 `38b5a7b2` · 22 `66687a0a` · 23 `ac674312` |
| Release | `PVTSSF_lAHOAm0pms4Bk1LBzhniiDY` | one per sprint, `R vX.Y.Z: Sprint N · <Theme>`: R v1.19.0: Sprint 13 · Foundations `5eb8b28c` · R v1.19.1: Sprint 14 · Identity `528cefdd` · R v1.19.2: Sprint 15 · Screens and phones `acb16cb6` · R v1.19.3: Sprint 16 · Languages and the Learning core `07c751bf` · R v1.19.4: Sprint 17 · Runner and CI hardening `ece5dfa8` · R v1.19.5: Sprint 18 · Submission, Runner and Identity seams `d6739981` · R v1.19.6: Sprint 19 · Accessibility `ba3b24a7` · R v1.19.7: Sprint 20 · Drifted rules and docs `41225006` · R v1.19.8: Sprint 21 · Unplanned `647d8bbc` · R v1.19.9: Sprint 22 · Unplanned `30fe09ec` · R v1.19.10: Sprint 23 · Unplanned `59e6d8b2` |
| Owner | `PVTF_lAHOAm0pms4Bk1LBzhjlEXM` | text: the worker name holding the card |
| Issue | `PVTF_lAHOAm0pms4Bk1LBzhpSyzM` | number: the issue the card is for (empty only on a sprint's last card) |

Project ID `PVT_kwHOAm0pms4Bk1LB`, number `1`, owner `GauranshMathur`. What each sprint is for: `docs/sprints.md`.

```bash
# Todo cards in a sprint, with owner
gh project item-list 1 --owner GauranshMathur --limit 500 --format json \
  --jq '.items[] | select(.status=="Todo" and .sprint=="Sprint 1 · Design foundations") | {id, title, owner, body: .content.body}'

# Set a single-select field (Status, Sprint or Release)
gh project item-edit --project-id PVT_kwHOAm0pms4Bk1LB --id <item-id> \
  --field-id <field-id> --single-select-option-id <option-id>

# Set a card's Issue
gh project item-edit --project-id PVT_kwHOAm0pms4Bk1LB --id <item-id> \
  --field-id PVTF_lAHOAm0pms4Bk1LBzhpSyzM --number <issue number>

# Give an issue its sprint's milestone (REST; the milestone's number, not its title)
gh api 'repos/GauranshMathur/BeyondLeetcode/milestones?state=all' --jq '.[] | "\(.number) \(.title)"'
gh api -X PATCH repos/GauranshMathur/BeyondLeetcode/issues/<issue> -F milestone=<milestone number>

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

Cards that edit the same file share a **lane** and run in order; cards on different files run in parallel lanes, at most two at once (see Resources). All `F` cards edit Foundations, so they form one lane and finish before any card that uses what they add.

## Resources

The VPS has 8 GB of RAM and 2 CPUs. On 2026-11-05 at 04:17 UTC an out-of-memory kill took down every session on it. The maintainer's rule since then:

- **At most two card-builders run at once.** The orchestrator plans each round as two lanes; other ready cards wait for a free lane.
- **Heavy local jobs run one at a time, and only when a card needs them.** Otherwise CI runs them. They are Playwright e2e, docker image builds, the full sandbox suite, and `bun run build` or a full test run with every worker. Each one runs under the shared heavy lock.
- **Few test workers.** Locally, a worker runs only the tests its card touches, with at most two workers (`bunx vitest run <file> --maxWorkers=2`).
- **One container at a time.** A worker's own Docker experiments run one container at a time, at the Runner's limits (`runner/config.ts`: 256 MB, 64 pids) unless the card says otherwise.
- **The orchestrator's session is capped at 5 GB** and slows down at 4 GB.
- **Exit 137 is memory pressure.** A command killed with exit 137, or a builder that dies with it, is rerun alone, and the event is noted below.

Noted events:
- **2026-11-05, 04:17 UTC.** C201's teardown probes ran 20 fork-bomb containers at once, each allowed 2 GB, from 04:15 to 04:17:36. Docker's events show other containers dying at 04:17:31. Every session on the host was lost, and the tmux server was restarted. C201 then resumed with one container at a time at the Runner's limits.

## Done when

A worker moves its own card to Done once the card's type bar is met. Owner stays set, as the record of who did it.

**Design card**
- The `Done when` line holds on the canvas.
- Light and dark both render from `tokens()`; a new artboard ships with its `-dark` wrapper.
- Only Foundations patterns are used.
- New artboards (file, width, height, page) are reported to the orchestrator, who updates `canvas.json` and the STATUS sticky.

**Code card**
1. **Branch.** If the branch `<code>-<slug>` already exists on origin, you are resuming: check it out and read its draft PR checklist. Otherwise create it: `git worktree add ../BeyondLeetcode.worktrees/<code> -b <code>-<slug> origin/main`.
2. **Draft PR.** On the first commit, push and open `gh pr create --draft` with the card code in the title (`feat(beyondleetcode): P8 run/submit states`), the card's `Refs #N` line, and a checklist of the steps left. Push every commit after that and tick the checklist as you go. The body ends with `Closes #N` only when the card says it is the issue's last card.
3. Build test-first with `mattpocock-skills:tdd`.
   - **Before writing new code**, check whether an existing module in the repo, the standard library or the platform (Bun, Node, SvelteKit, the browser, Docker) already does it. Use that instead.
   - **No card or issue ids in code comments** (`(C198)`, `#482`). A comment gives its reason in its own words. The card and issue belong in the commit message and the PR body.
4. Review your own diff once against the card's decisions and the repo's standards (workers cannot dispatch the sub-agents `mattpocock-skills:code-review` uses, so do not claim that review ran), then get the independent check, a Codex second opinion: run only the Codex half of `codex-headless:advise` (read-only `codex exec`), never its Fable subagent, and never wait on a Fable verdict. Fix what they find or record why not in the PR body. Codex helps; it does not gate: where it is not installed or out of quota, skip it and say so in the PR.
   - **Skip it for low-risk diffs:** test-only, docs-only or styling-only changes, unless they touch `src/lib/server/runner/`, `src/lib/server/learning/` or `.github/`.
   - **Send the diff, not the repo:** pipe `git diff origin/main...HEAD` on stdin, with the list of changed files and the three to five rules from the card, `CONTEXT.md` or `docs/module-map.md` that the diff must uphold. Tell Codex to open another file only when a specific finding needs it.
   - **Fixed answer shape:** one line per finding, `severity · file:line · what goes wrong (inputs → wrong result) · fix`, or `no findings`. Capture only the final message (`-o <file>`).
5. Mark the PR ready, wait for CI green (over REST: `gh run watch <run-id> --exit-status --interval 60`, since GraphQL polling is shared with the release token), squash-merge, remove the worktree and delete the local branch, then move the card to Done.

A card touching the code runner or its container flags also gets a `sandbox-security-reviewer` pass before merge. Only the orchestrator can dispatch it: the worker stops at green CI, reports "ready for security review", and the orchestrator runs the review and merges.

Your report says which reviews ran and which did not; the orchestrator passes that on to the maintainer.

## Blocked

When a worker cannot finish (a decision nobody has made, a missing Foundations pattern, a second publish conflict):

1. Append `Blocked: <the question, one line>` to the card body.
2. Leave it In Progress with its Owner.
3. Report the question to the orchestrator, who asks the maintainer. Guessing a product decision is never the way through.

## After a major feature

When a sprint's feature lands and is released, a separate Claude session runs `mattpocock-skills:improve-codebase-architecture` over what was built and writes a report (the maintainer's rule, 2026-11-08). The orchestrator never runs it itself.

**Every finding is an issue** (the maintainer's decision, 2026-11-11, which replaces the 2026-11-10 rule that filed only bugs, security problems and blockers). The review may file freely. Given the report, the orchestrator:
- compares each finding with the open and closed issues;
- files what is missing, as `architecture` issues linking the files involved, and triages them;
- adds a finding that extends an open issue to that issue as a comment;
- gives each new issue its Backlog ticket (Issues are the unit of work, Intake).

A finding that is critical joins the current sprint (Issues are the unit of work, the exception). Every other finding waits in the Backlog for the planner. Nothing is closed as `wontfix` for being only a refactor.
