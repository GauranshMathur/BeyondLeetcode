# Sprints

Sprints are goal-based, not time-boxed: a sprint ends when its exit criteria hold. Every card carries a Sprint field on the board (IDs in `docs/agents/board.md`). The orchestrator works one sprint at a time and does not pull cards from a later sprint until the current one exits.

**Size and release** (from Sprint 14). A sprint is one coherent theme drawn from the open issues, typically 12 to 25 cards; each card is still one PR. A sprint is the unit of release: it ends with one release, whose version the orchestrator picks when it constructs the sprint and whose last card sets it with `Release-As`. Its changelog has fixed headings and is reviewed before the release PR merges (`docs/releasing.md`).

**Ordering rule.** Each screen is designed in the sprint that builds it, or the one just before. Foundations rules come first so every later screen is built responsive from day one. The one exception is mobile boards, which wait for Sprint 5.

**Only the current and planned sprints** (the maintainer's rule, 2026-11-10). When a sprint exits, its last card moves the sprint's section, its Status included, to `docs/sprints-archive.md`, which holds Sprints 0 to 22.

**The Backlog** (the maintainer's decision, 2026-11-11). Every open issue has a ticket on the board with Status Backlog and no sprint. The principal keeps the Backlog in priority order, tier first, and the orchestrator constructs each sprint from its top (`docs/agents/board.md`, Constructing a sprint). Only Tier 0 work joins the sprint in progress (a bug that hurts users, a security problem, a broken CI or release), with anything a planned card cannot be built without. The rules are in `docs/agents/board.md`, Issues are the unit of work.

**Tiers** (the maintainer's standing rule, 2026-11-14). Every open issue has one tier, assigned at intake with a one-line reason. The orchestrator fills each sprint strictly by tier, from the top of the Backlog, and the principal re-orders the Backlog at the start of every sprint and whenever a Tier 0 issue arrives. Each sprint's section gives its tier mix, and its exit Status the issues closed per tier. The rules are in `docs/agents/board.md`, Tiers.

- Tier 0 critical fixes: bugs that hurt users, security problems, broken CI or release.
- Tier 1 priority: the maintainer's new items, accessibility that blocks users, and anything that unblocks them.
- Tier 2 normal work.
- Tier 3 refactors and tidy-ups, drawn from only when a sprint has room.

**Content sprints** run beside the app sprints, in the content session's clone (`blc-content`). They have Sprint options of their own and no release: a content PR ships in the app release open when it merges. Their cards do not count toward an app sprint's 25.

**Issues first** (the maintainer's rule, 2026-11-10, #591). Each sprint plans issues, and its cards say how each issue is done. Each sprint's section lists issue → cards, with the last card that closes each issue. The rules are in `docs/agents/board.md`, Issues are the unit of work.

## The ranking (2026-11-18, re-ordered for two product issues filed from the spec)

Every open issue, 71 in all: none in Tier 0, 3 in Tier 1, 37 in Tier 2 and 31 in Tier 3. The Backlog was re-ordered on 2026-11-18, before the next sprint is constructed, because two product issues were filed from `docs/product/mvp1.md` that day and the order had to hold them. One issue has closed since the table of 2026-11-16 and has left it: #711, by its card C439 on 2026-11-16. Three are new here: #742 (filed from C439's review), and #744 and #745, the two parts of `mvp1.md` that were decided and never built. No tier changed.

The order is binding: the orchestrator takes issues from the top and passes over a row that waits on the maintainer or is the maintainer's own (`docs/agents/board.md`, Constructing a sprint). It is by tier first. Inside a tier a bug comes first, then the product issues and the issues the maintainer filed (the spec, learning content, then the two from `mvp1.md` and his CI brief), then the findings: user-facing quality, then hardening, and in Tier 3 the refactors. In the last column, "ready" means the issue waits on nobody; "waits on the maintainer" means a question on the issue is his to answer; "the maintainer's" means no agent starts it. The principal rewrites this table when it re-orders the Backlog, at the start of every sprint and whenever a Tier 0 issue arrives.

| Issue | Tier | Reason | Sprint |
|---|---|---|---|
| #661 Starting Language: a first-run choice and a setting, remembered per user | 1 | The maintainer's priority item: the starting Language. Every Learner meets it before the first Problem. Its boards are Done and its cards are cut. | Sprint 23 (cannot start: waits on the maintainer's answer on the schema) |
| #662 How to use the site: a short guide page, from the header and first run | 1 | The maintainer's priority item: the guide. The page and the header link shipped in 1.20.0; only the first-run offer is left, and it needs #661's choice page. | Sprint 23 (C402b, its last card; waits behind #661) |
| #663 Content redesign, system-first: a spine system the 17 Topics build, then per-Topic rewrites | 1 | The maintainer's priority item: the system-first content redesign, run by the content session beside the app sprints. The spine doc is on main; no rewrite starts before he confirms the spine. | Content sprints 2 and 3 (wait on the maintainer's nine answers) |
| #735 Dev mode: DEV_MODE=1 on an Instance not yet set up does nothing, and nothing says so | 2 | A bug, so it sits above the product rows: `DEV_MODE=1` on an Instance not yet set up does nothing and nothing says so, the likeliest first start of the maintainer's dev mode. A finding (the principal's audit of Sprint 22). | Backlog: ready |
| #647 Users: without JavaScript, two Registration saves in quick succession can be stored in the wrong order | 2 | A bug, low risk: the no-JavaScript Registration save can store the earlier of two choices. Whether to add a server-side guard, and which kind, is the maintainer's. A finding (a security reader). | Backlog: waits on the maintainer |
| #24 Spec: BeyondLeetcode MVP1 | 2 | The MVP1 spec: a tracking issue the maintainer keeps open; no agent card ends it. | Backlog (the maintainer's) |
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
| #744 Load test: the Runner under concurrent Submissions (k6), on demand and nightly | 2 | A product issue: `mvp1.md`'s Stack names k6 for load and says "not built yet". Nobody has measured what a shared Instance carries when a class presses Submit together, and the limits a Learner meets under load were set by reasoning. First of the ready product rows, because it is the one a Learner feels and it gives #742 its numbers. A measurement only: it changes no limit. | Backlog: ready |
| #745 Operators: rootless Docker, Podman and gVisor are promised, but not documented and never tried | 2 | A product issue: `mvp1.md` and ADR 0002 promise operators rootless Docker, Podman and gVisor "without code changes", and none of the three is documented or has been run once. Optional hardening, so the default Sandbox is not weaker without it; below #744 because no Learner sees it and it is the likelier to stop at the maintainer. | Backlog: ready (an engine that needs a Runner change, or cannot hold a limit, goes to the maintainer) |
| #535 CI: replace the deprecated Tailscale authkey, and decide RELEASE_PAT or a GitHub App token | 2 | From the maintainer's own brief (Sprint 17): the deprecated Tailscale auth key, and `RELEASE_PAT` or a GitHub App token. Neither breaks a release today. Its cards C220 and C221 are cut and wait on him. | No sprint (C220, C221): waits on the maintainer |
| #734 Dev mode: it has not been run once for real, or looked at in a browser | 2 | User-facing quality of the maintainer's dev mode: it shipped in 1.21.0 on scripted tests alone and has not been run once against the real Runner and content, or looked at in a browser. First among the findings because what it turns up feeds #737. A finding (the audit). | Backlog: ready |
| #737 Problem screen: the Dev view is short of its P13 board | 2 | User-facing quality: the Dev view is short of its P13 board, which the maintainer saw as Done. Two parts of the board wait on #728 and are outside it. A finding (the audit). | Backlog: ready |
| #698 Problem screen: the statement region's tab stop is set from the workspace by script, and the short-phone stage… | 2 | Accessibility that blocks nobody: at a short phone without JavaScript the stage scrolls with no tab stop, and the workspace sets another file's tab stop by script. A finding (a card review). | Backlog: ready |
| #728 Dev mode: three open questions (a compile error's outcome, Hidden Tests' details, the log for invalid content) | 2 | Three questions left over from dev mode (#660), all the maintainer's. It stays Tier 2: #660 was delivered by all seven of its own checks and is closed, so this is not one of his new items and no Tier 1 card waits on it; it holds back only two parts of #737, which is Tier 2. A finding (the build). | Backlog: waits on the maintainer |
| #736 Dev mode: is what the author does in it kept as real progress? | 2 | A question about behaviour the maintainer will see: what he does in dev mode is kept as real progress, and nobody asked him. Nothing is broken while dev mode has a database of its own. A finding (the audit). | Backlog: waits on the maintainer |
| #702 Editor (dark): a selection is faint on the panel, and a selection and its matches now look the same | 2 | A contrast question nobody has judged by eye: a selection in the dark editor is faint, and a selection and its matches look the same. The maintainer looks first. A finding (left open by #649). | Backlog: waits on the maintainer |
| #742 Sandbox: a killed fork bomb's container takes 5 to 15 s to die, and holds its Runner slot meanwhile | 2 | Hardening of the Runner's availability, and the one hardening row a Learner can feel: a fork bomb holds a slot for 15 to 25 s where other code holds it for 10 s, so one Learner can keep both slots busy for longer. It stays Tier 2: containment holds (1 CPU, 256 MiB, 64 pids), so it is not a security problem, and any code can already hold a slot for 10 s. Every option changes a Sandbox limit or flag, which is the maintainer's. A finding (the Sandbox reviewer, on C439). | Backlog: waits on the maintainer; the measurement it recommends first changes no limit and asks him nothing |
| #705 Runner: other sites still log whole errors, and a failed request's line no longer says what failed | 2 | Hardening of the Runner's log: other sites still print up to 500 characters of a daemon reply, and nearly every failure logs as plain `Error`, which hides what an operator looks for after an escape attempt. Not an escape. A finding (the Sandbox reviewer). | Backlog: ready |
| #709 CI: the content check's retry still prints the raw cause beside its annotation, and hides the Runner failure wh… | 2 | Hardening of a CI check: the content check's retry prints an unsanitised cause, and hides the Runner's failure when a wrong answer wins. A test file only. A finding (the Sandbox reviewer). | Backlog: ready |
| #719 CI: the review gate's labels are not tied to the commit that was reviewed | 2 | Hardening of the review gate: a label is not tied to the commit that was reviewed, so a later push stays green. It matters more once `review-gate` is a required check. All three options change what the gate enforces, so it is the maintainer's. A finding (the two-reader review). | Backlog: waits on the maintainer |
| #667 Sandbox reviewer: the checklist misses archive paths, the result channel, hidden Tests and its own trigger | 2 | Hardening of the checklist every Runner change is reviewed against; nothing is broken today. Three questions are the maintainer's. The fourth has answered itself (#673 merged on 2026-11-16), so its checklist-only lines no longer wait on him. A finding (the security readers). | Backlog: three questions wait on the maintainer; the checklist-only lines are ready |
| #570 Architecture: the release webhook's tailnet join and post are a drifted copy of notify.yml's, with no time limi… | 2 | Release hardening: a hanging tailnet join can fail publish-release after the image is pushed. Its card C340 edits the two workflows after C220 and C221 (#535). A finding (the architecture review). | No sprint (C340): waits behind #535, so on the maintainer |
| #529 Accessibility: an automated check in CI (axe, a new dependency, or a no-dependency contrast and landmark test) | 2 | Hardening: an automated accessibility check in CI. The no-dependency half shipped in 1.19.6; what is left is axe, a new dependency, which is the maintainer's call. Nothing else waits on it. A finding (the accessibility audit). | Backlog: waits on the maintainer |
| #738 Docs: ADRs 0005 and 0006 do not record what dev mode changed | 3 | A tidy-up of two decision records, half done: ADR 0006's amendment and the lines in `docs/decisions.md` are on main since 2026-11-16. ADR 0005 still does not name dev mode's mounted content folder, and a card-writer takes its `Rules` from it. First in the tier because a wrong ADR makes a wrong rule on a later card. The amendment is the principal's to write once the maintainer answers (is the mounted content folder a preview only?). | Backlog: waits on the maintainer |
| #560 Architecture: a browser test's Instance is started by six recipes in two languages, and one is found through /p… | 3 | Refactor: one recipe to start a browser test's Instance. Sprint 22 added one more (the `dev` project, a fourth web server on port 4176), so it is the strongest refactor in the tier. | Backlog: ready |
| #693 unit: change-password.test.ts could run on the in-memory test database and drop its 30 s timeout | 3 | Tidy-up, small: one unit test moves to the in-memory database and drops its 30 s timeout. Slow tests of this kind have become flaky ones before (#634, #676). | Backlog: ready |
| #566 Architecture: the Run's timing budget is about 20 constants related only by prose | 3 | Refactor: one module derives the Run's timing budget. It is the budget the fork-bomb test's bounds are read from, and #711's fix has settled those bounds. | Backlog: ready |
| #520 Architecture: a fourth Language is a short list, but three of its agreements are pinned by nothing | 3 | Refactor: tests pin a fourth Language's three agreements; nothing is wrong for today's three. Best before or beside the starting Language (#661), which reads the same list. | Backlog: ready |
| #500 Architecture: the Problem screen's view module is tested, but the screen does not run it | 3 | Refactor: the Problem screen should run its tested view module; no Learner sees a difference. | Backlog: ready |
| #501 Architecture: Sign in, Sign up and Accept invite are three copies of one account-form screen | 3 | Refactor: three account-form screens become one. | Backlog: ready |
| #502 Architecture: the renderer emits the Markdown scroll boxes, but four screens each style them | 3 | Refactor: one home for the Markdown scroll-box styles. | Backlog: ready |
| #503 Architecture: the Topic page works out the Main Line's steps itself, and ProblemTable takes props no caller var… | 3 | Refactor: the Topic page reads the Main Line's steps from the catalogue. | Backlog: ready |
| #504 Architecture: the Problem screen's driver and request encoding live in ProblemWorkspace.svelte, where only Play… | 3 | Refactor: the Problem screen's driver moves where Vitest reaches it. | Backlog: ready |
| #505 Architecture: the header model describes a phone bar that the phone does not draw | 3 | Refactor: the header model drops a phone bar nobody draws. | Backlog: ready |
| #515 Architecture: route tests reach under the account actions into Better Auth, and the actions' log rules are pinn… | 3 | Refactor: route tests stop reaching into Better Auth. | Backlog: ready |
| #516 Architecture: the route-policy table holds half of each route's access policy; the gate still spells /setup, th… | 3 | Refactor: the route-policy table takes the gate's last literals; a security rule, so its cards take the two-reader review. | Backlog: ready |
| #519 Architecture: the Runner process's wiring has no interface, so its one unit test copies it | 3 | Refactor: an interface for the Runner process's wiring. | Backlog: ready |
| #561 Architecture: the save protocol's server half is interleaved with I/O in the core shell | 3 | Refactor: the save protocol's server half as a pure function. | Backlog: ready |
| #562 Architecture: what a Build is (type, limits, path rule, equality, digest) is spelled across eight modules | 3 | Refactor: one module says what a Build is. | Backlog: ready |
| #567 Architecture: Engine is an undeclared 10-method type with 23 hand-cast partial fakes | 3 | Refactor: a declared Engine type and one fake. | Backlog: ready |
| #568 Architecture: the TypeScript and Python halves of the harness protocol meet only in Docker | 3 | Refactor: the harness protocol's two halves meet in a test without Docker. | Backlog: ready |
| #571 Architecture: the Unlock diff ("what this progress changed") is written twice | 3 | Refactor: the Unlock diff written once. | Backlog: ready |
| #573 Architecture: the NotFound / TopicLocked check runs about ten times a call, in two styles | 3 | Refactor: one NotFound / TopicLocked check per call. | Backlog: ready |
| #574 Architecture: two side channels tell the registration gate why a server-side sign-up is admitted | 3 | Refactor: one channel tells the registration gate why a sign-up is admitted; a security rule, so its cards take the two-reader review. | Backlog: ready |
| #575 Architecture: Learner steps in browser tests are written inline in each file | 3 | Refactor: one module of Learner steps for browser tests. | Backlog: ready |
| #576 Architecture: `sandboxConfig` mixes web-facing and Runner-internal facts; the port's `limits` is a hypothetical… | 3 | Refactor: sandboxConfig split by reader. | Backlog: ready |
| #577 Architecture: Change password and Sign up use different ordering conventions | 3 | Refactor: one ordering convention for Change password and Sign up. | Backlog: ready |
| #578 Architecture: the One-time password order is written twice | 3 | Refactor: the One-time password order written once. | Backlog: ready |
| #579 Architecture: smaller Learning core findings from the Sprint 17 review (five items) | 3 | Tidy-ups: five smaller Learning core findings. | Backlog: ready |
| #580 Architecture: smaller Runner findings from the Sprint 17 review (three items) | 3 | Tidy-ups: three smaller Runner findings. | Backlog: ready |
| #581 Architecture: smaller Identity findings from the Sprint 17 review (seven items) | 3 | Tidy-ups: seven smaller Identity findings. | Backlog: ready |
| #582 Architecture: smaller screen, test and CI findings from the Sprint 17 review (four items) | 3 | Tidy-ups: four smaller screen, test and CI findings. | Backlog: ready |
| #623 Architecture: the Main Line, its places and the Topic Map are computed only inside loadCatalogue | 3 | Refactor: a pure catalogue indexer. | Backlog: ready |
| #624 Architecture: the Admin functions throw five exported error classes under an actions object that answers codes | 3 | Refactor: the Admin functions answer codes instead of throwing five error classes. | Backlog: ready |

**Tier 0 is empty.** #711, the fork-bomb escape test that failed on `main` twice, closed on 2026-11-16: its card moved the test's bounds onto what the Runner owns (the kill and the remove) and set none on the kernel's teardown. What it left is #742, the slow teardown itself. No open bug hurts a Learner, no security problem is open, and `ci` and the release are green today.

**#742 is Tier 2, not Tier 0.** It was filed as Tier 2 and stays there by the definitions as written. It is not a security problem: the dying processes stay inside the container's limits, and nothing leaves the Sandbox. It is not a bug that hurts users today: the longest teardown seen was 14.9 s, and a Learner can already hold both slots for 10 s at a time with any loop. If the maintainer reads one Learner slowing the others as a security problem, the tier is his to change, and it would then be built at once.

**#728 stays Tier 2.** The audit of Sprint 22 said it holds the unfinished part of a Tier 1 item. By the tier definitions as written it does not: #660 met all seven of its own checks and is closed, so #728 is not one of the maintainer's new items; it is not accessibility; and no Tier 1 card waits on it. What waits on it is two parts of #737, a Tier 2 issue, and a dependency takes the tier of what it unblocks. Its three questions are still the first thing dev mode needs from the maintainer.

**What can be built now, top first:** #735, #744, #745, #734, #737, #698, #705 and #709 (Tier 2), with the checklist-only lines of #667 and the measurement #742 recommends; then Tier 3, #560, #693, #566 and #520 first. **Two of them are product issues: #744 and #745,** both from `docs/product/mvp1.md`. Every other ready row is a finding. The other open product issues are #661, #662 and #663 (Tier 1), which all wait on the maintainer; #24, #113 and #252 to #268 are his own. So a sprint constructed from the ready rows now has a product issue, where on 2026-11-16 it had none. #734, #735 and #737 come from the audit of his dev mode (#660); whether they count as product work is his to say.

**Waiting on the maintainer**, oldest first, with what each blocks. None of these is taken on a recommendation:

| Issue | Tier | Since | The question | Recommended | It blocks |
|---|---|---|---|---|---|
| #529 | 2 | 2026-11-08 | Add `@axe-core/playwright`, a new dependency, to check accessibility in CI? | No for now: the no-dependency tests shipped in 1.19.6 | Only the axe check; nothing else waits on it |
| #535 | 2 | 2026-11-08 | Create the Tailscale OAuth client and add the secret `TS_OAUTH_SECRET` (`docs/ci-credentials.md`, Part 1). And: keep `RELEASE_PAT`, or move release-please to a GitHub App token? | Create the OAuth client; keep `RELEASE_PAT` until the shared rate limit fails a release again | C220, C221, and C340 (#570) |
| #647 | 2 | 2026-11-11 | Add a server-side guard to the no-JavaScript Registration save, and which kind: a revision the form carries, or a single-use form token? | A revision the form carries and the action checks | One Identity card with the two-reader review |
| #661 | 1 | 2026-11-14 | May the starting Language be a stored per-Learner value, a schema change? | Yes: one nullable `startingLanguage` column on `Learner`, existing Learners set to `python` | All of Sprint 23: C397 to C400, and C402b, the last card of #662 |
| #663 | 1 | 2026-11-14 | The nine questions on the issue. The first holds everything: is the spine Parley, with its three side-systems? Then: Builds stay one per Topic; four milestone Topics (18 becomes 22); no reordering or rebuilt Builds in this pass; Read marks carry over; Dynamic arrays as the pilot; one line each in `CONTEXT.md` and the content standards; capstones may use the Language's own list, map and heap; rewrites may add Extra Problems | Yes to each, as `docs/product/system-spine.md` argues | C413 to C429, the 17 rewrite cards of Content sprints 2 and 3, and the milestone cards not yet filed |
| #667 | 2 | 2026-11-14 | Should the harness exit when `PR_SET_DUMPABLE` fails? Is the Sandbox base image pinned by digest or bumped on a schedule? Does the image-tag rule exempt comment-only changes to a Sandbox Dockerfile? | Exit; pin by digest; exempt comment-only changes | Item 5 (the harness) and the base-image work of #667. The checklist-only lines no longer wait: #673 has merged |
| #702 | 2 | 2026-11-15 | Look at a selection in the editor in dark and in light: is it easy enough to find, and to tell from its matches? | Look first; a second, stronger token only if the dark selection is hard to find | A design card and a code card, only if he says it is not fine |
| #719 | 2 | 2026-11-16 | How is a review label tied to the commit that was reviewed: a job that removes the labels on a push (wider permissions), a time check in the gate script (read-only), or leave it to the orchestrator's pinned merge? | The time check in the gate script | The gate's card; it should be answered before `review-gate` becomes a required check |
| #728 | 2 | 2026-11-16 | Three, on dev mode. Does Reference Code that does not compile get its own outcome with the compiler's message, in place of "Runner unavailable"? Does the Dev view show a Hidden Test's input, expected output and actual output, in dev mode only? Does the server log list the issues of invalid content in dev mode? | Yes; yes; no (the page already shows them, and it would be the logging rule's first exception) | The details row and the compile-error block of the P13 board (#737) |
| #736 | 2 | 2026-11-16 | Is what the author does in dev mode kept as real progress? | Yes, as built, if dev mode only ever runs on a database of its own; no, if he means to turn it on over the Instance he learns on | One card if the answer is no; a line in `CONTEXT.md` and the guide either way |
| #738 | 3 | 2026-11-16 | Is a mounted content folder supported only as an author's preview in dev mode, or also as a way to run an Instance for Learners on content that is not in the image? | The preview only | ADR 0005's amendment, the last part of the issue; ADR 0006's is on main |
| #742 | 2 | 2026-11-16 | A killed fork bomb's container takes 5 to 15 s to die and holds its Runner slot meanwhile. Which: a lower pids limit, freezing or killing the container's cgroup, lifting the CPU limit at the kill, or leave it? | Measure first (is the 1-CPU limit throttling the dying processes?), then choose; nothing is urgent | Any change to a Sandbox limit or flag for it. The measurement waits on nobody |

The maintainer's own, which no agent starts and which are not questions: #24 (the MVP1 spec, kept open), #113 (the human source review of Dynamic arrays, skipped at merge on 2026-10-11) and #252 to #268 (the human review of each of the other 17 Topics, open since 2026-10-26, each best done on the text its rewrite leaves). #570 waits behind #535 and asks him nothing of its own. #737 is ready, but wherever the screen and the board differ in a way he would see, he chooses which gives way. #698's second point, whether the stage keeps a tab stop before the script runs, is behaviour a keyboard user sees: if the card-reviewer cannot settle it from what is written, it goes to him. #745 is ready, but an engine that needs a change in the Runner, or under which a Sandbox limit does not hold, is a security rule and goes to him with the options, as does dropping an engine from `mvp1.md`'s line. #744 measures and changes no limit: a limit its numbers call into question is a new issue, and his if a Learner would notice it.

## Sprint 24 · Proof and operator checks

**Goal:** dev mode works on its first start and is proven by one real run; the Runner is measured under load and the operator hardening the spec promises is checked; three leftover findings are closed.

Release `R v1.21.1: Sprint 24 · Proof and operator checks`, version 1.21.1 (a patch: no card is `feat`). Milestone `Sprint 24 · Proof and operator checks`.

**Constructed on 2026-11-18 by the orchestrator, from the top of the Backlog.** It runs before Sprint 23, which cannot start until the maintainer answers #661. On 2026-11-16 the ready Backlog held no product issue, so no sprint was started and the maintainer was told; on 2026-11-18 the principal read `docs/product/mvp1.md` against the code and filed the two pieces of it that nobody had built or filed (#744, #745). Both are product issues by the written rule; neither is something a Learner sees, and the maintainer can stop the sprint with one line.

- **Issues: 7, all Tier 2,** in the Backlog's order: #735 (a finding, and a bug: `DEV_MODE=1` on an Instance not yet set up does nothing and says nothing), #744 (product: the k6 load test of the Runner), #745 (product: rootless Docker, Podman and gVisor for operators), #734 (a finding: dev mode has not been run once for real), #698 (a finding: the statement region's tab stop on a short phone), #705 (a finding: the Runner's other log sites), #709 (a finding: the content check's retry).
- **Passed over:** #737 (the Dev view is short of its P13 board) follows #734's run-through, and where screen and board differ the maintainer chooses. Everything that waits on him stays in the Backlog (the ranking, above).
- **Already Done in it:** C439 (#711, Tier 0 from 2026-11-16: the fork-bomb escape test bounds the hard stop's kill and the remove), merged before the sprint was constructed and released with it.
- **Cards** are cut by the card-writer, one run per issue, in the new format; each issue's `Cards:` comment lists them. The exit card is filed by the orchestrator when the others are cut.
- **Where an issue can stop at the maintainer:** #735, if he wants a note on the Setup screen as well as the start-up log line; #744, on how k6 is installed if that adds anything beyond k6 itself (the load never runs on his host, only on a hosted runner, on demand and nightly, never on a pull request); #745, if an engine needs a Runner change or a Sandbox limit does not hold under it (a security rule), and nothing is installed on his host; #734, on whether the Problem screen is usable with the per-request content read; #698's second point, if nothing written settles it.
- **Reviews:** a card-reviewer on every card. `sandbox-security-reviewer` on Runner cards (#705, #709, and #745 if it touches the Runner). The two-reader review on anything in `.github/` (#744's workflow) and on identity code.

**Exit:**
- Every Sprint 24 card is Done, and `ci` is green on `main`. The sprint's Status has the exit-check numbers (`docs/agents/board.md`, Sprint exit check).
- A start with `DEV_MODE=1` on an Instance not yet set up says so in the server's log (`app.test.ts`).
- The load test runs on demand on a hosted runner and reports what the Runner carried; no pull request waits on it.
- `docs/self-hosting.md` says, for each of rootless Docker, Podman and gVisor, what was tried and what an operator must do, or that it was not tried and why.
- #734 holds the record of one real dev-mode run: what was started, what was seen on each screen, and an issue for each thing that failed.
- Each of #698, #705 and #709 is closed by its last card, or says what part waits on the maintainer.
- The orchestrator cuts 1.21.1 from the release PR and records the cut.

**Not in the sprint:**
- **The starting Language (#661) and the guide's first-run offer (C402b):** Sprint 23, below.
- **#737,** and the questions on #728, #736, #738, #742, #719, #667, #702, #647, #535 and #529: the maintainer's.
- **The Tier 3 refactors:** in the Backlog.

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
