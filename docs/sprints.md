# Sprints

Sprints are goal-based, not time-boxed: a sprint ends when its exit criteria hold. Every card carries a Sprint field on the board (IDs in `docs/agents/board.md`). The orchestrator works one sprint at a time and does not pull cards from a later sprint until the current one exits.

**Size and release** (from Sprint 14). A sprint is one coherent theme drawn from the open issues, typically 12 to 25 cards; each card is still one PR. A sprint is the unit of release: it ends with one release, whose version the `sprint-planner` picks when it plans the sprint and whose last card sets it with `Release-As`. Its changelog has fixed headings and is reviewed before the release PR merges (`docs/releasing.md`).

**Ordering rule.** Each screen is designed in the sprint that builds it, or the one just before. Foundations rules come first so every later screen is built responsive from day one. The one exception is mobile boards, which wait for Sprint 5.

**Only the current and planned sprints** (the maintainer's rule, 2026-11-10). When a sprint exits, its last card moves the sprint's section, its Status included, to `docs/sprints-archive.md`, which holds Sprints 0 to 19.

**The Backlog** (the maintainer's decision, 2026-11-11). Every open issue has a ticket on the board with Status Backlog and no sprint. The planner pulls from the Backlog by tier when it plans the next sprints. Only Tier 0 work joins the sprint in progress (a bug that hurts users, a security problem, a broken CI or release), with anything a planned card cannot be built without. The rules are in `docs/agents/board.md`, Issues are the unit of work.

**Tiers** (the maintainer's standing rule, 2026-11-14). Every open issue has one tier, assigned at intake with a one-line reason. The planner fills each sprint strictly by tier, and re-ranks at the start of every sprint and whenever a Tier 0 issue arrives. Each sprint's section gives its tier mix, and its exit Status the issues closed per tier. The rules are in `docs/agents/board.md`, Tiers.

- Tier 0 critical fixes: bugs that hurt users, security problems, broken CI or release.
- Tier 1 priority: the maintainer's new items, accessibility that blocks users, and anything that unblocks them.
- Tier 2 normal work.
- Tier 3 refactors and tidy-ups, drawn from only when a sprint has room.

**Content sprints** run beside the app sprints, in the content session's clone (`blc-content`). They have Sprint options of their own and no release: a content PR ships in the app release open when it merges. Their cards do not count toward an app sprint's 25.

**Issues first** (the maintainer's rule, 2026-11-10, #591). Each sprint plans issues, and its cards say how each issue is done. Each sprint's section lists issue → cards, with the last card that closes each issue. The rules are in `docs/agents/board.md`, Issues are the unit of work.

## The ranking (2026-11-14)

Every open issue, 71 in all: none in Tier 0, 5 in Tier 1, 35 in Tier 2 and 31 in Tier 3. Three rows are kept for issues closed on 2026-11-14 (#517, #510 and #514), marked in the Sprint column. Inside a tier the order is the order of work: the sprint, then the issue number. "Backlog" means the issue's ticket waits in the Backlog column; "the maintainer's" means no agent starts it. The planner rewrites this table at the start of every sprint.

| Issue | Tier | Reason | Sprint |
|---|---|---|---|
| #517 Architecture: the e2e scripted Runner works out the Main Line itself, and fails an Extra's Reference Code o… | 1 | It unblocks #660: the scripted Runner must accept an Extra's Reference Code before the dev-mode reference run can be tested (C381). | Sprint 20 (closed 2026-11-14 by C381) |
| #637 Problem screen: a rejected save is silent, a failing save repeats, and a pending switch can drop focus on a… | 1 | Accessibility that blocks users: a screen-reader Learner is not told that their code was not saved. | Sprint 20 |
| #660 Dev mode: unlock everything, run reference solutions, and preview content from disk | 1 | The maintainer's priority item: dev mode. Its two boards are in Sprint 20. | Sprint 21 |
| #661 Starting Language: a first-run choice and a setting, remembered per user | 1 | The maintainer's priority item: the starting Language. Its two boards are in Sprint 20. | Sprint 21 |
| #662 How to use the site: a short guide page, from the header and first run | 1 | The maintainer's priority item: the guide page. Its board is in Sprint 20. | Sprint 21 |
| #663 Content redesign, system-first: a spine system the 17 Topics build, then per-Topic rewrites | 1 | The maintainer's priority item: the system-first content redesign, run by the content session beside the app sprints. | Content sprints 1 to 3 |
| #507 Docs: the compose.yaml that init writes, and self-hosting's smaller slips | 2 | Operator docs: self-hosting's Runner notes and troubleshooting; C382 is left. | Sprint 20 |
| #510 Docs: sandbox-security-reviewer's checklist requires official images, which the TypeScript and Go Sandboxes… | 2 | The sandbox reviewer's checklist must match the Sandbox it reviews. | Sprint 20 (closed 2026-11-14 by C372) |
| #565 Architecture: every Runner failure is one silent RunnerUnavailable | 2 | Hardening that blocks something: Runner failures are logged by kind, which C382's troubleshooting section needs. | Sprint 20 |
| #572 Architecture: the Map's "current Topic" is decided four times with two answers, and can point at a Locked T… | 2 | A user-visible bug, rare today: the Map's Continue link can point at a Locked Topic after a content change; #663's rewrites make it likelier. | Sprint 20 |
| #569 Architecture: CI's list of test jobs is written twice, so a new job gates edge but not a release | 2 | Release safety: a new CI job gates edge but not a release, and nothing warns. | Sprint 22 |
| #634 unit: the eight-password-changes test can pass the 5 s timeout on a slow runner | 2 | A flaky unit test that has failed on main once; a second failure makes it Tier 0. | Sprint 22 |
| #640 Users: two Invites from the same day share one name, and an e2e cleanup cancels the first Invite it finds | 2 | An accessibility bug for the Admin (two Invites share a name) and a test that can cancel another test's Invite. | Sprint 22 |
| #643 Error page: a Locked Topic's heading reads TopicLocked; the 403 and 404 wording is undecided | 2 | User-facing wording: a Locked Topic's page is headed TopicLocked. The wording was decided on 2026-11-14 (the issue's table, no figure); C430 builds it. | Sprint 22 |
| #649 Editor: selected strings and numbers miss 4.5:1, and the canvas lacks the selection-match token | 2 | A contrast bug in one state (selected strings and numbers at 3.8:1); it does not block a Learner. | Sprint 22 |
| #651 ci: .github/ci-gate.test.sh failed once in the lint job and passed on a re-run | 2 | A flaky CI script that has failed once, on a PR; a failure on main makes it Tier 0. | Sprint 22 |
| #666 ci: the sandbox job's content check had a compile killed (status -9) once on main | 2 | A CI job that failed once on main for a cause outside the commit; a second failure makes it Tier 0. | Backlog |
| #652 Problem screen at a short phone: an extra tab stop, the Solution editor's size, and a cross-component style | 2 | Three small Problem-screen leftovers at the short phone viewport. | Sprint 22 |
| #667 Sandbox reviewer: the checklist misses archive paths, the result channel, hidden Tests and its own trigger | 2 | Hardening of the checklist every Runner change is reviewed against; nothing is broken today. | Backlog |
| #529 Accessibility: an automated check in CI (axe, a new dependency, or a no-dependency contrast and landmark test) | 2 | Hardening: an automated accessibility check in CI; the axe dependency is the maintainer's call. | Waits on the maintainer |
| #535 CI: replace the deprecated Tailscale authkey, and decide RELEASE_PAT or a GitHub App token | 2 | CI hardening: a deprecation warning and a shared rate limit, neither a broken release today; blocks C220, C221 and #570. | Waits on the maintainer |
| #570 Architecture: the release webhook's tailnet join and post are a drifted copy of notify.yml's, with no time… | 2 | Release hardening: a hanging tailnet join can fail publish-release after the image is pushed; C340 waits behind C220 and C221 (#535). | Waits on the maintainer |
| #647 Users: without JavaScript, two Registration saves in quick succession can be stored in the wrong order | 2 | A low-risk ordering bug in the no-JavaScript Registration save; whether to add a server-side guard is the maintainer's. | Waits on the maintainer |
| #24 Spec: BeyondLeetcode MVP1 | 2 | The MVP1 spec: a tracking issue the maintainer keeps open; no agent card closes it. | Backlog (the maintainer's) |
| #113 Content: human source review of the dynamic arrays Topic was skipped at merge | 2 | Learning content: the human source review of Dynamic arrays; best done on the text #663's rewrite leaves. | Backlog (the maintainer's) |
| #252 Content: 1-D dynamic programming | 2 | Learning content: the human review of 1-D dynamic programming; C425 rewrites the Topic first. | Backlog (the maintainer's) |
| #253 Content: 2-D dynamic programming | 2 | Learning content: the human review of 2-D dynamic programming; C427 rewrites the Topic first. | Backlog (the maintainer's) |
| #254 Content: Backtracking | 2 | Learning content: the human review of Backtracking; C422 rewrites the Topic first. | Backlog (the maintainer's) |
| #255 Content: Binary search | 2 | Learning content: the human review of Binary search; C414 rewrites the Topic first. | Backlog (the maintainer's) |
| #256 Content: Bit manipulation | 2 | Learning content: the human review of Bit manipulation; C420 rewrites the Topic first. | Backlog (the maintainer's) |
| #257 Content: Graphs | 2 | Learning content: the human review of Graphs; C428 rewrites the Topic first. | Backlog (the maintainer's) |
| #258 Content: Greedy | 2 | Learning content: the human review of Greedy; C426 rewrites the Topic first. | Backlog (the maintainer's) |
| #259 Content: Hash tables | 2 | Learning content: the human review of Hash tables; C416 rewrites the Topic first. | Backlog (the maintainer's) |
| #260 Content: Heap | 2 | Learning content: the human review of Heaps; C424 rewrites the Topic first. | Backlog (the maintainer's) |
| #261 Content: Intervals | 2 | Learning content: the human review of Intervals; C429 rewrites the Topic first. | Backlog (the maintainer's) |
| #262 Content: Linked list | 2 | Learning content: the human review of Linked lists; C417 rewrites the Topic first. | Backlog (the maintainer's) |
| #263 Content: Math and geometry | 2 | Learning content: the human review of Math and geometry; C419 rewrites the Topic first. | Backlog (the maintainer's) |
| #264 Content: Sliding window | 2 | Learning content: the human review of Sliding window; C418 rewrites the Topic first. | Backlog (the maintainer's) |
| #265 Content: Stack | 2 | Learning content: the human review of Stacks; C413 rewrites the Topic first. | Backlog (the maintainer's) |
| #266 Content: Trees | 2 | Learning content: the human review of Trees; C421 rewrites the Topic first. | Backlog (the maintainer's) |
| #267 Content: Tries | 2 | Learning content: the human review of Tries; C423 rewrites the Topic first. | Backlog (the maintainer's) |
| #268 Content: Two pointers | 2 | Learning content: the human review of Two pointers; C415 rewrites the Topic first. | Backlog (the maintainer's) |
| #511 Docs: ADRs 0002, 0004 and 0006, and three code comments, point at moved docs or changed facts | 3 | Tidy-up: comment pointers; kept because C370 is Done and C376 is the chain's last link. | Sprint 20 |
| #514 Architecture: the first admin's sign-up is a third copy of the sign-up field rules, and it has drifted | 3 | What is left is a refactor (one module for sign-up refusals); kept because C366 and C371 started the chain. | Sprint 20 (closed 2026-11-14 by C373) |
| #508 Docs: module-map's Identity and Web rows predate Sprint 14, and it has no home for the Language list | 3 | Tidy-up: stale comments and module-map rows; moved out of Sprint 20, drawn into Sprint 22's room. | Sprint 22 |
| #500 Architecture: the Problem screen's view module is tested, but the screen does not run it | 3 | Refactor: the Problem screen should run its tested view module; no Learner sees a difference. | Backlog |
| #501 Architecture: Sign in, Sign up and Accept invite are three copies of one account-form screen | 3 | Refactor: three account-form screens become one; #514's screen half. | Backlog |
| #502 Architecture: the renderer emits the Markdown scroll boxes, but four screens each style them | 3 | Refactor: one home for the Markdown scroll-box styles. | Backlog |
| #503 Architecture: the Topic page works out the Main Line's steps itself, and ProblemTable takes props no caller… | 3 | Refactor: the Topic page reads the Main Line's steps from the catalogue. | Backlog |
| #504 Architecture: the Problem screen's driver and request encoding live in ProblemWorkspace.svelte, where only… | 3 | Refactor: the Problem screen's driver moves where Vitest reaches it. | Backlog |
| #505 Architecture: the header model describes a phone bar that the phone does not draw | 3 | Refactor: the header model drops a phone bar nobody draws; it touches the header after C402. | Backlog |
| #515 Architecture: route tests reach under the account actions into Better Auth, and the actions' log rules are… | 3 | Refactor: route tests stop reaching into Better Auth. | Backlog |
| #516 Architecture: the route-policy table holds half of each route's access policy; the gate still spells /setup… | 3 | Refactor: the route-policy table takes the gate's last literals; a security rule, so its cards take the two-reader review. | Backlog |
| #519 Architecture: the Runner process's wiring has no interface, so its one unit test copies it | 3 | Refactor: an interface for the Runner process's wiring. | Backlog |
| #520 Architecture: a fourth Language is a short list, but three of its agreements are pinned by nothing | 3 | Refactor: tests pin a fourth Language's three agreements; nothing is wrong for today's three. | Backlog |
| #560 Architecture: a browser test's Instance is started by six recipes in two languages, and one is found throug… | 3 | Refactor: one recipe to start a browser test's Instance; the strongest Tier 3 candidate once C393 adds a seventh. | Backlog |
| #561 Architecture: the save protocol's server half is interleaved with I/O in the core shell | 3 | Refactor: the save protocol's server half as a pure function. | Backlog |
| #562 Architecture: what a Build is (type, limits, path rule, equality, digest) is spelled across eight modules | 3 | Refactor: one module says what a Build is. | Backlog |
| #566 Architecture: the Run's timing budget is about 20 constants related only by prose | 3 | Refactor: one module derives the Run's timing budget. | Backlog |
| #567 Architecture: Engine is an undeclared 10-method type with 23 hand-cast partial fakes | 3 | Refactor: a declared Engine type and one fake. | Backlog |
| #568 Architecture: the TypeScript and Python halves of the harness protocol meet only in Docker | 3 | Refactor: the harness protocol's two halves meet in a test without Docker. | Backlog |
| #571 Architecture: the Unlock diff ("what this progress changed") is written twice | 3 | Refactor: the Unlock diff written once. | Backlog |
| #573 Architecture: the NotFound / TopicLocked check runs about ten times a call, in two styles | 3 | Refactor: one NotFound / TopicLocked check per call. | Backlog |
| #574 Architecture: two side channels tell the registration gate why a server-side sign-up is admitted | 3 | Refactor: one channel tells the registration gate why a sign-up is admitted; a security rule, so its cards take the two-reader review. | Backlog |
| #575 Architecture: Learner steps in browser tests are written inline in each file | 3 | Refactor: one module of Learner steps for browser tests. | Backlog |
| #576 Architecture: `sandboxConfig` mixes web-facing and Runner-internal facts; the port's `limits` is a hypothet… | 3 | Refactor: sandboxConfig split by reader. | Backlog |
| #577 Architecture: Change password and Sign up use different ordering conventions | 3 | Refactor: one ordering convention for Change password and Sign up. | Backlog |
| #578 Architecture: the One-time password order is written twice | 3 | Refactor: the One-time password order written once. | Backlog |
| #579 Architecture: smaller Learning core findings from the Sprint 17 review (five items) | 3 | Tidy-ups: five smaller Learning core findings. | Backlog |
| #580 Architecture: smaller Runner findings from the Sprint 17 review (three items) | 3 | Tidy-ups: three smaller Runner findings. | Backlog |
| #581 Architecture: smaller Identity findings from the Sprint 17 review (seven items) | 3 | Tidy-ups: seven smaller Identity findings. | Backlog |
| #582 Architecture: smaller screen, test and CI findings from the Sprint 17 review (four items) | 3 | Tidy-ups: four smaller screen, test and CI findings. | Backlog |
| #623 Architecture: the Main Line, its places and the Topic Map are computed only inside loadCatalogue | 3 | Refactor: a pure catalogue indexer; #517's larger step. | Backlog |
| #624 Architecture: the Admin functions throw five exported error classes under an actions object that answers codes | 3 | Refactor: the Admin functions answer codes instead of throwing five error classes. | Backlog |

**Tier 0 is empty today.** No open bug hurts users badly enough to stop a sprint, no security problem is open, and `ci` and the release are green. Two issues are one failure away from it: #634 and #651, each a flaky check seen once.

**Waiting on the maintainer**, ranked, with what each blocks. None is cut into cards until it is answered:

| Issue | Tier | The question | Recommended | It blocks |
|---|---|---|---|---|
| #535 | 2 | Create the Tailscale OAuth client (`TS_OAUTH_SECRET`); keep `RELEASE_PAT` or move release-please to a GitHub App token? | Create the OAuth client; keep `RELEASE_PAT` until the shared rate limit fails a release again. A hard call (a token and a new action) | C220, C221, and C340 (#570), which have no sprint |
| #647 | 2 | Add a server-side guard to the no-JavaScript Registration save, and which kind? | A revision the form carries and the action checks. A hard call (Identity, and possibly what the Instance stores) | One Identity card with the two-reader review |
| #529 | 2 | `@axe-core/playwright` (a new dependency), or the no-dependency contrast and landmark tests? | The no-dependency tests now; axe stays the maintainer's call. A hard call only for axe | The automated accessibility check; nothing else waits on it |

## Sprint 20 · Drifted rules and docs

**Goal:** the rules that drifted from their one home are put back and the docs an operator reads first say what the code does, and the Tier 1 work that needs no `feat` starts: a Learner using a screen reader is told when their code was not saved, and the boards for dev mode, the starting Language and the guide are drawn, so Sprint 21 builds them. Re-ranked by tier on 2026-11-14, in progress: the sprint keeps its name, its Release and its version.

Release `R v1.19.7: Sprint 20 · Drifted rules and docs`, version 1.19.7 (patch, because no card is `feat`: the cards are `fix`, `refactor`, `test`, `docs` and design cards with no PR). Milestone `Sprint 20 · Drifted rules and docs`.

- **Tier mix: 24 cards.** Tier 1: 9 (C381, C386, C387, S4, P13, S5, S6, F23, S7). Tier 2: 9 (C367, C368, C369, C372, C374, C377, C378, C380, C382). Tier 3: 5 (C366, C370, C371, C373, C376), each a link of a chain that had started. The last card, C383, has no tier. Tier 0: none.
- **Issues: 9 closed here.** Tier 1: #517 and #637. Tier 2: #507, #509, #510, #565 and #572. Tier 3: #511 and #514. Three more Tier 1 issues get their boards here and close in Sprint 21: #660, #661 and #662.
- **State on 2026-11-14.** Done: C366, C367, C368, C369, C370, C371 and C373 (#514 is closed). In progress: C372, in its two-reader review. Todo: the rest.
- **What the re-rank changed.**
  - **In:** #637 (C386, C387), Tier 1; and the five boards of #660, #661 and #662 (S4, P13, S5, S6, S7), Tier 1.
  - **Out:** #508 (C375, C379), Tier 3 with no card started, to Sprint 22. C376 no longer shares a batch PR with C375.
  - **Kept, Tier 3:** C373, the last link of #514 after C366 and C371; C376, the last link of #511 after C370.
  - **Added 2026-11-14:** F23 (#662), Tier 1, a dependency S7 cannot finish without. Foundations F.10 allowed the phone header two right-side links, and an admin already has Users and [USERNAME], so the Guide link would be a third. Decided by the orchestrator (the designer's recommended option; a design-pattern choice): the admin's phone header may carry three links. The sprint keeps its Release and its version.
- **Top three:** C386 and C387 (#637, the save a screen reader does not announce); the five boards, which Sprint 21 cannot start without; C381 (#517), which the dev-mode reference run's tests need.
- **Twenty-four cards.**
  - **Identity** (`identity/`, the Setup and account-form routes): C366, then C371, then C373: one module answers every sign-up refusal, total not partial, and the forms take their limits from `ACCOUNT_LIMITS` (#514).
  - **Runner** (`runner/`): C378: the HTTP adapter classifies each failure and logs it once by kind (#565), then C380: the Runner logs its 400s and 401s (#565). C381: the scripted Runner answers an Extra's Reference Code from the Main Line place (#517).
  - **The Map:** C374: the current Topic is decided once in `mapView`, and is always an open Topic (#572), then C377: one pure Map-entries function feeds the figure and the column (#572).
  - **The Problem screen:** C386: a rejected save is announced, and a failing save once per failure run (#637), then C387: on a phone, focus lands somewhere after a Language switch or a restart when the Code pane is not shown (#637).
  - **Comments** (small): C376: the Runner config, the Dockerfile and `db.ts` point at the right doc, roles and path (#511).
  - **Docs and init:** C367, C368, C369 and C370 (lane B's batch PR, Done); C372: the sandbox reviewer checks the Sandbox as it is (#510); C382: self-hosting's first-start, capacity and Runner troubleshooting notes, and two fixed sentences (#507).
  - **Design** (the canvas, one lane, in order): S4: the dev-mode banner (#660); P13: the Problem screen's "Run reference solution" action and its results (#660); S5: the first-run starting-Language choice (#661); S6: the Settings row for it (#661); F23: Foundations F.10 lets the admin's phone header carry three links, Users, Guide and [USERNAME], the name truncating with an ellipsis (#662); then S7 finishes: the guide page and its header link, desktop and phone (#662).
  - **Last:** C383, the exit check and `Release-As: 1.19.7`. It has no issue.
- **Issues → cards.** The milestone `Sprint 20 · Drifted rules and docs` holds each issue that closes here.

  | Issue | Tier | Cards, in order | Last card | Lane conflicts (shared files, in this order) | Risks and review | Acceptance check |
  |---|---|---|---|---|---|---|
  | #637 A rejected save is silent | 1 | C386, C387 | C387 | `ProblemWorkspace.svelte` and `problem.e2e.ts`: C386, then C387; Sprint 22's C406 and C408 (#652) come after | None for security. The announce-once rule must not hide a second, separate failure | `problem.e2e.ts` shows the rejected text in the live region, the failed text once across two retries, and focus not on `body` after a switch on the phone |
  | #517 The scripted Runner gets Extras wrong | 1 | C381 | C381 | None | `sandbox-security-reviewer` (test code under `runner/`). Sprint 21's C391 is blocked by it | `grep -n "indexOf" src/lib/server/runner/scripted-catalogue.ts` prints nothing, and its test accepts `stacks-peek`'s Reference Code |
  | #660 Dev mode (boards only) | 1 | S4, P13, then Sprint 21's C389 to C396 | C396 (Sprint 21) | The design lane: S4, then P13 | None here. The banner must be told from the header at a glance | The System page shows the banner, and the Practice page the reference-run action, in light and dark |
  | #661 Starting Language (boards only) | 1 | S5, S6, then Sprint 21's C397 to C400 | C400 (Sprint 21) | The design lane: after P13 | No Language may be drawn preselected | The System page shows the choice with none preselected; the Settings board shows the row |
  | #662 The guide (boards only) | 1 | F23, S7, then Sprint 21's C401 and C402 | C402 (Sprint 21) | The design lane: after S6. S7 began first and is blocked on F23: F.10 allowed the phone header two right-side links, and an admin's Guide link is a third. F23 edits the Foundations board, S7 the Guide board, so they share no file | A missing header pattern is reported, not invented: S7 reported it, and F23 adds it. If the Foundations board's height changes, the orchestrator updates its dark wrapper and `canvas.json` | Foundations F.10 shows the admin's three links at 390 px with a long [USERNAME] truncated; the System page shows the guide and the header link at desktop width and 390 px |
  | #565 Every Runner failure is silent | 2 | C378, C380 | C380 | None; `http-adapter.ts` and `server.ts` are each one card's | `sandbox-security-reviewer` on both. A log line must carry no token, Build or input: by kind only | `http-adapter.test.ts` maps each status to a kind and one log line; `server.test.ts` shows one line for a 401 and each 400 |
  | #572 The current Topic can be Locked | 2 | C374, C377 | C377 | None with another issue; `rules.ts` is C374's alone this sprint (Sprint 21's C390 edits it later) | None for security. Decision taken from the issue: current is the open Topic with the most recent activity, or none | `rules.test.ts` answers the most recent open Topic for a Locked most-recent one; `entries.test.ts` covers each state |
  | #507 compose.yaml and self-hosting slips | 2 | C367, C382 | C382 | None; C382 waits for C380's failure kinds. Sprint 21's C396 edits `self-hosting.md` later | No mount, flag or socket change | `compose.yaml` holds no pull note and passes `RUNNER_MAX_CONCURRENT`; self-hosting has a Runner troubleshooting section |
  | #509 mvp1.md's Shipping section | 2 | C368 | C368 | None | Closed (C368 is Done) | `grep -n "fully automatic\|no token" docs/product/mvp1.md` prints nothing |
  | #510 The sandbox reviewer's image rule | 2 | C369, C372 | C372 | None | C372 edits the security reviewer's definition: the two-reader review. No security rule changes | The reviewer names the two GHCR Sandbox images and Go's `/exec`; `grep -n "superpowers:" docs/agents/board.md` prints nothing |
  | #514 The first admin's sign-up has drifted | 3 | C366, C371, C373 | C373 | `setup.ts`: C366, then C371 (both Done); `accept.ts`: C373, then Sprint 22's C375 (#508) | Identity: every card gets the two-reader review. ADR 0006 holds: the Invite claim stays last in `user.create.before`. The texts Setup shows do not change | `setup.test.ts` shows " ada@example.com" accepted as by `signUp`; a `RefusalCode` with no answer fails `bun run check`; `grep -rn "InvalidFirstAdminError" src` prints nothing |
  | #511 ADRs and three comments | 3 | C370, C376 | C376 | None | C376 touches `runner/config.ts` (a comment), so it gets `sandbox-security-reviewer` | `grep -rn "README, Upgrading\|k6 tests watch" docs/adr` and `grep -n "README's reverse-proxy\|two roles\|app\.db" src/lib/server/runner/config.ts Dockerfile src/lib/server/db.ts` print nothing |

  - C383, the exit check, has no issue.
- **Decided from the issues** (their own direction, not a new choice): #572's current Topic is the open Topic with the most recent activity, or none; #509 marks k6 as not built; #565 keeps the core's rule (every failure is RunnerUnavailable) and leaves the 503s unlogged on the Runner side; #510 changes no security rule; #507's `RUNNER_MAX_CONCURRENT` is passed through `compose.yaml` (C367, Done).
- **Small cards share a PR:** lane B's batch (C367, C368, C369, C370) merged in round 1. C376 is lane A's only small card now, so its PR is its own (`docs` type, `sandbox-security-reviewer` for `config.ts`).
- **Reviews.**
  - The orchestrator's two-reader review (Fable and Codex): C366, C371 and C373 (Identity) and C372 (the sandbox reviewer's definition).
  - `sandbox-security-reviewer` before merge: C376 (`runner/config.ts`), C378, C380 and C381.
  - None for the rest: docs, the Map, the Problem screen's announcements and the six design cards.
- **Shared files**, each an ordered chain in one lane:
  - `identity/setup.ts`: C366, then C371 (lane A, Done).
  - `ProblemWorkspace.svelte` and `problem.e2e.ts`: C386, then C387 (lane B).
  - The canvas: S4, P13, S5, S6, F23, then S7 finishing (the design lane). F23 is the Foundations lane's only card this sprint.
- **Two builders a round, and the design lane beside them.** Rounds 1 and 2 are done. The orchestrator's plan review (2026-11-14) reordered rounds 3 to 7 so the Tier 1 cards run first in each lane (C386, C387 and C381), then Tier 2, and the Tier 3 card C376 last; no shared file forced the old order.

  | Round | A · Identity, comments and Runner | B · Docs, the Map and the Problem screen | Design |
  |---|---|---|---|
  | 1 (done) | C366 field check (#514) | C367 + C368 + C369 + C370 (batch) | |
  | 2 | C371 Setup route (#514, done) | C372 sandbox reviewer (#510, in progress) | |
  | 3 | C373 account forms (#514, done) | C386 save announcements (#637, Tier 1) | S4 dev banner (#660) |
  | 4 | C381 scripted Runner (#517, Tier 1) | C387 phone focus (#637, Tier 1) | P13 reference run (#660) |
  | 5 | C378 adapter kinds (#565) | C374 current Topic (#572) | S5 Language choice (#661) |
  | 6 | C380 Runner logs (#565) | C377 Map entries (#572) | S6 Settings row (#661) |
  | 7 | C376 comments (#511, Tier 3) | C382 self-hosting (#507) | F23 admin phone header, then S7 guide finishes (#662) |
  | 8 | C383 exit check and `Release-As: 1.19.7` | | |

- **Rounds: 17.**
  - Lane A's seven build rounds set the length; the longest chain is six cards (the design lane).
  - There are eight reviews: four two-reader and four sandbox.
  - The last card and the cut add one round each.
- **No limit, flag or image changes.** C378 and C380 add log lines, by kind. C381 changes what the scripted fake answers, not what the Runner accepts.

**Exit:**
- All 24 Sprint 20 cards are Done, and `ci` is green on `main`. The sprint's Status counts issues closed and cards done, each per tier.
- `grep -rn "InvalidFirstAdminError\|MultiUserNotAvailableError" src/routes/setup src/lib/server/identity/setup.ts` prints nothing, and a `RefusalCode` with no answer fails `bun run check`.
- `http-adapter.test.ts` holds a status-to-kind table, and `server.test.ts` shows a log line for a 401 and for each 400.
- `grep -n "indexOf" src/lib/server/runner/scripted-catalogue.ts` prints nothing.
- `entries.test.ts` passes, and a `rules.test.ts` row answers an open Topic as current when the most recent one is Locked.
- `problem.e2e.ts` shows the rejected save in the live region, the failed save announced once across two retries, and focus on an element after a Language switch on the phone.
- `grep -n "C4d\|docker pull" src/lib/server/init/compose.yaml`, `grep -n "fully automatic\|no token" docs/product/mvp1.md`, `grep -n "superpowers:" docs/agents/board.md` and `grep -rn "README, Upgrading\|k6 tests watch" docs/adr` print nothing.
- `docs/self-hosting.md` has a Runner troubleshooting section.
- The canvas shows the dev-mode banner, the reference-run action, the starting-Language choice, the Settings row and the guide page, each in light and dark, and `canvas.json` lists the new artboards. Foundations F.10 shows the admin's phone header with three links at 390 px.
- #507, #509, #510, #511, #514, #517, #565, #572 and #637 are closed, 9 issues: 2 of Tier 1, 5 of Tier 2 and 2 of Tier 3.
- The orchestrator cuts 1.19.7 from the release PR and records the cut. Releases stay `1.x`.

**Not in the sprint:**
- **#508** (C375, C379): Tier 3, moved to Sprint 22. The module map's rows for `logging.ts` and `languages.ts` are that sprint's exit now.
- **The code of #660, #661 and #662:** `feat` cards, so they wait for Sprint 21 and 1.20.0.
- **#517's catalogue indexer** (#623) and **#514's screen half** (#501): Tier 3, in the Backlog.
- **#570**, the release webhook's shared notify script: card C340 with no Sprint, after C220 and C221, which wait on #535.

## Sprint 21 · Dev mode, starting Language and the guide

**Goal:** the maintainer's three app items ship: a dev mode that opens everything, runs any Problem's Reference Code and previews content from disk; a starting Language each Learner chooses before the first Problem and can change in Settings; and a short guide page linked from the header and from first run.

Release `R v1.20.0: Sprint 21 · Dev mode, starting Language and the guide`, version 1.20.0 (the next minor, because the cards are `feat`). Milestone `Sprint 21 · Dev mode, starting Language and the guide`.

- **Tier mix: 15 cards.** Tier 1: 14 (C389 to C402). The last card, C403, has no tier. No Tier 2 or Tier 3 card: the sprint is the priority items alone, and it is not padded.
- **Issues: 3, all Tier 1:** #660, #661 and #662. Their boards (S4, P13, S5, S6, F23, S7) are Sprint 20's.
- **Top three:** #660 dev mode (C389 to C396); #661 the starting Language (C397 to C400); #662 the guide (C401, C402).
- **It cannot start until the maintainer answers two questions** (below). C389 and C397, the first card of each lane, carry them as `Blocked by:` lines.
- **Fifteen cards, C389 to C403.**
  - **Dev mode** (#660): C389: the switch `DEV_MODE`, read once at start, off unless set, never set by the image. C390: with it on, the Learning core opens every Topic and writes nothing. C391: the core runs a Problem's Reference Code against its Tests, saving nothing. C392: the banner on every screen. C393: a dev-mode Instance and a `dev` Playwright project. C394: "Run reference solution" on the Problem screen, in each Language. C395: the catalogue is read from disk on each request. C396: the README, self-hosting, the module map and mvp1.md.
  - **Starting Language** (#661): C397: the stored value on `Learner`. C398: a Topic not yet started opens in it, and a Topic already worked on keeps its Language. C399: the first-run choice before the first Problem. C400: the Settings row.
  - **The guide** (#662): C401: the `/guide` page. C402: the header link on every screen, and the offer on first run. From S7's report: the offer ("New here? How to use the site") is drawn in the Guide board, not in the StartingLanguage board, and opening the guide from the choice page leaves the `next` redirect behind; the Learner returns with Back.
  - **Last:** C403, the exit check and `Release-As: 1.20.0`. It has no issue.
- **Issues → cards.** The milestone `Sprint 21 · Dev mode, starting Language and the guide` holds the three issues.

  | Issue | Tier | Cards, in order | Last card | Lane conflicts (shared files, in this order) | Risks and review | Acceptance check |
  |---|---|---|---|---|---|---|
  | #660 Dev mode | 1 | S4, P13 (Sprint 20); C389, C390, C391, C392, C393, C394, C395, C396 | C396 | `app.ts`: C389, C390, C395. `core.ts`: C390, C391, then #661's C398. The Problem route's `+page.server.ts`: C394, then #661's C399. `a11y.e2e.ts`: C392, then C399, then C401 | A switch that opens everything must be impossible to turn on from a request: the two-reader review on C389, C390, C391 and C394, and `sandbox-security-reviewer` on C391 (a new request through the Runner port, with no new flag, mount, image or limit). Unlocking and the reference run must write no progress row. A fourth e2e web server on a 2-CPU host | `bunx playwright test --project dev` passes (a fresh Learner opens the last Topic's last Problem, sees the banner on every screen, and gets a result per Test in three Languages), and `image-files.test.ts` fails if the image names `DEV_MODE` |
  | #661 Starting Language | 1 | S5, S6 (Sprint 20); C397, C398, C399, C400 | C400 | `core.ts`: after C391. The Problem route's `+page.server.ts`: after C394. `language/+page.svelte`: C399, then #662's C402 | A schema change, the maintainer's to allow. Every e2e Learner would meet the first-run choice unless the test Learners are made with a Language (in C399). A Topic with saved code must keep its Language when the setting changes | `language.e2e.ts` shows a new Learner asked, with none preselected and JavaScript off; `settings.e2e.ts` shows the setting changed and kept after a reload |
  | #662 The guide | 1 | F23, S7 (Sprint 20); C401, C402 | C402 | `a11y.e2e.ts`: after C399. `guide.e2e.ts`: C401, then C402. `header.ts` is C402's alone (#505, a Tier 3 refactor of it, waits in the Backlog) | Learner-facing text: C401's PR waits for the maintainer to read it. Each statement about unlocks must match the Learning core | `/guide` has one `main`, a title and one h1 in `a11y.e2e.ts`, and `guide.e2e.ts` reaches it from the header on desktop and phone and from first run |

  - C403, the exit check, has no issue.
- **Waiting on the maintainer.** Both are hard calls, so the orchestrator does not take the recommended answer on its own:
  - **#660: is dev mode allowed on a Multi-user Instance, and who may use its actions there?** `mvp1.md` does not say. Recommended: no. It takes effect only in Local Mode, and a Multi-user Instance with the switch set refuses to start, as with `IDENTITY_TEST_LEARNER`. The maintainer reaches a Local Mode dev Instance over the tailnet. A security rule, so a hard call. C389 is written for this answer.
  - **#661: may it add a stored per-Learner value, a schema change?** The theme is a cookie, which does not follow an Account across browsers, and the issue asks for a value that survives signing out and in. Recommended: yes, one nullable `startingLanguage` column on `Learner`, with a migration that sets every existing Learner to `python`. A schema change, so a hard call. C397 is written for this answer.
- **Decided from the issues** (their own direction): the guide takes the default route policy (signed-in Learners; everyone in Local Mode), so `route-policy.ts` does not change; Reset progress keeps the starting Language, as it keeps the theme; the switch's name, `DEV_MODE`, is the planner's proposal.
- **Reviews.**
  - The orchestrator's two-reader review (Fable and Codex): C389, C390, C391 and C394.
  - `sandbox-security-reviewer` before merge: C391.
  - The maintainer's read of the page's words: C401.
  - None for the rest. C399 gets none provided `route-policy.ts` is untouched and its return address is checked.
- **Shared files**, each an ordered chain:
  - `app.ts` and `app.test.ts`: C389, C390, C395.
  - `learning/core.ts` and `core.test.ts`: C390, C391, C398 (lane A).
  - `problems/[problemId]/+page.server.ts`: C394, then C399 (lane A).
  - `a11y.e2e.ts`: C392, C399, C401.
  - `language/+page.svelte`: C399, then C402. `guide.e2e.ts`: C401, then C402.
- **Two lanes a round.**

  | Round | A · The core, the Problem screen and first run | B · Schema, layout, e2e, content and Settings |
  |---|---|---|
  | 1 | C389 the switch (#660) | C397 schema (#661) |
  | 2 | C390 unlock (#660) | |
  | 3 | C391 reference run (#660) | C392 banner (#660) |
  | 4 | C398 starting-Language rule (#661) | C393 dev e2e project (#660) |
  | 5 | C394 reference run on the screen (#660) | C395 catalogue from disk (#660) |
  | 6 | C399 first-run choice (#661) | C400 Settings row (#661) |
  | 7 | C401 guide page (#662) | C396 dev-mode docs (#660) |
  | 8 | C402 header link (#662) | |
  | 9 | C403 exit check and `Release-As: 1.20.0` | |

- **Rounds: 15.** The longest chain is eight cards (C389, C390, C392, C393, C394, C399, C401, C402). There are five reviews (four two-reader, one sandbox) and the maintainer's read of C401. The last card and the cut add one round each.
- **No limit, flag or image changes.** C391 sends the Runner the same request shape and limits as a Submit. The image never sets `DEV_MODE`.

**Exit:**
- All 15 Sprint 21 cards are Done, and `ci` is green on `main`. The sprint's Status counts issues closed and cards done, each per tier.
- With `DEV_MODE` unset: a Locked Topic answers 403, no banner is drawn, and the reference-run action is absent from the page and answers 404 (`problem.e2e.ts`, `a11y.e2e.ts`).
- `image-files.test.ts` fails if the `Dockerfile` or the files `init` writes name `DEV_MODE`.
- `bunx playwright test --project dev` passes: a fresh Learner opens the last Topic's last Problem, the banner is on every screen, and "Run reference solution" shows a result per Test in Python, TypeScript and Go.
- `core.test.ts` shows every progress table unchanged by the dev-mode reads and the reference run, and the reference run's Runner requests carrying a Submit's limits.
- `app.test.ts` shows an edited Chapter file read on the next request in dev mode, with no restart.
- `grep -n "DEV_MODE" README.md docs/self-hosting.md` prints a start command in each.
- `language.e2e.ts` and `settings.e2e.ts` pass with JavaScript off; `db.test.ts` shows an existing Learner holding `python`.
- `/guide` is in the accessibility e2e table, and `header.test.ts` shows its link on every non-bare route.
- #660, #661 and #662 are closed, 3 issues, all Tier 1.
- The orchestrator cuts 1.20.0 from the release PR and records the cut.

**Not in the sprint:**
- **Dev mode on a Multi-user Instance**, unless the maintainer answers otherwise.
- **#560** (one recipe to start a browser test's Instance): Tier 3. C393 adds a seventh recipe; the refactor waits in the Backlog.
- **#505** (the header model's phone bar): Tier 3; it touches `header.ts` after C402.
- **The content redesign (#663):** the content sprints, below.

## Sprint 22 · Leftover bugs and CI gates

**Goal:** the Tier 2 bugs and gaps that Sprints 19 and 20 left open are closed: selected code meets 4.5:1, two Invites from one day can be told apart, the error page reads as sentences, the Problem screen's short-phone leftovers, two flaky checks, and one list of test jobs for the release gate. The sprint has room, so one Tier 3 issue is drawn in: #508, moved out of Sprint 20.

Release `R v1.20.1: Sprint 22 · Leftover bugs and CI gates`, version 1.20.1 (patch, because no card is `feat`). If a content rewrite, which is `feat`, merges while the sprint runs, the version is 1.21.0 and the orchestrator renames the Release option before the last card. Milestone `Sprint 22 · Leftover bugs and CI gates`.

- **Tier mix: 13 cards.** Tier 2: 10 (F22, C404 to C411, C430). Tier 3: 2 (C375, C379). The last card, C412, has no tier.
- **Issues: 8 closed here.** Tier 2: #634, #640, #643, #649, #651, #652 and #569. Tier 3: #508.
- **Top three:** #649 (selected strings and numbers at 3.8:1); #640 (two Invites with one name); #634 and #651 (the two flaky checks, each one failure from Tier 0).
- **The planner re-ranks it at its start.** #643 joined on 2026-11-14, once its wording was decided (C430). Whatever the maintainer has answered by then joins first, at Tier 2: #647's Registration guard (one Identity card), #529's accessibility check, and #535 with C220, C221 and C340 (#570). A new Tier 0 or Tier 1 issue goes ahead of all of it.
- **Thirteen cards.**
  - **The editor's selection** (#649): F22: Foundations decides the selection colours and takes the `--selection-match` token; then C404: the editor, `tokens.css`, the contrast test and the doc's copy of `tokens()`.
  - **Users** (#640): C405: the time of day in each pending Invite's name, and an e2e cleanup that cancels its own Invite.
  - **The error page** (#643): C430: a 404 reads "Not found" with "That page does not exist. The link may be old.", a Locked Topic "This Topic is locked." with "Complete its Prerequisites on the Map to open it.", and any other 403 "Forbidden". The page maps the wire code `TopicLocked` to the sentence.
  - **The Problem screen at a short phone** (#652; small, one batch PR in lane B): C406: one tab stop for the scrolling stage; C407: the Solution's editor takes the phone sizing; C408: the console's flex rule moves into `ResultsPanel.svelte`.
  - **Flaky checks:** C409: the eight-password-changes test does not depend on the runner's speed (#634). C410: `ci-gate.test.sh` depends on nothing outside the checkout (#651).
  - **The release gate** (#569): C411: publish-edge and the release gate wait on one list of test jobs.
  - **Tier 3, with room** (#508): C375: `accept.ts` and `app.ts` say what the code does; then C379: the module map's Identity and Web rows, with rows for `logging.ts` and `languages.ts`.
  - **Last:** C412, the exit check and `Release-As: 1.20.1`. It has no issue.
- **Issues → cards.** The milestone `Sprint 22 · Leftover bugs and CI gates` holds each of these issues.

  | Issue | Tier | Cards, in order | Last card | Lane conflicts (shared files, in this order) | Risks and review | Acceptance check |
  |---|---|---|---|---|---|---|
  | #649 Selected strings and numbers miss 4.5:1 | 2 | F22, C404 | C404 | None | A design call: whether a selection and its matches look alike is Foundations' to decide in F22 | `contrast.test.ts` holds ink, muted and accent on the selection background in both themes, at 4.5:1 or more |
  | #640 Two Invites share one name | 2 | C405 | C405 | None | None for security: the page's text and a test | `users.multi.e2e.ts` finds two different Cancel names for two Invites made in a row, and no cleanup uses `.first()` on an Invite |
  | #643 The error page's wording | 2 | C430 | C430 | None: `+error.svelte` and `error.e2e.ts` are C430's alone | None for security: the page's words; no gate, rule or status changes. Decided on the issue on 2026-11-14 (its table, no figure); the maintainer can change the wording | `error.e2e.ts` finds "Not found" and "This Topic is locked." as the h1, each with its message and a matching tab title, and no "TopicLocked" on the page |
  | #652 Short-phone leftovers | 2 | C406, C407, C408 | C408 | `ProblemWorkspace.svelte`: C406, then C408, after Sprint 20's C387. `problem.e2e.ts`: C406, then C407 | None. One batch PR | At 320×256 the Run button is one Tab press nearer, the Solution's editor shows six lines, and `grep -n ":global(.console)"` on the workspace prints nothing |
  | #634 The eight-password-changes test | 2 | C409 | C409 | None | The test must not weaken the hashing the app uses | The test passes 20 times in a row on a throttled CPU, or runs in under 1 s |
  | #651 ci-gate.test.sh failed once | 2 | C410 | C410 | `ci-gate.sh` and `ci-gate.test.sh`: C410, then C411 | A Codex second opinion (`.github/`) | `.github/ci-gate.test.sh` passes with the network off |
  | #569 CI's job list is written twice | 2 | C411 | C411 | After C410. `ci.yml`: after Sprint 21's C393 | It changes what a release waits for: the two-reader review. A required check's name must not change unnoticed | Adding a job to the test list in `ci.yml` alone makes the gate wait for it or fails `ci-gate.test.sh` |
  | #508 module-map's Identity rows | 3 | C375, C379 | C379 | `accept.ts`: after Sprint 20's C373; `app.ts`: after Sprint 21's C395; `module-map.md`: after Sprint 21's C396 | None. The row must name only seams that exist when the card runs | Every Identity seam the row names exists in `src/lib/server/identity/`, and the map has rows for `logging.ts` and `languages.ts` |

  - C412, the exit check, has no issue.
- **Small cards share a PR:** C406, C407 and C408 carry `Batch: P` and share one PR in lane B (`fix` type, one round). C375 (`Batch: A`) is lane A's only small card, so its PR is its own. C430 is not small (the mapping, a message line and its tests are more than about 15 lines), so its PR is its own too.
- **Reviews.** The orchestrator's two-reader review: C411. None for the rest.
- **Shared files**, each an ordered chain in one lane:
  - `ProblemWorkspace.svelte` and `problem.e2e.ts`: C406, C407, C408 (lane B, one PR).
  - `.github/ci-gate.sh` and `ci-gate.test.sh`: C410, then C411 (lane A).
- **Two lanes a round.**

  | Round | A · Users, CI and comments | B · Tests, the Problem screen and the editor | Design |
  |---|---|---|---|
  | 1 | C405 Invite names (#640) | C409 password test (#634) | F22 selection colours (#649) |
  | 2 | C410 ci-gate test (#651) | C406 + C407 + C408 (#652; batch) | |
  | 3 | C411 one job list (#569) | C404 editor selection (#649) | |
  | 4 | C375 comments (#508) | C430 error page (#643) | |
  | 5 | | C379 module map (#508) | |
  | 6 | C412 exit check and `Release-As: 1.20.1` | | |

  The Tier 3 cards run last, after every Tier 2 card has a lane.
- **Rounds: 8.** Five build rounds; the longest chain is two cards. There is one review. The last card and the cut add one round each.

**Exit:**
- All 13 Sprint 22 cards are Done, and `ci` is green on `main`. The sprint's Status counts issues closed and cards done, each per tier.
- `contrast.test.ts` holds the three text colours on the editor's selection background in both themes, and passes.
- `users.multi.e2e.ts` shows two same-day Invites with different names.
- `error.e2e.ts` shows "Not found" at an unknown path and "This Topic is locked." at a Locked Topic, and no "TopicLocked" on the page.
- At 320×256, `problem.e2e.ts` shows the Solution's editor at six lines, and `grep -n ":global(.console)" "src/routes/problems/[problemId]/ProblemWorkspace.svelte"` prints nothing.
- `.github/ci-gate.test.sh` passes with the network off, and fails when `ci.yml`'s test list and the gate's differ (or the gate waits on the one `tests` job).
- `docs/module-map.md` has rows for `logging.ts` and `languages.ts`.
- #508, #569, #634, #640, #643, #649, #651 and #652 are closed, 8 issues: 7 of Tier 2 and 1 of Tier 3.
- The orchestrator cuts 1.20.1 from the release PR and records the cut.

**Not in the sprint:**
- **#647, #529, and #535 with #570:** waiting on the maintainer (The ranking, above). Each joins at the re-rank once answered.
- **#666 and #667:** Tier 2, in the Backlog; the planner pulls them at the sprint's re-rank.
- **The other 29 Tier 3 issues:** in the Backlog. A sprint draws from them only when it has room, by value: #560 (the browser tests' Instance recipes) and #500 and #504 (the Problem screen's tested modules) are the strongest candidates.
- **Sprint 23** has no cards: `Sprint 23 · Unplanned`, Release option `R v1.20.2: Sprint 23 · Unplanned`. The planner fills and renames it from the ranking.

## The content sprints (#663, Tier 1)

**Goal:** the Topics are rewritten system-first: one spine system that the roadmap Topics build piece by piece, each Topic opening with the product problem and a plain-language intuition, and the language internals moved to a deep dive. The content session (`blc-content`, a separate clone) runs them beside the app sprints. They have no release of their own: each PR ships in the app release open when it merges.

- **Tier mix: 18 cards, all Tier 1,** for one issue, #663. They do not count toward an app sprint's 25.
- **Top three:** C388, the spine design; the maintainer's confirmation of the spine; then the first rewrite in the Map's order, C413 (Stacks).

### Content sprint 1 · The system spine

- **One card: C388,** `docs/product/system-spine.md`, written by Fable 5.2 and dispatched by the orchestrator beside Sprint 20. Commit type `docs`; it ships in the release open when it merges (1.19.7 if Sprint 20 is still open).
- **What the doc must contain** (from #663):
  - 2 or 3 candidate spine systems, real or new, with their trade-offs, and one picked with reasons;
  - one section per roadmap Topic, all 17, each with four answers: which piece of the system needs it, the real product problem that forces it, where it breaks at scale, and what the Problems then practice;
  - the spine's milestones, each of which gets a system-design Chapter or capstone;
  - the pacing rule, and one Topic's worked outline under it;
  - how the spine meets `docs/content-standards.md`, and what in each existing Topic is kept, moved to a deep dive, or dropped;
  - the order of the rewrites.
- **Exit:** the doc is on `main` with those parts, and **the maintainer has read it and picked or confirmed the spine.** Nothing in Content sprints 2 and 3 starts before that.
- A sprint of one card: the theme's backlog is one design, and it is not padded.

### Content sprints 2 and 3 · Topic rewrites

- **Seventeen cards, one per Topic,** each `Blocked by: the spine doc (C388) and the maintainer's confirmation of the spine`. They are placeholders: when the spine lands, the planner re-plans them from the spine's section for each Topic (files, order, lanes), and files **one card per spine milestone** for its system-design Chapter or capstone. The milestones cannot be named before the spine exists, so those cards are not filed yet.
- **Content sprint 2 · Topic rewrites, first half** (9 cards, in the Map's order): C413 Stacks, C414 Binary search, C415 Two pointers, C416 Hash tables, C417 Linked lists, C418 Sliding window, C419 Math and geometry, C420 Bit manipulation, C421 Trees.
- **Content sprint 3 · Topic rewrites, second half** (8 cards): C422 Backtracking, C423 Tries, C424 Heaps, C425 1-D dynamic programming, C426 Greedy, C427 2-D dynamic programming, C428 Graphs, C429 Intervals. The milestone cards join here or in a fourth content sprint, at the re-plan.
- **How they relate to #252 to #268 and #113.** Each of #252 to #268 is the human review of one Topic, the maintainer's. A rewrite card names its Topic's issue in its `Refs` line and changes the text that review would read, so the maintainer's review of the rewrite is that review, done once, on the new text. No card ends any of them, and no rewrite card ends #663: #252 to #268 are the maintainer's to close, and #663 stays open until its last milestone card, filed at the re-plan. #113 (Dynamic arrays, the 18th Topic in `content/`) has no rewrite card: whether Dynamic arrays is rewritten too is a question for the spine.
- **Each rewrite ends with the maintainer's review,** not an agent's merge alone (`CLAUDE.md`, `docs/content-standards.md`): every citation a primary source, opened by a person.
- **Release.** A rewrite of a Topic that has shipped is `feat` (`docs/agents/board.md`, Content PRs), so the app sprint open when the first one merges becomes a minor release. The rewrite cards carry no Release option until the re-plan sets it.
- **Issues → cards.**

  | Issue | Tier | Cards, in order | Last card | Lane conflicts | Risks and review | Acceptance check |
  |---|---|---|---|---|---|---|
  | #663 Content redesign, system-first | 1 | C388; then, after the maintainer confirms the spine, C413 to C429 and the milestone cards | A milestone card, not filed yet | Each rewrite edits one Topic's folder, so the rewrites do not share files; `content/content.json` and the Topic Map's Prerequisites change only if the spine says so, in one card. The app's #572 (Sprint 20) makes a newly Locked current Topic safe | The spine is the maintainer's to confirm. Human-verified content: the maintainer reviews every rewrite. Rewrites must not break a Learner's stored Build (stable ids) | `docs/product/system-spine.md` has its parts; after a Topic's rewrite its first Chapter opens with the product problem, and the content check passes |

## After each build sprint

After a sprint is released, a separate session reviews the architecture (`docs/agents/board.md`, After a major feature). Every finding becomes an issue with a Backlog ticket. The review proposes a tier for each finding. A Tier 0 one joins the current sprint, and the planner pulls the rest by tier.
