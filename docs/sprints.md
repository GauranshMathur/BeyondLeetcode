# Sprints

Sprints are goal-based, not time-boxed: a sprint ends when its exit criteria hold. Every card carries a Sprint field on the board (IDs in `docs/agents/board.md`). The orchestrator works one sprint at a time and does not pull cards from a later sprint until the current one exits.

**Size and release** (from Sprint 14). A sprint is one coherent theme drawn from the open issues, typically 12 to 25 cards; each card is still one PR. A sprint is the unit of release: it ends with one release, whose version the orchestrator picks when it constructs the sprint and whose last card sets it with `Release-As`. Its changelog has fixed headings and is reviewed before the release PR merges (`docs/releasing.md`).

**Ordering rule.** Each screen is designed in the sprint that builds it, or the one just before. Foundations rules come first so every later screen is built responsive from day one. The one exception is mobile boards, which wait for Sprint 5.

**Only the current and planned sprints** (the maintainer's rule, 2026-11-10). When a sprint exits, its last card moves the sprint's section, its Status included, to `docs/sprints-archive.md`, which holds Sprints 0 to 21.

**The Backlog** (the maintainer's decision, 2026-11-11). Every open issue has a ticket on the board with Status Backlog and no sprint. The principal keeps the Backlog in priority order, tier first, and the orchestrator constructs each sprint from its top (`docs/agents/board.md`, Constructing a sprint). Only Tier 0 work joins the sprint in progress (a bug that hurts users, a security problem, a broken CI or release), with anything a planned card cannot be built without. The rules are in `docs/agents/board.md`, Issues are the unit of work.

**Tiers** (the maintainer's standing rule, 2026-11-14). Every open issue has one tier, assigned at intake with a one-line reason. The orchestrator fills each sprint strictly by tier, from the top of the Backlog, and the principal re-orders the Backlog at the start of every sprint and whenever a Tier 0 issue arrives. Each sprint's section gives its tier mix, and its exit Status the issues closed per tier. The rules are in `docs/agents/board.md`, Tiers.

- Tier 0 critical fixes: bugs that hurt users, security problems, broken CI or release.
- Tier 1 priority: the maintainer's new items, accessibility that blocks users, and anything that unblocks them.
- Tier 2 normal work.
- Tier 3 refactors and tidy-ups, drawn from only when a sprint has room.

**Content sprints** run beside the app sprints, in the content session's clone (`blc-content`). They have Sprint options of their own and no release: a content PR ships in the app release open when it merges. Their cards do not count toward an app sprint's 25.

**Issues first** (the maintainer's rule, 2026-11-10, #591). Each sprint plans issues, and its cards say how each issue is done. Each sprint's section lists issue → cards, with the last card that closes each issue. The rules are in `docs/agents/board.md`, Issues are the unit of work.

## The ranking (2026-11-14, at Sprint 21's start)

Every open issue, 67 in all: none in Tier 0, 3 in Tier 1, 34 in Tier 2 and 30 in Tier 3. One more row is kept: #663, which the 1.19.7 release PR closed by mistake on 2026-11-14 (its changelog line reads "closes #663") and which is ranked as the open Tier 1 issue it is (`docs/agents/board.md`, Issues are the unit of work, Close). Sprint 20 closed ten issues, which have left the table: #507, #509, #510, #511, #514, #517, #565, #572, #637 and #666. Three were filed on 2026-11-14 and are new here: #676, #679 and #684. Inside a tier the order is the order of work: the sprint, then the issue number. "Backlog" means the issue's ticket waits in the Backlog column; "the maintainer's" means no agent starts it. The principal rewrites this table when it re-orders the Backlog, at the start of every sprint.

| Issue | Tier | Reason | Sprint |
|---|---|---|---|
| #662 How to use the site: a short guide page, from the header and first run | 1 | The maintainer's priority item: the guide page. Its board is Done, and the page and header link wait on nobody. | Sprint 21 (C401, C402a); closed in Sprint 22 (C402b) |
| #660 Dev mode: unlock everything, run reference solutions, and preview content from disk | 1 | The maintainer's priority item: dev mode. Its two boards are Done; its first card waits on the maintainer's answer. | Sprint 22 (waits on the maintainer) |
| #661 Starting Language: a first-run choice and a setting, remembered per user | 1 | The maintainer's priority item: the starting Language. Its two boards are Done; its first card waits on the maintainer's answer. | Sprint 22 (waits on the maintainer) |
| #663 Content redesign, system-first: a spine system the 17 Topics build, then per-Topic rewrites | 1 | The maintainer's priority item: the system-first content redesign, run by the content session beside the app sprints. The spine doc is on main; the rewrites wait on the maintainer's answers. | Content sprints 2 and 3 (wait on the maintainer). Closed by mistake on 2026-11-14 by the 1.19.7 release PR's body, and reopened the same day |
| #569 Architecture: CI's list of test jobs is written twice, so a new job gates edge but not a release | 2 | Release safety: a new CI job gates edge but not a release, and nothing warns. | Sprint 21 |
| #634 unit: the eight-password-changes test can pass the 5 s timeout on a slow runner | 2 | A flaky unit test that has failed on main once; a second failure makes it Tier 0. | Sprint 21 |
| #640 Users: two Invites from the same day share one name, and an e2e cleanup cancels the first Invite it finds | 2 | An accessibility bug for the Admin (two Invites share a name) and a test that can cancel another test's Invite. | Sprint 21 |
| #643 Error page: a Locked Topic's heading reads TopicLocked; the 403 and 404 wording is undecided | 2 | User-facing wording: a Locked Topic's page is headed TopicLocked. The wording was decided on 2026-11-14 (the issue's table, no figure); C430 builds it. | Sprint 21 |
| #649 Editor: selected strings and numbers miss 4.5:1, and the canvas lacks the selection-match token | 2 | A contrast bug in one state (selected strings and numbers at 3.8:1); it does not block a Learner. | Sprint 21 |
| #651 ci: .github/ci-gate.test.sh failed once in the lint job and passed on a re-run | 2 | A flaky CI script that has failed once, on a PR; a failure on main makes it Tier 0. | Sprint 21 |
| #652 Problem screen at a short phone: an extra tab stop, the Solution editor's size, and a cross-component style | 2 | Three small Problem-screen leftovers at the short phone viewport. | Sprint 21 |
| #676 unit: the 30-sign-ins test timed out again at 5 s on a slow runner | 2 | A unit test (the 30 sign-ins, which #555 made fast) that timed out once in CI, on a pull request; a failure on main makes it Tier 0. | Sprint 21 |
| #679 Runner and web logs: no rotation in compose.yaml, and the Runner's 500 line prints the whole error | 2 | Hardening of what the Runner and the web write to their logs: no rotation, and a 500 line that prints the whole error; nothing is broken today. | Sprint 21 |
| #684 CI: the content check's retry cannot say what failed, and the fixture check still runs four cases at… | 2 | Hardening of a CI check that was Tier 0 until #666 was fixed: the retry's annotation, and the fixture check's four cases at once. | Sprint 21 |
| #529 Accessibility: an automated check in CI (axe, a new dependency, or a no-dependency contrast and landmark test) | 2 | Hardening: an automated accessibility check in CI; the axe dependency is the maintainer's call. | Waits on the maintainer |
| #535 CI: replace the deprecated Tailscale authkey, and decide RELEASE_PAT or a GitHub App token | 2 | CI hardening: a deprecation warning and a shared rate limit, neither a broken release today; blocks C220, C221 and #570. | Waits on the maintainer |
| #570 Architecture: the release webhook's tailnet join and post are a drifted copy of notify.yml's, with no time… | 2 | Release hardening: a hanging tailnet join can fail publish-release after the image is pushed; C340 waits behind C220 and C221 (#535). | Waits on the maintainer |
| #647 Users: without JavaScript, two Registration saves in quick succession can be stored in the wrong order | 2 | A low-risk ordering bug in the no-JavaScript Registration save; whether to add a server-side guard is the maintainer's. | Waits on the maintainer |
| #667 Sandbox reviewer: the checklist misses archive paths, the result channel, hidden Tests and its own trigger | 2 | Hardening of the checklist every Runner change is reviewed against; nothing is broken today. Three of its parts are the maintainer's to decide. | Waits on the maintainer |
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
| #508 Docs: module-map's Identity and Web rows predate Sprint 14, and it has no home for the Language list | 3 | Tidy-up: stale comments and module-map rows; drawn into Sprint 21's room, after every Tier 2 card has a lane. | Sprint 21 |
| #500 Architecture: the Problem screen's view module is tested, but the screen does not run it | 3 | Refactor: the Problem screen should run its tested view module; no Learner sees a difference. | Backlog |
| #501 Architecture: Sign in, Sign up and Accept invite are three copies of one account-form screen | 3 | Refactor: three account-form screens become one; #514's screen half. | Backlog |
| #502 Architecture: the renderer emits the Markdown scroll boxes, but four screens each style them | 3 | Refactor: one home for the Markdown scroll-box styles. | Backlog |
| #503 Architecture: the Topic page works out the Main Line's steps itself, and ProblemTable takes props no caller… | 3 | Refactor: the Topic page reads the Main Line's steps from the catalogue. | Backlog |
| #504 Architecture: the Problem screen's driver and request encoding live in ProblemWorkspace.svelte, where only… | 3 | Refactor: the Problem screen's driver moves where Vitest reaches it. | Backlog |
| #505 Architecture: the header model describes a phone bar that the phone does not draw | 3 | Refactor: the header model drops a phone bar nobody draws; it touches the header after C402a. | Backlog |
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

**Tier 0 is empty today.** No open bug hurts users badly enough to stop a sprint, no security problem is open, and `ci` and the release are green. Three issues are one failure on main away from it: #634, #651 and #676, each a flaky check seen once. All three are in Sprint 21.

**The order of the sprints follows what can start.** The fill is strictly by tier, but a sprint whose every card waits on the maintainer cannot run. So Sprint 21 takes the Tier 1 cards that wait on nobody (the guide's page and header link) and then the Tier 2 work; the Tier 1 work that waits (#660, #661 and the guide's first-run offer) is Sprint 22, and starts when the maintainer answers.

**Waiting on the maintainer**, ranked, with what each blocks. A hard call is one the orchestrator does not take on a recommendation:

| Issue | Tier | The question | Recommended | It blocks |
|---|---|---|---|---|
| #660 | 1 | Is dev mode allowed on a Multi-user Instance, and who may use its actions there? | No: Local Mode only, and a Multi-user Instance with the switch set refuses to start. A hard call (a security rule) | C389, and C390 to C396 behind it: 8 of Sprint 22's 14 cards |
| #661 | 1 | May it add a stored per-Learner value, a schema change? | Yes: one nullable `startingLanguage` column on `Learner`, existing Learners set to `python`. A hard call (the schema) | C397, then C398 to C400 and #662's C402b |
| #663 | 1 | The nine questions on the issue: the spine (Parley), the milestones as four new Topics, Dynamic arrays as the pilot, and six more | The recommended answer to each is in `docs/product/system-spine.md`. Hard calls (content and what a Learner sees) | C413 to C429, the 17 rewrite cards of Content sprints 2 and 3, and the milestone cards not yet filed |
| #662 | 1 | The maintainer reads the guide's words before C401 merges | Read C401's PR when it is at green CI. Not a question, but only the maintainer can do it | C401's merge, then C402a, and Sprint 21's exit |
| #679 | 2 | Is a caller that disconnects mid-body its own Runner log kind, or silent? | Silent, as for a caller that leaves during the queue wait. Not a hard call: the orchestrator may take it | C435, then C433 (the docs), and so #679 |
| #667 | 2 | Should the harness exit when `PR_SET_DUMPABLE` fails? Is the Sandbox base image pinned by digest or bumped on a schedule? Does the tag rule exempt comment-only changes? And may its cards edit the agent definitions while draft PR #673 rewrites them? | Exit; pin by digest; exempt comment-only changes; cut the cards once #673 has merged or closed. Hard calls (the Sandbox's security, and the process PR is the maintainer's) | All of #667. Its checklist lines alone (items 1 to 4) could be one card in Sprint 21 if the maintainer allows the edit beside #673 |
| #535 | 2 | Create the Tailscale OAuth client (`TS_OAUTH_SECRET`); keep `RELEASE_PAT` or move release-please to a GitHub App token? | Create the OAuth client; keep `RELEASE_PAT` until the shared rate limit fails a release again. A hard call (a token and a new action) | C220, C221, and C340 (#570), which have no sprint |
| #647 | 2 | Add a server-side guard to the no-JavaScript Registration save, and which kind? | A revision the form carries and the action checks. A hard call (Identity, and possibly what the Instance stores) | One Identity card with the two-reader review |
| #529 | 2 | `@axe-core/playwright` (a new dependency), or the no-dependency contrast and landmark tests? | The no-dependency tests now; axe stays the maintainer's call. A hard call only for axe | The automated accessibility check; nothing else waits on it |

## Sprint 22 · Dev mode

**Goal:** the maintainer's dev mode ships: a switch for the author's own Local Instance that opens everything, runs any Problem's Reference Code and previews content from disk.

**Re-sliced on 2026-11-16, in progress.** The sprint was planned with a second half, the starting Language (#661) and the guide's first-run offer (#662's C402b). #661 needs a schema change, which is the maintainer's to allow; he has not answered and said not to take it for him. So that half moved to Sprint 23 as it stood (C397, C398, C399, C400 and C402b, with their Sprint and Release fields), and this sprint is dev mode alone: C389 to C396, C438 (cut on 2026-11-16 for the error page C395 left out) and the exit card C403, ten cards. Its Sprint and Release options and its milestone were renamed and kept their ids. Where the plan below names a moved card, read Sprint 23. Its issue count is one, #660; #661 and #662 close in Sprint 23.

Release `R v1.21.0: Sprint 22 · Dev mode`, version 1.21.0 (the next minor after Sprint 21's 1.20.0, because the cards are `feat`). Milestone `Sprint 22 · Dev mode`.

**Re-planned on 2026-11-14.** This was Sprint 21, at 1.20.0. It runs second because it cannot start, and starts as soon as the maintainer has answered the two questions below. **Started 2026-11-16:** the maintainer answered #660 (dev mode is not allowed on a Multi-user Instance, the answer C389 was written for), so the dev-mode cards run; #661 is still with him, and he said not to take it for him, so C397 to C400 and C402b are held. The guide's page and header link (C401, C402a) moved to Sprint 21; C402b, the first-run offer, is here because it edits #661's choice page.

- **Tier mix: 14 cards.** Tier 1: 13 (C389 to C400, C402b). The last card, C403, has no tier. No Tier 2 or Tier 3 card: the sprint is the priority items alone, and it is not padded.
- **Issues: 3 closed here, all Tier 1:** #660, #661 and #662. Their boards (S4, P13, S5, S6, F23, S7) are Done.
- **Top three:** #660 dev mode (C389 to C396); #661 the starting Language (C397 to C400); #662's last card, the guide offered on first run (C402b).
- **One of its two questions is answered** (below): #660 on 2026-11-16, so C389 to C396 run. C397, the first card of the starting-Language lane, still carries #661's question as its `Blocked by:` line.
- **Fourteen cards.**
  - **Dev mode** (#660): C389: the switch `DEV_MODE`, read once at start, off unless set, never set by the image. C390: with it on, the Learning core opens every Topic and writes nothing. C391: the core runs a Problem's Reference Code against its Tests, saving nothing. C392: the banner on every screen. C393: a dev-mode Instance and a `dev` Playwright project. C394: "Run reference solution" on the Problem screen, in each Language. C395: the catalogue is read from disk on each request. C396: the README, self-hosting, the module map and mvp1.md.
  - **Starting Language** (#661): C397: the stored value on `Learner`. C398: a Topic not yet started opens in it, and a Topic already worked on keeps its Language. C399: the first-run choice before the first Problem. C400: the Settings row.
  - **The guide** (#662): C402b: the first-run choice offers the guide. From S7's report: the offer ("New here? How to use the site") is drawn in the Guide board, not in the StartingLanguage board, and opening the guide from the choice page leaves the `next` redirect behind; the Learner returns with Back.
  - **Last:** C403, the exit check and `Release-As: 1.21.0`. It has no issue.
- **Issues → cards.** The milestone `Sprint 22 · Dev mode` holds #660; #661 and #662 moved to the milestone `Sprint 23 · The starting Language` on 2026-11-16.

  | Issue | Tier | Cards, in order | Last card | Lane conflicts (shared files, in this order) | Risks and review | Acceptance check |
  |---|---|---|---|---|---|---|
  | #660 Dev mode | 1 | S4, P13 (Sprint 20, Done); C389, C390, C391, C392, C393, C394, C395, C396 | C396 | `app.ts`: C389, C390, C395, after Sprint 21's C375. `core.ts`: C390, C391, then #661's C398. The Problem route's `+page.server.ts`: C394, then #661's C399. `a11y.e2e.ts`: C392, then C399, after Sprint 21's C401. `ci.yml`: C393, after Sprint 21's C411. `self-hosting.md` and `module-map.md`: C396, after Sprint 21's C433 and C379 | A switch that opens everything must be impossible to turn on from a request: the two-reader review on C389, C390, C391 and C394, and `sandbox-security-reviewer` on C391 (a new request through the Runner port, with no new flag, mount, image or limit). Unlocking and the reference run must write no progress row. A fourth e2e web server on a 2-CPU host | `bunx playwright test --project dev` passes (a fresh Learner opens the last Topic's last Problem, sees the banner on every screen, and gets a result per Test in three Languages), and `image-files.test.ts` fails if the image names `DEV_MODE` |
  | #661 Starting Language | 1 | S5, S6 (Sprint 20, Done); C397, C398, C399, C400 | C400 | `core.ts`: after C391. The Problem route's `+page.server.ts`: after C394. `language/+page.svelte`: C399, then #662's C402b | A schema change, the maintainer's to allow. Every e2e Learner would meet the first-run choice unless the test Learners are made with a Language (in C399). A Topic with saved code must keep its Language when the setting changes | `language.e2e.ts` shows a new Learner asked, with none preselected and JavaScript off; `settings.e2e.ts` shows the setting changed and kept after a reload |
  | #662 The guide | 1 | F23, S7 (Sprint 20, Done); C401, C402a (Sprint 21); C402b | C402b | `language/+page.svelte`: after C399. `guide.e2e.ts`: after Sprint 21's C402a | None: one link on a page that C399 builds | `guide.e2e.ts` reaches `/guide` from the first-run choice, as well as from the header |

  - C403, the exit check, has no issue.
- **Waiting on the maintainer.** Both are hard calls, asked on the issues on 2026-11-14, so the orchestrator does not take the recommended answer on its own:
  - **#660, answered 2026-11-16: no.** The question was: is dev mode allowed on a Multi-user Instance, and who may use its actions there? `mvp1.md` does not say. Recommended: no. It takes effect only in Local Mode, and a Multi-user Instance with the switch set refuses to start, as with `IDENTITY_TEST_LEARNER`. The maintainer reaches a Local Mode dev Instance over the tailnet. A security rule, so a hard call. C389 is written for this answer.
  - **#661: may it add a stored per-Learner value, a schema change?** The theme is a cookie, which does not follow an Account across browsers, and the issue asks for a value that survives signing out and in. Recommended: yes, one nullable `startingLanguage` column on `Learner`, with a migration that sets every existing Learner to `python`. A schema change, so a hard call. C397 is written for this answer.
  - If one is answered and not the other, that issue's lane can start: #660's cards need nothing of #661's, and #661's C398 and C399 follow #660's C391 and C394 only in shared files, an order the orchestrator can turn round when the Backlog is re-ordered.
- **Decided from the issues** (their own direction): Reset progress keeps the starting Language, as it keeps the theme; the switch's name, `DEV_MODE`, was proposed when the sprint was planned.
- **Small cards share a PR:** C402b carries `Batch: L` and is its batch's only card, so its PR is its own.
- **Reviews.**
  - The orchestrator's two-reader review (Fable and Codex): C389, C390, C391 and C394.
  - `sandbox-security-reviewer` before merge: C391.
  - None for the rest. C399 gets none provided `route-policy.ts` is untouched and its return address is checked.
- **Shared files**, each an ordered chain:
  - `app.ts` and `app.test.ts`: C389, C390, C395.
  - `learning/core.ts` and `core.test.ts`: C390, C391, C398 (lane A).
  - `problems/[problemId]/+page.server.ts`: C394, then C399 (lane A).
  - `a11y.e2e.ts`: C392, then C399.
  - `language/+page.svelte`: C399, then C402b.
- **Two lanes a round.**

  | Round | A · The core, the Problem screen and first run | B · Schema, layout, e2e, content and Settings |
  |---|---|---|
  | 1 | C389 the switch (#660) | C397 schema (#661) |
  | 2 | C390 unlock (#660) | |
  | 3 | C391 reference run (#660) | C392 banner (#660) |
  | 4 | C398 starting-Language rule (#661) | C393 dev e2e project (#660) |
  | 5 | C394 reference run on the screen (#660) | C395 catalogue from disk (#660) |
  | 6 | C399 first-run choice (#661) | C400 Settings row (#661) |
  | 7 | C402b the guide offered on first run (#662; small) | C396 dev-mode docs (#660) |
  | 8 | C403 exit check and `Release-As: 1.21.0` | |

- **Rounds: 14.** The longest chain is seven cards (C389, C390, C392, C393, C394, C399, C402b). There are five reviews (four two-reader, one sandbox). The last card and the cut add one round each.
- **No limit, flag or image changes.** C391 sends the Runner the same request shape and limits as a Submit. The image never sets `DEV_MODE`.

**Exit:**
- All 10 Sprint 22 cards are Done (C389 to C396, C438, C403), and `ci` is green on `main`. The sprint's Status counts issues closed and cards done, each per tier.
- With `DEV_MODE` unset: a Locked Topic answers 403, no banner is drawn, and the reference-run action is absent from the page and answers 404 (`problem.e2e.ts`, `a11y.e2e.ts`, `error.e2e.ts`).
- `image-files.test.ts` fails if the `Dockerfile` or the files `init` writes name `DEV_MODE`.
- `bunx playwright test --project dev` passes: a fresh Learner opens the last Topic's last Problem, the banner is on every screen, and "Run reference solution" shows a result per Test in Python, TypeScript and Go.
- `core.test.ts` shows every progress table unchanged by the dev-mode reads and the reference run, and the reference run's Runner requests carrying a Submit's limits.
- `app.test.ts` shows an edited Chapter file read on the next request in dev mode, with no restart.
- `grep -n "DEV_MODE" README.md docs/self-hosting.md` prints a start command in each.
- `hooks.server.test.ts` shows content that fails validation answered as its list of issues in dev mode and as the generic message with it off, and logged by class name only in both.
- #660 is closed, 1 issue, Tier 1. #661 and #662 are open, in Sprint 23.
- The orchestrator cuts 1.21.0 from the release PR and records the cut.

**Not in the sprint:**
- **Dev mode on a Multi-user Instance**, unless the maintainer answers otherwise.
- **#560** (one recipe to start a browser test's Instance): Tier 3. C393 adds a seventh recipe; the refactor waits in the Backlog.
- **#505** (the header model's phone bar): Tier 3; it touches `header.ts` after Sprint 21's C402a.
- **The content redesign (#663):** the content sprints, below.
- **The starting Language (#661) and the guide's first-run offer (C402b):** Sprint 23, below.

## Sprint 23 · The starting Language

**Goal:** each Learner chooses a starting Language before the first Problem and can change it in Settings, and the first-run choice offers the guide.

Release `R v1.22.0: Sprint 23 · The starting Language`, version 1.22.0 (the next minor after Sprint 22's 1.21.0, because the cards are `feat`). Milestone `Sprint 23 · The starting Language`.

**It cannot start.** #661 asks for a stored per-Learner value, a schema change, which is the maintainer's to allow (asked on the issue on 2026-11-14; recommended: yes, one nullable `startingLanguage` column on `Learner`, with a migration that sets every existing Learner to `python`). He has said not to take that answer for him.

- **Issues: 2, both Tier 1:** #661, and #662, whose last card is here.
- **Cards, moved from Sprint 22 on 2026-11-16 as they stood:** C397 (the stored value on `Learner`), C398 (a Topic not yet started opens in it), C399 (the first-run choice), C400 (the Settings row), C402b (the first-run choice offers the guide). They are in the old card format: when the sprint starts, the card-writer cuts them again against main, and the orchestrator files the exit card.
- **Shared files to order then:** `learning/core.ts` (C398, after Sprint 22's C391) and the Problem route's `+page.server.ts` (C399, after Sprint 22's C394).

**Exit:**
- Every Sprint 23 card is Done, and `ci` is green on `main`.
- `language.e2e.ts` and `settings.e2e.ts` pass with JavaScript off; `db.test.ts` shows an existing Learner holding `python`.
- `guide.e2e.ts` reaches `/guide` from the first-run choice.
- #661 and #662 are closed, 2 issues, both Tier 1.
- The orchestrator cuts 1.22.0 from the release PR and records the cut.

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

- **Seventeen cards, one per Topic,** each `Blocked by: the spine doc (C388) and the maintainer's confirmation of the spine`. They are placeholders: when the spine lands, the card-writer cuts them again from the spine's section for each Topic (files, order, lanes), and cuts **one card per spine milestone** for its system-design Chapter or capstone. The milestones cannot be named before the spine exists, so those cards are not filed yet.
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

After a sprint is released, a separate session reviews the architecture (`docs/agents/board.md`, After a major feature). Every finding becomes an issue with a Backlog ticket. The review proposes a tier for each finding. A Tier 0 one joins the current sprint, and the rest wait in the Backlog in the principal's order.
