# Board: planned work

Planned work starts as a **GitHub issue** and is done through **cards** on the GitHub Project board https://github.com/users/GauranshMathur/projects/1. The issue says what is wrong or wanted. Its cards say how it is done. Cards are draft items on the board, each linked to its issue both ways (see Issues are the unit of work). For the issue commands, see `issue-tracker.md`.

The process has three levels (the maintainer's reconfiguration, 2026-11-14; see Roles): the **principal** gives direction, one **orchestrator** session runs a sprint with `/orchestrate`, and the workers it dispatches cut, build and review the cards. Workers never dispatch other agents, and only the orchestrator merges.

## Roles

| Role | Model | It does | It never does |
|---|---|---|---|
| `principal` | fable | Direction only, WHAT and WHY at a high level. Files issues (from `docs/product/mvp1.md` for product work not yet built, and from its review of each finished sprint). Keeps the Backlog in priority order. Answers design questions sent up the ladder, each as an ADR in `docs/adr/`. Audits each released sprint and reports to the maintainer what it got wrong. | Plans a sprint, writes a card, writes code |
| orchestrator (the `/orchestrate` session) | opus | Runs one sprint from start to release. Constructs the sprint from the top of the Backlog, picks the release version, has the card-writer cut the cards and checks them, dispatches every lane at once, runs the reviews, sets the labels, merges, cuts the release. The only one that merges. | Writes code |
| `card-writer` | opus | Owns HOW. One run per issue: reads the issue and the code and writes the cards (Cards). Sends an issue that is too vague or too big back to the principal, with the reason. | Changes what the issue asks for; edits the repository |
| `card-builder` | sonnet | Builds exactly its lane's cards, test-first, pushing every commit. Stops at green CI and reports "ready for review". | Merges; edits a file outside its cards' `Files`; decides anything beyond names and internal structure |
| `card-reviewer` | opus | Read-only. A fresh run per PR that has seen none of the building. Checks the diff against the card: `Done when`, `Rules`, tests, files. Pass or fail, one line per finding: severity · file:line · what goes wrong · fix. | Edits, labels or merges |
| `sandbox-security-reviewer` | opus | Read-only. Reviews changes to the code runner against its checklist: the real Sandbox images, the harness, the seccomp filter, the core limit. | Edits |
| `card-designer` | sonnet | Works a design lane on the canvas (`design-canvas.md`). It is not a builder and does not count toward `MAX_BUILDERS`. | Edits `canvas.json`; writes code |

The definitions are in `.claude/agents/`, and the orchestrator's steps in `.claude/skills/orchestrate/SKILL.md`. An issue says what is wanted, why, and how we will know it is done; it does not say how. The principal's Backlog order is binding on the orchestrator. Product issues and issues the maintainer filed sit above findings, unless a finding is a bug or a security problem.

**The flow:**

1. The principal keeps the Backlog ordered and high level.
2. The orchestrator constructs the sprint from the top of it.
3. The card-writer cuts the cards; the orchestrator checks them.
4. The orchestrator dispatches every lane at once.
5. A card-builder builds and stops at green CI.
6. A card-reviewer passes or fails; the security reviewer where the review tier needs it.
7. The orchestrator labels and squash-merges.
8. The last card: exit check, release, archive the sprint.
9. The principal audits the sprint and files issues. Back to 1.

**One GitHub account.** Every agent pushes, labels and merges as `GauranshMathur`, the maintainer's account, so GitHub cannot tell a builder from a reviewer or from the maintainer. The review gate (Review tiers) therefore rests on the orchestrator setting labels honestly, and `human-verified` on no agent setting it.

## State lives on GitHub

Work can stop at any moment and resume from any machine with a local clone, so nothing that matters stays local:

- **Progress** is the board (Status, Sprint, Owner) plus, for code, the card's draft PR. The maintainer reads both from anywhere.
- **Work in progress** is pushed: a code card's branch is pushed and its draft PR opened on the first commit, and every commit after that is pushed. A design card publishes to the canvas after each card. A worktree is a disposable local copy of the branch, never the only copy.
- **Plans** are written where the next session will look: the card body (`Blocked:` lines) and the PR description's checklist. Session memory is lost on stop.
- **The maintainer steers from the board.** Moving a card between columns or sprints, editing its body, or clearing its Owner takes effect the next time the orchestrator reads the board; it re-reads the board before every dispatch and merge and caches nothing.
- **One orchestrator at a time.** Any In Progress card whose worker is not running belongs to the next orchestrator to resume.

## Tiers

Every open issue has one tier (the maintainer's standing rule, 2026-11-14). The four tiers, as the maintainer wrote them:

- Tier 0 critical fixes: bugs that hurt users, security problems, broken CI or release.
- Tier 1 priority: the maintainer's new items, accessibility that blocks users, and anything that unblocks them.
- Tier 2 normal work.
- Tier 3 refactors and tidy-ups, drawn from only when a sprint has room.

These tiers rank **issues**. They are not the four **review tiers**, which say which labels a pull request needs before it merges (Review tiers).

How they are used:

1. **A tier is assigned at intake**, with a one-line reason, before the issue gets its ticket. The issue carries the label `tier-0`, `tier-1`, `tier-2` or `tier-3` (exactly one), and its ticket and every card cut from it carry the same value in the board's `Tier` field (Fields). A card takes its issue's tier.
2. **Whoever files an issue proposes its tier.** That covers the architecture review (After a major feature), a worker's finding, a security reader and the orchestrator. The proposal and its reason go in the issue body; triage confirms or changes it.
3. **A Tier 0 issue is pulled into the current sprint at once** (Issues are the unit of work, the exception). Tiers 1 to 3 wait in the Backlog.
4. **The Backlog is ordered strictly by tier**, by the principal: every Tier 0 issue, then Tier 1, then Tier 2, then Tier 3. Inside a tier, product issues and issues the maintainer filed sit above findings, unless a finding is a bug or a security problem; then by the maintainer's priorities (user-facing product quality and correctness first, then learning content, then hardening that blocks something, refactors last) and by value to the learner, risk (security, data loss, correctness), dependencies (what unblocks what) and effort. A dependency a planned card cannot be built without takes the tier of the card it unblocks: that is Tier 1's "anything that unblocks them". The orchestrator constructs each sprint from the top of that order, so Tier 3 is drawn from only when a sprint has room.
5. **The principal re-orders** at the start of every sprint, and whenever a Tier 0 issue arrives.
6. **Two tests for a tier:** an accessibility issue is Tier 1 only if it blocks users; a refactor is Tier 3. A flaky test that has failed on main once is Tier 2; twice, it is Tier 0.
7. **Reports show the tiers.** Every report, every sprint's section in `docs/sprints.md` and every sprint's exit Status give the tier mix (cards per tier) and the issues closed per tier. `docs/sprints.md` holds the ranking table: every open issue with its tier, its reason and its sprint.

The maintainer's own issues (the content reviews and the spec) have a tier too, so the ranking shows them; no agent starts them.

## Issues are the unit of work

The maintainer's rule since 2026-11-10 (#591): every card belongs to an issue. That covers bugs, `architecture` findings, accessibility and docs findings, and enhancements. No finding is closed as `wontfix` because it is only a refactor: it stays an issue and waits in the Backlog (the maintainer's decision, 2026-11-11).

1. **Intake.** Every open issue has a tier and a ticket on the board. Triage (`triage-labels.md`) assigns the tier first, with its one-line reason (Tiers), and ends by creating the ticket:
   - The ticket is a draft item titled `[#N] <the issue's title>`. Its body starts `From #N.` and has a `Refs #N` line. Its `Issue` field is N, its `Tier` field is the issue's tier, its Status is **Backlog**, and it has no Sprint, Release or Owner.
   - At the start of a sprint, and whenever it reads the board, the orchestrator lists the open issues, gives a tier to any that has none, and creates the ticket of any that has none.
   - The content reviews (`ready-for-human`) and the MVP1 spec (#24) get a ticket too, so the board shows them. They are the maintainer's: no agent starts them, and they get no milestone and no cards.
   - An issue waiting on the maintainer keeps `needs-triage` or `needs-info`, and its ticket stays in the Backlog.
2. **Work later.** A Backlog ticket of Tier 1, 2 or 3 is not started, and it does not change the sprint in progress. The principal keeps the Backlog column in priority order (Tiers), and the orchestrator constructs the next sprint from the top of it (Constructing a sprint). The maintainer can reorder the Backlog column or change a tier, and both follow that.

   When the card-writer cuts an issue into cards, it archives the issue's Backlog ticket: the cards take its place. The issue then carries the GitHub milestone of the sprint whose card closes it. A milestone is named exactly like that sprint's Sprint option, for example `Sprint 18 · Submission, Runner and Identity seams`.
3. **The exception: Tier 0 joins the current sprint at once.** Tier 0 is a bug that hurts users, a security problem, or a broken CI or release. So does a dependency: something a planned card of the current sprint cannot be built without (Tiers, "anything that unblocks them").

   The orchestrator has the card-writer cut it into cards in the current sprint, as a lane of its own that starts as soon as a builder slot is free. Everything else waits for its sprint.
4. **Cut into cards.** The `card-writer` cuts each issue into cards that say how it is done (Cards). A card serves one issue. Where one change completes two, the card's `Issue` field holds the one it is mainly for, and its `Refs` line names both.
5. **Link both ways.**
   - **The card.** The board's `Issue` field holds the issue number, and the body has a `Refs #N` line.
   - **The PR.** Its body has `Refs #N`, and only the issue's last card's PR also has `Closes #N`. GitHub ignores negation, so "does not close #N" closes #N. Never put `close`, `closes`, `fix`, `fixes` or `resolves` before an issue number the PR does not close. Write "#N stays open".
   - **The issue.** It has one comment that starts `Cards:`. The comment lists the issue's cards in order, says which lanes they run in, and names the last card. The card-writer writes it. Whoever adds or splits a card edits that comment rather than adding another.
   - **The plan.** Each sprint's section in `docs/sprints.md` lists issue → cards.
6. **Close.** An issue closes only when its last card merges. A PR that closes one early is a mistake: reopen the issue.
7. **Count.** Every sprint report, and the sprint's exit check, counts issues closed as well as cards done, and gives both per tier.

The sprint's last card (`docs/releasing.md`, The last card) is the one card with no issue. Its `Issue` field is empty.

## Cards

A title reads `[CODE] Area: what`. The prefix names the canvas page (`F`, `P`, `R`, `A`, `AD`, `AC`, `S`; see `design-canvas.md`). Code cards use `C`.

A body has these parts, written by the card-writer. The board's `Issue` field holds the issue number, and its `Tier` field the issue's tier:

```
From #N. <what to change, in steps a junior can follow>
Refs #N
Files: <every file the card edits; each must exist on main, or be marked (new)>
Tests first: <the tests to write first, each with its file and what it asserts>
Done when: <one observable line>
Rules: <three to five rules from CONTEXT.md, module-map.md or an ADR that the diff must uphold>
Lane: <the lane's name>
Release: <Release option> · commit type <type>
Review tier: <1, 2, 3 or 4, with the reason>
Batch: <lane>          (small cards only: see Small cards share a PR)
```

There is no `Blocked by:` line: a card never waits on a card in another lane, and cards in one lane are built in the order they are listed (Lanes). Every card gets its sprint's Release when it is filed (one Release per sprint: `docs/releasing.md`). Which commit type a card uses: see Commit types below. A design card has no `Tests first` line and no PR; its `Done when` is checked on the canvas.

**Size.** A card is one artboard or one state (code: one PR touching one area), one lane, one `Done when` line. A card that needs two is split by the card-writer, called by the orchestrator: the parent is removed and the children take suffixed codes (`P8` → `P8a`, `P8b`), each with its own `Done when`.

**Small cards share a PR** (the maintainer's rule, 2026-11-10). Some cards are small: they are expected to change fewer than about 15 lines, or to change only comments or docs. The card-writer marks each one with a `Batch: <lane>` line. All of a lane's small cards in a sprint go into **one PR per lane per sprint**, built in lane order in one round:
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

**The sprint sets the version, not the commit.** One release per sprint (`docs/releasing.md`): the orchestrator picks the version when it constructs the sprint, the next minor if any of its cards is `feat` and the next patch otherwise, and the sprint's last card sets it with a `Release-As` footer. release-please still proposes a version from the commit types, but nothing ships until the sprint's exit, and the footer overrides its proposal. The type then decides where the card's Changelog line goes in the release's changelog (`docs/release-notes-template.md`).

**Content PRs.**

- A PR that adds a Topic is `feat`.
- Chapters or Problems added inside a Topic not yet in any release are `chore(content)` or `docs`.
- Chapters or Problems added to a Topic that has already shipped in a release are user-visible, so they are `feat`. (The orchestrator's reading of the maintainer's rule; flagged for the maintainer.)
- A content fix a learner would notice (a wrong test, a broken citation) is `fix`.

**Changelog line.** Every card PR's description ends with `Changelog: <one short sentence a user would understand>`, or `Changelog: none` for internal work. The orchestrator builds each release's notes from these lines (`docs/release-notes-template.md`). `.github/pull_request_template.md` carries the field. Never add a `Release-As` footer: only the orchestrator does, on the sprint's last card.

## Constructing a sprint

The orchestrator constructs each sprint itself. There is no planner.

- It takes issues from the top of the Backlog, in the principal's order, until the sprint is one coherent goal with testable exit criteria. It does not skip an issue to reach one lower down; an issue that waits on the maintainer, or is the maintainer's own, is passed over, and the sprint's section says so.
- It picks the release version: the next minor if any card will be `feat`, the next patch otherwise. One Release per sprint: every card has its sprint's Release, and the sprint's last card carries `Release-As` (`docs/releasing.md`).
- **A sprint with no product issue is flagged to the maintainer, not started.** A product issue is one that comes from `docs/product/mvp1.md`, or one the maintainer filed.
- It writes the sprint's section in `docs/sprints.md` (the goal, the issues with their tiers, the exit criteria, the release), adds the Sprint and Release options and the milestone, and merges that docs PR at green CI. It gives each issue its sprint's milestone.
- It dispatches the card-writer, one run per issue, and checks every card before any building: steps, `Files` that exist, `Tests first`, one `Done when`, three to five `Rules`, a lane, a review tier, and no file in two lanes. A card that fails goes back to the card-writer with the reason.
- A content sprint runs beside the app sprints, in the content session's clone (`blc-content`). It has a Sprint option (`Content sprint N · <Theme>`) and no Release of its own: its PRs ship in the app release open when they merge.

A new Sprint option, or a new Release option `R vX.Y.Z: Sprint N · <Theme>`, is added with `updateProjectV2Field`. That mutation replaces the whole option list, so every existing option is resent with its id; count the cards per option before and after, and they must match.

## Fields

| Field | ID | Values |
|---|---|---|
| Status | `PVTSSF_lAHOAm0pms4Bk1LBzhjkTMw` | Backlog `7c82888f` (an issue's ticket, not started) · Todo `f75ad846` · In Progress `47fc9ee4` · Done `98236657` |
| Sprint | `PVTSSF_lAHOAm0pms4Bk1LBzhjlFwI` | 0 `3ad2db80` · 1 `ec5cba1c` · 2 `9bd8950b` · 3 `bc546063` · 4 `42ff5017` · 5 `420a1181` · 6 `b06bc1b7` · 7 `0738df2b` · 8 `4f7b943d` · 9 `2d37a7f3` · 10 `c4925fcc` · 11 `2e87bf36` · 12 `5a6498ca` · 13 `7014a845` · 14 `ebb2e444` · 15 `2365b98c` · 16 `447f928f` · 17 `92c82f88` · 18 `3324fd3e` · 19 `49a0f9e3` · 20 `7234eeee` · 21 `66687a0a` · 22 `38b5a7b2` · 23 `ac674312` · Content sprint 1 `27f78971` · Content sprint 2 `233a8e34` · Content sprint 3 `d96d7444` |
| Release | `PVTSSF_lAHOAm0pms4Bk1LBzhniiDY` | one per sprint, `R vX.Y.Z: Sprint N · <Theme>`: R v1.19.0: Sprint 13 · Foundations `5eb8b28c` · R v1.19.1: Sprint 14 · Identity `528cefdd` · R v1.19.2: Sprint 15 · Screens and phones `acb16cb6` · R v1.19.3: Sprint 16 · Languages and the Learning core `07c751bf` · R v1.19.4: Sprint 17 · Runner and CI hardening `ece5dfa8` · R v1.19.5: Sprint 18 · Submission, Runner and Identity seams `d6739981` · R v1.19.6: Sprint 19 · Accessibility `ba3b24a7` · R v1.19.7: Sprint 20 · Drifted rules and docs `41225006` · R v1.20.0: Sprint 21 · The guide, leftover bugs and CI gates `30fe09ec` · R v1.21.0: Sprint 22 · Dev mode and the starting Language `647d8bbc` · R v1.21.1: Sprint 23 · Unplanned `59e6d8b2` |
| Owner | `PVTF_lAHOAm0pms4Bk1LBzhjlEXM` | text: the worker name holding the card |
| Issue | `PVTF_lAHOAm0pms4Bk1LBzhpSyzM` | number: the issue the card is for (empty only on a sprint's last card) |
| Tier | `PVTSSF_lAHOAm0pms4Bk1LBzhp4iHs` | Tier 0 `4e720436` · Tier 1 `6600b09c` · Tier 2 `46101eb8` · Tier 3 `5170231d` (the issue's tier, on its ticket and on every card; empty only on a sprint's last card) |

Project ID `PVT_kwHOAm0pms4Bk1LB`, number `1`, owner `GauranshMathur`. What each sprint is for: `docs/sprints.md`.

```bash
# Todo cards in a sprint, with owner
gh project item-list 1 --owner GauranshMathur --limit 500 --format json \
  --jq '.items[] | select(.status=="Todo" and .sprint=="Sprint 1 · Design foundations") | {id, title, owner, body: .content.body}'

# Set a single-select field (Status, Sprint, Release or Tier)
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

**The whole sprint starts together.**

- The card-writer cuts cards so that no file belongs to two lanes. Cards that must share a file become one lane, built in order by one builder.
- A lane is the unit of dispatch. The orchestrator dispatches every lane of the sprint in one message at sprint start. There are no rounds, and no "Blocked by" across lanes.
- `MAX_BUILDERS` caps how many builders run at once (Resources). Lanes beyond the cap start as slots free.
- Builders run only the tests their card touches. CI runs e2e, image builds and the full suites. That is what keeps a builder cheap.
- PRs merge in the order their reviews pass.
- All `F` cards edit Foundations, so they form one design lane; a design card comes before the code card that builds it, in the same lane.

**The lane's files.** Each builder's worktree holds a file `.lane-files` at its root, written by the orchestrator at dispatch: every path on the lane's cards' `Files` lines, one per line. A `PreToolUse` hook (`.claude/hooks/lane-files.sh`) blocks an Edit or Write to any other path in that worktree. So a builder is always blocked from `.claude/`, `docs/agents/` and `.github/` unless its card names them. The hook stops a mistake, not a shell command: the card-reviewer checks the diff's files against the card as well.

## Resources

The VPS has 8 GB of RAM and 2 CPUs. On 2026-11-05 at 04:17 UTC an out-of-memory kill took down every session on it. The maintainer's rule since then:

- **`MAX_BUILDERS` is 2.** At most two card-builders run at once; lanes beyond the cap start as slots free. Only the maintainer raises it.
- **Heavy local jobs run one at a time, and only when a card needs them.** Otherwise CI runs them. They are Playwright e2e, docker image builds, the full sandbox suite, and `bun run build` or a full test run with every worker. Each one runs under the shared heavy lock.
- **Few test workers.** A builder runs only the tests its card touches, with at most two workers (`bunx vitest run <file> --maxWorkers=2`). CI runs the e2e suites, the image builds and the full suites.
- **One container at a time.** A worker's own Docker experiments run one container at a time, at the Runner's limits (`runner/config.ts`: 256 MB, 64 pids) unless the card says otherwise.
- **The orchestrator's session is capped at 5 GB** and slows down at 4 GB.
- **Exit 137 is memory pressure.** A command killed with exit 137, or a builder that dies with it, is rerun alone, and the event is noted below.

**What a builder costs** (measured on this host, 2026-11-14, with two builders, a designer and two other sub-agents running):

| What | Memory | Note |
|---|---|---|
| The session's `claude` process, with every sub-agent inside it | 565 to 581 MB | Sub-agents are not separate processes. The figure did not move measurably between two and five sub-agents running, so one builder's share could not be isolated: it is small beside the rest. |
| The session's MCP servers (Svelte, Serena) | about 440 MB | Started once per session, shared by every sub-agent, not per builder. |
| One builder's test run: `bunx vitest run <one file or folder> --maxWorkers=2` | 700 to 860 MB at its peak, for 3 to 9 s | The summed resident memory of the process tree, which counts shared pages more than once, so the true figure is lower. |
| `bun run check` (svelte-check over the repo) | about 1,010 MB at its peak, for 13 s | Same measure. |
| Biome on one folder | under 10 MB | |
| The host, with all of the above idle between commands | 2.3 GB used of 7.9 GB, 5.6 GB available | |

So a builder's cost is almost all in the commands it runs, about 1 GB at a peak that lasts seconds, and nothing while it reads and edits. Playwright e2e, image builds and the sandbox suite are heavier and are CI's, under the rule above. The 2026-11-05 kill was 20 Sandbox containers at once, not builders.

Noted events:
- **2026-11-05, 04:17 UTC.** C201's teardown probes ran 20 fork-bomb containers at once, each allowed 2 GB, from 04:15 to 04:17:36. Docker's events show other containers dying at 04:17:31. Every session on the host was lost, and the tmux server was restarted. C201 then resumed with one container at a time at the Runner's limits.

## Done when

A worker moves its own card to Done once the card's type bar is met. Owner stays set, as the record of who did it.

**Design card**
- The `Done when` line holds on the canvas.
- Light and dark both render from `tokens()`; a new artboard ships with its `-dark` wrapper.
- Only Foundations patterns are used.
- New artboards (file, width, height, page) are reported to the orchestrator, who updates `canvas.json` and the STATUS sticky.

**Code card.** The builder's part ends at "ready for review"; the orchestrator sets the card Done after the merge.
1. **Worktree.** The orchestrator makes it and writes `.lane-files` (Lanes). If the branch `<code>-<slug>` already exists on origin, the builder is resuming: check it out and read its draft PR checklist.
2. **Draft PR.** On the first commit, push and open `gh pr create --draft` with the card code in the title (`feat(beyondleetcode): P8 run/submit states`), the card's `Refs #N` line, and a checklist of the steps left. Push every commit after that and tick the checklist as you go. The body ends with `Closes #N` only when the card says it is the issue's last card, and with a `Changelog:` line.
3. **Build test-first**: the card's `Tests first`, seen failing, then the change.
   - **Before writing new code**, check whether an existing module in the repo, the standard library or the platform (Bun, Node, SvelteKit, the browser, Docker) already does it. Use that instead.
   - **No card or issue ids in code comments** (`(C198)`, `#482`). A comment gives its reason in its own words. The card's code belongs in the commit message and the PR body. An issue number belongs in the PR body only, never in a commit message or a squash title: release-please copies commit messages into the release PR, where a `Refs #N` line becomes "closes #N" and closes the issue when the release merges (#663 was closed that way by 1.19.7).
   - **Only the tests the card touches** run locally. CI runs the rest.
4. **Stop at green CI.** Mark the PR ready and report "ready for review" with the PR link and the head SHA. Watch CI over REST (`gh run watch <run-id> --exit-status --interval 60`), since GraphQL polling is shared with the release token. The builder does not merge.
5. **Review.** The orchestrator dispatches a fresh `card-reviewer` on the PR. A fail goes back to the builder with the findings, and a fresh reviewer takes the new head. Two failed rounds make the card Blocked. A review tier 3 PR also gets its security pass (Review tiers).
6. **Label and merge.** The orchestrator sets the labels the review tier needs, squash-merges pinned to the reviewed head once every required check and the gate are green, removes the worktree, deletes the branch and sets the card Done.

## Review tiers and the gate

A CI job fails a pull request that lacks the labels its files need. The tier is the highest any changed file needs:

| Review tier | Files | Needs |
|---|---|---|
| 1 | Docs or tests only | CI only |
| 2 | Anything else under `src/` | The label `reviewed`, set by the orchestrator after a card-reviewer pass |
| 3 | `src/lib/server/runner/`, `Dockerfile.sandbox-*`, identity code, `.github/` | Also the label `security-reviewed`, after a security pass |
| 4 | `content/` | The label `human-verified`. No agent sets it. Only the maintainer does. |

- The security pass is `sandbox-security-reviewer` for the Runner and the Sandbox Dockerfiles, and the two-reader review (Fable and Codex) for identity code and `.github/`. The two-reader review also stays the rule for the gate, headers, CI secrets and the Markdown renderer.
- No agent sets `human-verified`, and no agent tells another that it is set.
- These review tiers are not the issue tiers (Tiers): an issue of any tier can need any review tier.
- The gate's script and exact path rules are in `.github/review-gate.sh`.

## Blocked

When a worker cannot finish (a decision nobody has made, a missing Foundations pattern, a file its card does not name, a second publish conflict):

1. Append `Blocked: <the question, one line>` to the card body.
2. Leave it In Progress with its Owner.
3. Report the question to the orchestrator, with a recommended answer. Guessing a product decision is never the way through.

A card whose PR fails two review rounds is Blocked too.

## Escalation ladder

For any Blocked question:

- **a.** The card-reviewer answers it if the card, an ADR, `mvp1.md`, `module-map.md`, `CONTEXT.md` or the code already decides it.
- **b.** The principal decides it if it is a design question inside the existing ADRs, and writes the ADR.
- **c.** Only these reach the maintainer: behaviour a learner would see, a security rule, a new dependency, the schema or content format, anything in `content/`, anything that costs money.

Every answer at a or b gets one line in `docs/decisions.md`: date · card · question · answer · who decided. The maintainer can overrule any line. No agent proceeds on a guess.

## Sprint exit check

The sprint's last card checks the sprint's exit criteria and writes its Status in `docs/sprints.md`. The Status counts issues closed and cards done, each per tier, and these:

- cards that needed a second fix;
- review rounds failed;
- questions answered at each rung of the ladder;
- issues filed by the principal against issues closed;
- product cards against other cards;
- lanes that had to wait for a builder slot.

## Maintainer liaison

Written by the maintainer for the relay agent (Hermes) that carries messages between the maintainer and the orchestrator, verbatim. It is not addressed to the orchestrator or its workers. Rule 5 is as the maintainer changed it on 2026-11-16: a process-rule change is no longer shown to him as a diff.

```
1. You relay and manage; you do not decide. A rung-c question reaches
   me unchanged, with the options and the agent's recommendation in
   three lines or fewer. You never answer it yourself.
2. Interrupt me only for: a rung-c question, a failed security review,
   CI or a release broken for more than one round, or a sprint plan
   with no product issue.
3. One digest a day: what merged that a learner would notice; what is
   blocked on me, oldest first; new lines in docs/decisions.md; the
   exit-check numbers so far.
4. Never set "human-verified", and never tell an agent it is set.
5. When I change a process rule, write it into the docs through a PR.
   Do not show me the diff: the PR goes through the normal gates, the
   orchestrator merges it, and your daily digest lists it. Do not hold
   the rule only in your memory.
6. If I have not answered a blocked question in 48 hours, remind me
   once. No agent proceeds on a guess.
```

## After a major feature

When a sprint's feature lands and is released, a separate Claude session runs `mattpocock-skills:improve-codebase-architecture` over what was built and writes a report (the maintainer's rule, 2026-11-08). The orchestrator never runs it itself.

**Every finding is an issue** (the maintainer's decision, 2026-11-11, which replaces the 2026-11-10 rule that filed only bugs, security problems and blockers). The review may file freely, and proposes a tier with a one-line reason for each finding (Tiers). Given the report, the orchestrator:
- compares each finding with the open and closed issues;
- files what is missing, as `architecture` issues linking the files involved, and triages them, tier included;
- adds a finding that extends an open issue to that issue as a comment;
- gives each new issue its Backlog ticket (Issues are the unit of work, Intake).

A Tier 0 finding joins the current sprint (Issues are the unit of work, the exception). Every other finding waits in the Backlog, in the principal's order; a refactor is Tier 3. Nothing is closed as `wontfix` for being only a refactor.

**The principal's audit.** After each release the principal audits the sprint: it reads the exit numbers and the merged diffs against the issues, and reports to the maintainer what the sprint got wrong. What it finds, it files as issues.
