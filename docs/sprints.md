# Sprints

Sprints are goal-based, not time-boxed: a sprint ends when its exit criteria hold. Every card carries a Sprint field on the board (IDs in `docs/agents/board.md`). The orchestrator works one sprint at a time and does not pull cards from a later sprint until the current one exits.

**Size and release** (from Sprint 14). A sprint is one coherent theme drawn from the open issues, typically 12 to 25 cards; each card is still one PR. A sprint is the unit of release: it ends with one release, whose version the `sprint-planner` picks when it plans the sprint and whose last card sets it with `Release-As`. Its changelog has fixed headings and is reviewed before the release PR merges (`docs/releasing.md`).

**Ordering rule.** Each screen is designed in the sprint that builds it, or the one just before. Foundations rules come first so every later screen is built responsive from day one. The one exception is mobile boards, which wait for Sprint 5.

**Only the current and planned sprints** (the maintainer's rule, 2026-11-10). When a sprint exits, its last card moves the sprint's section, its Status included, to `docs/sprints-archive.md`, which holds Sprints 0 to 17.

**Issues first** (the maintainer's rule, 2026-11-10, #591). Each sprint plans issues, and its cards say how each issue is done. Each sprint's section lists issue → cards, with the last card that closes each issue. The rules are in `docs/agents/board.md`, Issues are the unit of work.

## Sprint 18 · Submission, Runner and Identity seams

**Goal:** the architecture review's first steps, in the order it recommends. A Submission is judged by one module that seam 3 also runs, and a container cut-off is no longer the Learner's Time Limit Exceeded. The Runner's harness transcript and its container lifecycle each have one home. The Multi-user Instance is built by one Identity factory that tests share, the Admin actions are one object, and Better Auth's HTTP surface is an allowlist. Beside them land the review's cheap wins and the sign-in flake.

Release `R v1.19.5: Sprint 18 · Submission, Runner and Identity seams`, version 1.19.5 (patch, because no card is `feat`: the cards are `fix`, `refactor`, `test`, `ci`, `build` and `docs`). release-please's #554 already proposes 1.19.5.

- **One backlog plan, Sprints 18 to 23.** On 2026-11-10 the orchestrator asked the `sprint-planner` to plan every open engineering issue, under the maintainer's standing rule:
  - the separate architecture review after Sprint 17 (2026-11-10): #556 to #578, and the grouped smaller findings #579 to #582. Thirteen older issues got a comment from it that extends them;
  - the architecture issues of 2026-11-08: #500 to #505 and #512 to #521;
  - the docs issues #507 to #511, the accessibility issues #522 to #529, and #533;
  - #555, a flake on main.

  Sprint 18 takes the review's recommended order. Sprints 19 to 23 take the rest, each with its own release. #570 is a card with no Sprint (see Not in the sprint), and the content issues are not engineering work. Each issue was read against `main` at 8a877f0.
- **Twenty-nine cards: C223 to C246, then C341 to C345.** The maintainer added C341 to C345 on 2026-11-10, which takes the sprint past the usual 25.
  - **Process** (#591): C341 makes issues the unit of work and has the sprint-planner run on Fable. The same PR batches small cards, caps the architecture review, bans card and issue ids in code comments, and moves the exited sprints to `docs/sprints-archive.md`. It is the sprint's first card. The orchestrator works it.
  - **The maintainer's code follow-ups:**
    - C342 checks C222's seccomp filter against the kernel headers (#592). It is a `sandbox-security-reviewer` run by the orchestrator, with no PR.
    - C343 adds a test for `engine.ts`'s remove poll (#593), before C237.
    - C344 makes the 30-sign-in test fast and drops its own timeout (#555, reopened), after C234.
    - C345 is the comments-only small-fixes PR (#594), after every other code card.
  - **Submission** (`learning/`, the content check, the catalogue's guard):
    - C223 makes one module, `learning/submission.ts`, judge a Submission, and `submit-plan.ts` builds each batch's Runner request (#518).
    - Then C227 moves `core.test.ts`'s batch and Verdict tests to it, C231 runs the content check through it, and C233 makes the catalogue's guard measure its requests through the HTTP adapter's body size (#518).
    - C241 decides what a cut-off means, after C229 marks one (#556). It waits for the maintainer's answer.
  - **Runner** (`runner/`):
    - C225 moves the harness transcript's read rules into a decoder in `harness.ts`, one decoder per stream (#521).
    - Then C229: a result marks the Tests the container cut off (#556).
    - Then C235: one module runs a container (#557), and C237 moves the Engine's deadlines onto its primitive.
    - C239 makes the sandbox test helpers run containers through that module and decode with the Runner's decoder (#557, #521).
  - **Identity** (`identity/`, `app.ts`, the Users and auth routes):
    - C230: one factory builds the Multi-user Instance (#513).
    - Then C232 makes the test harness the factory's test variant, and C234 moves every other route test onto it (#513).
    - Then C236: one Admin actions object, C238: the Users route calls it, and C240: the auth route gets a bound handler, so Locals holds no Better Auth (#512).
    - Then C242: the auth route serves an allowlist, and C244 and C245 close `/sign-out` and `/sign-up/email` over HTTP (#558). Both wait for the maintainer's answer.
  - **Cheap wins:**
    - C224 gives sign-in.test.ts's 30-sign-in test its own timeout (#555);
    - C226 stops the e2e job building Sandbox images (#564);
    - C228 makes the Dockerfile copy the server source whole (#563);
    - C243 gives the Problem screen one read of what the Learner may do now (#559).
  - **Last:** C246, the exit check and `Release-As: 1.19.5` (`docs/releasing.md`, The last card).
- **Issues → cards.** Each issue closes when its last card merges (`docs/agents/board.md`, Issues are the unit of work). The milestone `Sprint 18 · Submission, Runner and Identity seams` holds each of these issues.

  | Issue | Cards, in order | Last card | Lane |
  |---|---|---|---|
  | #591 Process: issues are the unit of work | C341 | C341 | orchestrator |
  | #592 C222's seccomp filter checked | C342 | C342 | orchestrator (review) |
  | #518 One module judges a Submission | C223, C227, C231, C233 | C233 | A |
  | #521 The harness transcript decoder | C225, then C239 | C239 | A |
  | #556 A container cut-off is not TLE | C229, C241 | C241 | A |
  | #593 The remove poll's test | C343 | C343 | A |
  | #557 One module runs a container | C235, C237, C239 | C239 | A |
  | #559 What the Learner may do now | C243 | C243 | A |
  | #564 e2e builds no Sandbox images | C226 | C226 | B |
  | #563 The Dockerfile copies whole | C228 | C228 | B |
  | #513 One Multi-user factory | C230, C232, C234 | C234 | B |
  | #512 One Admin actions object | C236, C238, C240 | C240 | B |
  | #558 The auth route's allowlist | C242, C244, C245 | C245 | B |
  | #555 The 30-sign-in test | C224 (timeout; rejected), then C344 (fast) | C344 | B |
  | #594 No ids in code comments | C345 | C345 | last |

  - C239 completes both #521 and #557. Its `Issue` field holds #557, and its `Refs` line names both.
  - C240 also does the auth-route item of #581, which stays open. Its milestone waits for the re-plan of Sprints 19 to 23.
  - C241 closes #556 with its small step. The issue's larger step, where the Runner owns how many Tests fit a container, is not planned.
  - C246, the exit check, has no issue.
  - #581 stays open: C240 does its auth-route item, and Sprint 20 the rest.
- **Waiting on the maintainer**, each with a recommended answer the orchestrator takes unless the maintainer says otherwise (none is a hard call):
  - **#556: what does a cut-off mean to the Learner?** Recommended: RunnerUnavailable, in Run and in Submit. It never shows a false Verdict, records nothing, adds no Runner call, and leaves `maxSubmitCalls` and the catalogue's guard as they are. The other options were a re-run of the batch, or TLE only when the cut Test was the Learner's own. C241 waits for it.
  - **#558: close `/sign-up/email` and `/sign-out` over HTTP?** Recommended: close both. No screen uses either, every form calls `auth.api` server-side, and `user.create.before` stays the backstop. C244 and C245 wait for it. If the two security readers split on either card, it waits for the maintainer.
  - **#521: does a duplicate `i` fail the Run?** Recommended: yes, as #482's "fail loudly" decided for the other malformed lines. It is part of C225.
- **Reviews.**
  - `sandbox-security-reviewer` before merge: C225, C229, C231, C233, C235, C237 and C239. They are every card under `src/lib/server/runner/`.
  - The orchestrator's two-reader review (Fable and Codex): C230, C236, C238, C240, C242, C244 and C245. They are every card that moves Identity wiring, the gate or the auth surface.
  - C232 and C234 are test code and a dead type variant, as C139 and C143 were in Sprint 14. C228 changes the app image, not a Sandbox image or a flag, and the Runner role's files are already copied whole.
- **Shared files**, each an ordered chain:
  - `learning/submission.ts`: C223, then C241. `learning/submission.test.ts`: C223, C227, then C241.
  - `learning/core.ts`: C223, then C241. `learning/core.test.ts`: C227, then C241.
  - `docs/module-map.md`: C223, C233, then C241.
  - `runner/harness.ts`, `harness-decoder.test.ts` (new in C225) and `port.ts`: C225, then C229.
  - `runner/sandbox.ts` and `sandbox.test.ts`: C225, then C235.
  - `runner/container.ts` (new in C235): C235, then C237.
  - `runner/http-adapter.sandbox.test.ts`: C229, then C239.
  - `routes/signin/sign-in.test.ts`: C224, then C234.
  - `lib/server/app.ts`: C230, C232, C238, then C240.
  - `identity/multi-user-instance.ts` (new in C230): C230, C236, C238, then C240.
  - `routes/users/users.test.ts`: C232, then C238.
  - `identity/accounts.ts`: C236, then C238. `identity/accounts.test.ts`: C234, then C236.
  - `src/app.d.ts`: C238, then C240.
  - `identity/auth-handler.ts` and its test: C240, C242, C244, then C245. `identity/auth.ts`: C244, then C245.
  - C236 also waits for C228, because `accounts.ts` is in `reset-admin-password`'s import graph, which the Dockerfile then copies whole.
- **Two lanes a round** (`docs/agents/board.md`, Resources). Lane A holds the Submission and Runner cards, one at a time, because the `sandbox` tests share one lock. Lane B starts with the cheap wins, then runs the Identity chain.

  | Round | A · Submission and Runner | B · Cheap wins, then Identity |
  |---|---|---|
  | 1 | C223 Submission module (#518) | C224 sign-in timeout (#555) |
  | 2 | C225 transcript decoder (#521) | C226 e2e builds no images (#564) |
  | 3 | C227 batch tests move (#518) | C228 Dockerfile copies whole (#563) |
  | 4 | C229 cut-off mark (#556) | C230 Multi-user factory (#513) |
  | 5 | C231 content check (#518) | C232 harness is the factory's variant (#513) |
  | 6 | C233 guard measures the requests (#518) | C234 every route test on it (#513) |
  | 7 | C235 container module (#557) | C236 Admin actions (#512) |
  | 8 | C237 Engine deadlines (#557) | C238 Users route (#512) |
  | 9 | C239 sandbox helpers (#557, #521) | C240 auth route handler (#512) |
  | 10 | C241 cut-off is RunnerUnavailable (#556) | C242 allowlist (#558) |
  | 11 | C243 what the Learner may do (#559) | C244 `/sign-out` closed (#558) |
  | 12 | | C245 `/sign-up/email` closed (#558) |
  | 13 | C246 exit check and `Release-As: 1.19.5` | |

  If the maintainer has not answered by round 10, lane A runs C243 first.
- **Rounds: 28.**
  - The longest chain is nine cards (C230 to C245 in lane B), and lane B's twelve cards set the build: twelve rounds.
  - There are 14 reviews: seven sandbox and seven security. A review of one lane's card can run while the other lane builds.
  - The last card and the cut add one round each.
- **No limit, flag or image changes.** ADR 0002 stands: one fresh hardened container per Run, with the same flags. C228 changes what the app image copies, not what it runs.

**Exit:**
- All 29 Sprint 18 cards are Done, and `ci` is green on `main`. The sprint's Status counts both issues closed and cards done.
- C342's review verdict is on #592. `grep -rnE '(//|#|\*).*(\bC[0-9]{2,3}[a-z]?\b|#[0-9]{2,3}\b)' src --include=*.ts --include=*.svelte --include=*.py` prints no comment line. The 30-sign-in test declares no timeout of its own.
- `grep -n "runSubmission\|export function judge\|export function submitPlan" src/lib/server/learning/rules.ts` prints nothing, and `content-check.sandbox.test.ts` imports nothing from `learning/rules.ts`.
- `grep -n "LONGEST_LANGUAGE_ID\|FILE_JSON_OVERHEAD" src/lib/server/content/catalogue.ts` prints nothing.
- `grep -n "TextDecoder\|harnessLine\|removeCreatedByName\|function within" src/lib/server/runner/sandbox.ts` prints nothing.
- A seam-1 test scripts a cut-off and gets the answer the maintainer chose (recommended: RunnerUnavailable).
- ci's `e2e` job neither pulls an image nor calls `build-sandbox-images.sh`, and the Dockerfile names no single file under `src/lib/server/identity/`.
- `grep -rln "createAccountActions(" src` lists only `account-actions.ts`, `account-actions.test.ts` and `multi-user-instance.ts`, and `grep -rn "kind: 'later'\|multiUser\.auth" src` prints nothing.
- `auth-handler.test.ts` shows a Better Auth path outside the allowlist answering 404.
- #512, #513, #518, #521, #555, #556, #557, #558, #559, #563, #564, #591, #592, #593 and #594 are closed, 15 issues. #581 stays open.
- Sprint 19 does not start until the maintainer answers the wontfix proposals for the open `architecture` issues (2026-11-10).
- The orchestrator cuts 1.19.5 from release PR #554 (`docs/releasing.md`) and records the cut. Releases stay `1.x`.

**Not in the sprint:**
- **#556's larger step**, where the Runner owns how many Tests fit a container and the core sends isolation groups: speculative, size L, and it touches `maxSubmitCalls` and the adapter-timeout arithmetic. It is not planned. Sprint 19's budget module (C255) is where it would start if the maintainer wants it.
- **#570**, the release webhook's shared notify script: card C340, with no Sprint. It edits `notify.yml` and `release.yml`, as C220 and C221 do, so it goes after them. C220 and C221 stay Todo with no Sprint, waiting on the maintainer's answer to #535.
- **Content and the spec:** #113, #252 to #268 and #24 are not engineering work. They stay open, `ready-for-human` or `ready-for-agent` as they are.
- **Everything else in the backlog** is planned in Sprints 19 to 23, below. Those sections are re-planned issue first by the Fable sprint-planner (the maintainer's rule, 2026-11-10). The issues proposed for wontfix wait for the maintainer.

## Sprint 19 · Runner and the Build

**Goal:** the Runner's remaining review findings land on top of Sprint 18's container and decoder modules. The Runner process has one factory and the Engine has narrow, typed seams. The Run's timing budget is one tested module, and the web cannot import the Runner's internals. What a Build is, and what the Runner accepts, each have one home. Both halves of the harness protocol meet in a fast test, a fourth Language added halfway fails fast tests, and every Runner failure says what kind it was.

Release `R v1.19.6: Sprint 19 · Runner and the Build`, version 1.19.6 (patch, because no card is `feat`: the cards are `refactor`, `test`, `fix`, `ci` and `docs`).

- **Scope.** The Runner and Build issues of the 2026-11-08 and 2026-11-10 reviews: #519, #520, #562, #565, #566, #567, #568, #576 and #580, and #517's fake.
- **Eighteen cards, C247 to C264.**
  - **Runner process, Engine, config and port** (`sandbox.ts`, `engine.ts`, `config.ts`, `port.ts`):
    - C247 drops `ensureImages`, a stale comment and `imageFor`'s dead branch (#580, #520).
    - Then C249: one Runner-process factory (#519), with C251 starting the Runner one way in `start.sandbox.test.ts` (#519).
    - Then C253: narrow Engine interfaces and one in-memory fake daemon (#567), with C256 sharing the socket-daemon fixtures (#567).
    - Then C255: one budget module for the Run's timing (#566).
    - Then C257: the config split by reader (#576).
    - Then C259: one browser-safe Build module (#562), then C261: one request rule beside the port's schema (#562), then C263: the Runner logs its 400s and 401s (#565).
  - **Harness, the fake and tests:**
    - C248: the harness protocol's host round trip (#568), then C250: the Language table's `exec`, stream and emitted files tied to their other side (#520).
    - C252: the scripted Runner answers an Extra from the Main Line place (#517).
    - C254: the port contract runs once for each Language (#520).
    - C258: one script lists the Sandbox images, with a test (#520).
    - C260: one Runner per sandbox run, and the sandbox tests split by concern (#580).
    - C262: the web says which kind of Runner failure it saw (#565).
  - **Last:** C264, the exit check and `Release-As: 1.19.6`.
- **Issues closed.**
  - C248 closes #568, C251 #519, C255 #566, C256 #567, C257 #576.
  - C258 closes #520, after C247, C250 and C254. C260 closes #580, after C247.
  - C261 closes #562, after C259. C263 closes #565, after C262.
  - #517 stays open for Sprint 23's C317.
- **Decided before the sprint** (recommended answers, none a hard call):
  - **#576's open question, whether `limits` stays on the port:** it stays, as #107's closing note kept it for the tests. Only the config splits.
  - **#580's third item and #567, both "worth exploring":** planned, because Sprint 18's container module makes both cheap.
  - **C255's slot hold:** the budget test records the longest hold against the adapter timeout (about 52 s against 30 s) rather than changing a value.
- **Reviews.**
  - `sandbox-security-reviewer` before merge: every card under `src/lib/server/runner/`, which is all of them but C258. That is C247 to C257 and C259 to C263, sixteen cards.
  - The orchestrator's two-reader review: C258, which changes how the publish job (`packages: write`) finds its images.
- **Shared files**, each an ordered chain:
  - `runner/sandbox.ts`: C247, C249, C253, then C255. `sandbox.test.ts`: C247, C249, then C253.
  - `runner/runner-process.test.ts` (new in C249): C249, then C253.
  - `runner/engine.ts` and `container.ts`: C253, then C255.
  - `runner/config.ts`: C255, C257, then C261. `port-config.ts` (new in C257): C257, then C261.
  - `runner/port.ts`: C259, then C261. `runner/http-adapter.ts`: C257, then C262. `runner/server.ts` and its test: C261, then C263.
  - `learning/core.ts`, `content/catalogue.ts` and `submit-plan.ts`: C257, then C259. `runner/scripted-catalogue.ts`: C252, then C259.
  - `runner/harness.py` and `harness.test.ts`: C248, then C250.
  - `runner/http-adapter.sandbox.test.ts`: C254, then C260. `escape.sandbox.test.ts`: C255, then C260. `wait-healthy.testutil.ts`: C251, then C260.
- **Two lanes a round.** Every card but C258 runs the `sandbox` tests or touches the Runner, so the heavy jobs take the shared lock one at a time.

  | Round | A · Runner process, Engine, config and port | B · Harness, fake and tests |
  |---|---|---|
  | 1 | C247 `sandbox.ts` cleanups (#580, #520) | C248 protocol round trip (#568) |
  | 2 | C249 Runner-process factory (#519) | C250 table's exec, stream, emits (#520) |
  | 3 | C251 one Runner start (#519) | C252 scripted Runner and Extras (#517) |
  | 4 | C253 narrow Engine, fake daemon (#567) | C254 contract per Language (#520) |
  | 5 | C255 budget module (#566) | C256 socket-daemon fixtures (#567) |
  | 6 | C257 config by reader (#576) | C258 image list script (#520) |
  | 7 | C259 Build module (#562) | C260 one Runner per sandbox run (#580) |
  | 8 | C261 request rule (#562) | C262 failure kinds on the web (#565) |
  | 9 | C263 Runner logs 400s and 401s (#565) | |
  | 10 | C264 exit check and `Release-As: 1.19.6` | |
- **Rounds: 28.**
  - The longest chain is eight cards (C247, C249, C253, C255, C257, C259, C261, C263), and lane A's nine cards set the build: nine rounds.
  - There are 17 reviews: sixteen sandbox and one security.
  - The last card and the cut add one round each.
- **No limit, flag or image changes.** C255 names the timing constants without changing one. C257 moves facts between files. C261 changes what the scripted fake refuses, not what the Runner accepts.

**Exit:**
- All 18 Sprint 19 cards are Done, and `ci` is green on `main`.
- `grep -rn "ensureImages\|as unknown as Engine" src/lib/server/runner` prints nothing, and `main.ts` holds no ready set.
- `budget.test.ts` holds the Run's timing inequalities, and `web-isolation.test.ts` fails if a web module imports `runner/config.ts`.
- `MAX_BUILD_BYTES`, Build equality and `filesDigest` are each defined only in `src/lib/build.ts`, and `grep -rn "maxFiles" src/lib/server` prints nothing.
- `harness.test.ts` round-trips the protocol through `harness.py` in the `unit` job, and `lint` runs `sandbox-images.test.sh`.
- `grep -rln "startTestRunner(" src/lib/server/runner/*.sandbox.test.ts` prints nothing.
- #519, #520, #562, #565, #566, #567, #568, #576 and #580 are closed. #517 stays open for Sprint 23.
- The orchestrator cuts 1.19.6 from the release PR and records the cut. Releases stay `1.x`.

**Not in the sprint:**
- **#556's larger step** (see Sprint 18).
- **#507's Runner notes** wait for Sprint 22's docs (C305), which document the failure kinds C262 and C263 log.

## Sprint 20 · Identity forms and policy

**Goal:** Identity's remaining findings land on top of Sprint 18's factory and Admin actions. What a valid new Account looks like is one check, and every sign-up refusal is one total map. The account actions are tested at their own interface and the routes against a scripted adapter. The gate reads Setup and the must-change page from its table, and an admission and the Invite cookie each have one owner. The account-form screens share one shell and one field.

Release `R v1.19.7: Sprint 20 · Identity forms and policy`, version 1.19.7 (patch, because no card is `feat`: the cards are `fix`, `refactor` and `test`).

- **Scope.** #501, #514, #515, #516, #574, #577, #578 and #581 (all but its auth-route item, done in Sprint 18).
- **Nineteen cards, C265 to C283.**
  - **Identity modules:**
    - C265: one new-Account field check, and the first Admin's sign-up answers codes (#514).
    - C267: one private step holds the One-time password order (#578).
    - C269: the account actions' refusals, logs and leaks tested at their interface (#515).
    - C271: the gate reads Setup and the must-change page from the route-policy table (#516).
    - C273: Change password reads its fields the way Sign up does (#577).
    - C275: one admission context for server-side sign-ups, then C277: `invites.ts` owns the Invite cookie (#574).
    - C279: the owner's log codes travel through `LogPatterns`, C281: the secret check's `lengthFirst` goes, and C282: the web env's names written once (#581).
  - **Routes, forms and screens:**
    - C266: one shell for the three account forms, then C268: one field component (#501).
    - C270: the Setup route maps the first Admin's codes (#514), then C272: one module answers every sign-up refusal (#514).
    - C274: Sign in and Sign out tested against a scripted account-actions adapter, then C276: the other three form routes (#515).
    - C278: `resolve` gives one answer and carries the mode it used (#581).
    - C280: the account-form route factories become plain exports (#581).
  - **Last:** C283, the exit check and `Release-As: 1.19.7`.
- **Issues closed.** C267 closes #578, C268 #501, C271 #516, C272 #514, C273 #577, C276 #515, C277 #574, and C282 #581, after C278, C279, C280 and C281 (and Sprint 18's C240).
- **Decided before the sprint** (recommended answers, none a hard call):
  - **#516:** the review's narrower direction. The gate reads `audience === 'setup'` and the table marks the must-change page, while `?convert` and the held Account's sign-out stay as code.
  - **#581's two "speculative" items** (the mode read twice, and three shapes for one answer): both done, in C278, because they share `resolve`'s answer.
  - **#514:** Setup trims a padded email as Sign up does, and Sign up's unreadable body answers 400 as Accept invite's does. Both follow the issue's direction, so C265 and C272 are `fix`.
- **Reviews.**
  - The orchestrator's two-reader review: C265, C267, C270, C271, C272, C273, C275, C277, C278, C279, C281 and C282. Each changes where an Identity, gate, log or secret rule lives.
  - None for C266, C268, C269, C274, C276 and C280: screens with no rule, test code, and route wrappers.
  - No card touches the Runner.
- **Shared files**, each an ordered chain:
  - `identity/account-actions.ts`: C265, C273, then C275. `account-actions.test.ts`: C265, C269, then C273.
  - `identity/account-creation.ts`: C265, C277, then C279. `identity/setup.ts`: C265, C270, then C275.
  - `signin/`, `signup/` and `invite/[token]/+page.svelte`: C266, then C268.
  - `signup/sign-up.ts`: C272, then C280. `sign-up.test.ts`: C272, C276, then C280.
  - `invite/[token]/accept.ts`: C272, C277, then C280. `accept.test.ts`: C272, C276, then C280.
  - `account/password/change-password.ts`: C272, C273, then C280. `change-password.test.ts`: C273, C276, then C280.
  - `signin/sign-in.test.ts`: C274, then C280. `identity/auth.ts`: C271, then C281.

  | Round | A · Identity modules | B · Routes, forms and screens |
  |---|---|---|
  | 1 | C265 field check (#514) | C266 account-form shell (#501) |
  | 2 | C267 One-time password order (#578) | C268 account field (#501) |
  | 3 | C269 actions tested at their interface (#515) | C270 Setup maps codes (#514) |
  | 4 | C271 gate reads the table (#516) | C272 one refusal map (#514) |
  | 5 | C273 Change password's fields (#577) | C274 scripted adapter: Sign in, Sign out (#515) |
  | 6 | C275 admission context (#574) | C276 the other form routes (#515) |
  | 7 | C277 Invite cookie (#574) | C278 one answer from `resolve` (#581) |
  | 8 | C279 owner's log codes (#581) | C280 plain route exports (#581) |
  | 9 | C281 `lengthFirst` goes (#581) | |
  | 10 | C282 web env names (#581) | |
  | 11 | C283 exit check and `Release-As: 1.19.7` | |
- **Rounds: 24.**
  - The longest chain is eight cards (C265, C270, C272, C273, C275, C277, C279, C282), and lane A's ten cards set the build: ten rounds.
  - There are 12 security reviews.
  - The last card and the cut add one round each.

**Exit:**
- All 19 Sprint 20 cards are Done, and `ci` is green on `main`.
- `grep -rn "InvalidFirstAdminError\|OUR_CODES\|lengthFirst" src` prints nothing.
- A `RefusalCode` with no answer fails `bun run check`, and Sign up answers an unreadable body with 400.
- `grep -n "auth.api\|internalAdapter\|signUpEmail" src/routes/signin/sign-in.test.ts src/routes/signup/sign-up.test.ts "src/routes/invite/[token]/accept.test.ts" src/routes/settings/signout.test.ts src/routes/account/password/change-password.test.ts` prints nothing.
- `grep -n "'/setup'\|'/account/password'" src/lib/server/identity/gate.ts` prints nothing.
- The three account-form pages render through one shell and every field through `AccountField.svelte`.
- #501, #514, #515, #516, #574, #577, #578 and #581 are closed.
- The orchestrator cuts 1.19.7 from the release PR and records the cut. Releases stay `1.x`.

**Not in the sprint:**
- **#508**, the module map's Identity and Web rows: in Sprint 22 (C307), once this sprint's seams have landed.
- **The e2e half of #581's env item** (`signin.multi.e2e.ts` setting `process.env`): in Sprint 22's C310, with `startFreshServer`.

## Sprint 21 · Accessibility

**Goal:** the 2026-11-08 accessibility audit's findings are fixed. Run, Submit and Hint results are announced and focus lands where the Learner is; same-page navigations and saves keep focus; selects wait for Save; every action names its target; text and focus marks pass contrast; the Problem screen reflows at 400% zoom; and every screen has one `main`, a title and one h1, with a test that keeps it so. The Markdown renderer stops passing raw HTML, which also restores two Chapters' lost words.

Release `R v1.19.8: Sprint 21 · Accessibility`, version 1.19.8 (patch, because no card is `feat`: the cards are `fix`, `refactor` and `test`, and four design cards open no PR).

- **Scope.** The accessibility issues #522 to #529, #533 (its lost words are a reading fault, and its fix shares the renderer with #528's h1), and #582's theme item, which the issue says to do with #524.
- **Twenty-four cards: C284 to C303, and the design cards F18, F19, P11 and S2.**
  - **The Problem screen** (`ProblemWorkspace.svelte`, `problem.e2e.ts`):
    - C284: the workspace is the page's `main` (#528).
    - C286: one console live region, and real roles for the Verdict and the Accepted panel (#522).
    - C288: a busy control keeps focus, and focus moves to what replaces a removed one (#522). It builds on C243's read of what is open.
    - C290: autosave announces only what needs action (#522).
    - C292: the tabs carry the reset attribute SvelteKit 3 reads (#523).
    - C300: the editor's selection match and the Language select pass contrast (#526).
    - C302: at a short viewport the bars give the statement room (#527), after P11's board.
  - **Markdown and the Chapter:** C285: the renderer escapes raw HTML and drops unsafe link targets (#533). Then C287: a leading h1 that repeats the title is dropped (#528), and C289: reaching a Chapter's end keeps focus (#523).
  - **Settings, Users and the theme:**
    - C291: the Theme select waits for Save, and focus stays on what was used (#524, #523).
    - C293: `theme.ts` owns the theme cookie and the root attribute (#582).
    - C294: each Users action names its user or Invite (#525), then C296: the Registration select waits for Save (#524), then C298: focus goes to what an action shows (#523).
  - **Tokens and the Map:**
    - C295: the light accent is `#ae3f1d`, and `contrast.test.ts` holds the audit's pairs (#526, #529).
    - C297: the Map's current Topic gets its own focus mark (#526).
  - **Errors and the check:** C299: a root error page with a title and a `main` (#528), and C301: one e2e checks one `main`, a title and one h1 on every screen (#529, option 2).
  - **Design** (the canvas, `card-designer`):
    - F18: the light accent is `#AE3F1D` in `tokens()`;
    - F19: a focus mark for an already-accented box;
    - P11: the Problem phone board at 320×256;
    - S2: the error page.
  - **Last:** C303, the exit check and `Release-As: 1.19.8`.
- **Issues closed.**
  - C285 closes #533, C290 #522, C294 #525, C296 #524.
  - C298 closes #523, after C289, C291 and C292. C299 closes #528, after C284 and C287.
  - C300 closes #526, after C295 and C297. C302 closes #527.
  - #529 stays open for the maintainer's axe question. #582 stays open for Sprints 22 and 23.
- **Decided before the sprint** (recommended answers, none a hard call):
  - **#529:** option 2, no dependency: a contrast vitest (C295) and an e2e for landmarks, titles and h1s (C301). Option 1, `@axe-core/playwright`, is a new dependency, **a hard call that waits for the maintainer**, so #529 stays open for it.
  - **#524:** keep the Save button after hydration on both selects, and leave focus on the select.
  - **#528:** the renderer drops a leading h1 equal to the page's title; content is not edited.
  - **#533:** the optional layers, the content check failing on any HTML token and a script CSP, are left for later. A CSP is a response-header change of its own.
  - **#526:** the light accent becomes `#AE3F1D` (4.75 on panel, 5.15 on paper), as the issue directs. The dark accent, the other accents, the logo and the favicon are unchanged.
- **Reviews.**
  - The orchestrator's two-reader review: C285 (response content) and C296 (the Registration Mode).
  - None for the rest: screens, styles and tests, with no rule, header or Runner change. C293 edits `handle.ts` but keeps every response header as it is.
- **Design first.** The canvas is the source of truth for how a screen looks (`docs/agents/design-canvas.md`), so F18 comes before C295, F19 before C297, P11 before C302 and S2 before C299. F18 edits the light vermilion in every artboard's copy of `tokens()`; its designer reports the count before splitting the card if one publish cannot hold it. Design cards use the canvas, not the host's heavy jobs.
- **Shared files**, each an ordered chain:
  - `ProblemWorkspace.svelte`: C284, C288, C290, C300, then C302.
  - `problem.e2e.ts`: C284, C286, C288, C290, C292, then C302.
  - `problems/[problemId]/+page.svelte`: C288, C292, then C302.
  - `markdown.ts` and its test: C285, then C287. `chapters/chapter.e2e.ts`: C287, then C289.
  - `settings/+page.svelte`: C291, then C293.
  - `styles/tokens.css`: C293, C295, then C300. `contrast.test.ts` (new in C295): C295, then C300.
  - `users/+page.svelte`: C294, C296, then C298. `users.multi.e2e.ts`: C294, then C298.

  | Round | A · Problem screen and Users | B · Markdown, Chapter, Settings, tokens and Map | Design |
  |---|---|---|---|
  | 1 | C284 `main` (#528) | C285 Markdown escapes HTML (#533) | F18 light accent |
  | 2 | C286 live region (#522) | C287 leading h1 (#528) | F19 focus mark |
  | 3 | C288 focus after actions (#522) | C289 Chapter's end (#523) | P11 Problem at 320×256 |
  | 4 | C290 autosave (#522) | C291 Settings (#524, #523) | S2 error page |
  | 5 | C292 Problem tabs (#523) | C293 `theme.ts` (#582) | |
  | 6 | C294 Users names (#525) | C295 accent and contrast test (#526, #529) | |
  | 7 | C296 Registration select (#524) | C297 Map focus (#526) | |
  | 8 | C298 Users focus (#523) | C299 error page (#528) | |
  | 9 | C300 editor and select (#526) | C301 accessibility e2e (#529) | |
  | 10 | C302 short viewport (#527) | | |
  | 11 | C303 exit check and `Release-As: 1.19.8` | | |
- **Rounds: 14.**
  - The longest chain is six cards (C284, C286, C288, C290, C292, C302), and lane A's ten cards set the build: ten rounds.
  - There are two security reviews.
  - The last card and the cut add one round each.

**Exit:**
- All 24 Sprint 21 cards are Done, and `ci` is green on `main`.
- `markdown.test.ts` shows raw HTML escaped and a `javascript:` link without its target, and `graphs-lockdep` shows `<prev> -> <next>` as text.
- `a11y.e2e.ts` and `a11y.multi.e2e.ts` find one `main`, a title and one h1 on every screen, in both themes, on desktop and phone.
- `contrast.test.ts` passes, and holds the light accent, the selection match and the select's border.
- `problem.e2e.ts` checks focus after Run, Submit, Reveal hint, Cancel, a restart and a Language switch, and the statement's height at 320×256.
- `grep -rn "data-sveltekit-noscroll" src` prints nothing.
- #522 to #528 and #533 are closed. #529 stays open for the axe question.
- The orchestrator cuts 1.19.8 from the release PR and records the cut. Releases stay `1.x`.

**Not in the sprint:**
- **`@axe-core/playwright`** (#529's option 1): a new dependency, the maintainer's call.
- **A script CSP and an HTML check in the content check** (#533's optional layers).
- **#502**, the prose styles module: in Sprint 23 (C336), after this sprint's renderer change, as the issue asks.

## Sprint 22 · Tests, CI and docs

**Goal:** a browser test's Instance is started by one module from a preset, and the Learner's steps in browser tests are one module. CI lists its test jobs once, so a new job gates a release, and each Bun version is written once. Every doc an agent or operator reads first matches the code: the module map's Identity rows, the shipping section, the sandbox reviewer's checklist, the ADR pointers and the compose file `init` writes.

Release `R v1.19.9: Sprint 22 · Tests, CI and docs`, version 1.19.9 (patch, because no card is `feat`: the cards are `test`, `ci`, `docs` and `fix`).

- **Scope.** #507, #508, #509, #510, #511, #560, #569, #575, and #582's CI and smoke items. The docs issues come after the sprints whose code they describe.
- **Thirteen cards, C304 to C316.**
  - **CI and test servers:**
    - C304: one aggregator `tests` job, which the release gate waits on (#569), then C306: each Bun version written once, and one Playwright-image script (#582).
    - C308: one test-Instance module with presets, and a CLI for the Playwright configs (#560). Then C310: the fresh and Multi-user servers are its presets, and C312: one shared `test` export, with no `/proc` scan and no literal ports (#560).
    - Then C314: one Learner-steps module (#575), and C315: the smoke test and the screenshot script use it and read the first Topic from `content/` (#575, #582).
  - **Docs:**
    - C305: `compose.yaml` drops the pull note and passes `RUNNER_MAX_CONCURRENT`, and self-hosting gets its Runner notes (#507).
    - C307: the module map's Identity and Web rows (#508).
    - C309: mvp1.md's Shipping section (#509).
    - C311: the sandbox reviewer's checklist, and board.md's skill names (#510).
    - C313: the ADRs' pointers and three comments (#511).
  - **Last:** C316, the exit check and `Release-As: 1.19.9`.
- **Issues closed.** C304 closes #569, C305 #507, C307 #508, C309 #509, C311 #510, C312 #560, C313 #511, C315 #575. #582 stays open for Sprint 23's C338.
- **Decided before the sprint** (recommended answers, none a hard call):
  - **#569:** the aggregator job, the issue's first option.
  - **#507:** pass `RUNNER_MAX_CONCURRENT` through `compose.yaml` as `${RUNNER_MAX_CONCURRENT:-}`. An empty value keeps the CPU-count default, and only the file `init` writes for new Instances changes.
  - **#509:** mark k6 as not built yet, which changes no product decision.
- **Reviews.**
  - The orchestrator's two-reader review: C304 (the release gate) and C311 (the security reviewer's definition).
  - `sandbox-security-reviewer`: C313, for its comment in the Runner's config.
  - None for the rest: test code, docs, and an environment line for the runner service with no mount, flag or socket change (C305).
- **Shared files**, each an ordered chain:
  - `.github/workflows/ci.yml`: C304, then C306. `Dockerfile`: C306, then C313.
  - `playwright.config.ts`: C308, then C312.
  - `signin/signin.multi.e2e.ts`: C310, C312, then C314. `password.multi.e2e.ts`: C312, then C314.

  | Round | A · CI and test servers | B · Docs |
  |---|---|---|
  | 1 | C304 aggregator job (#569) | C305 compose and self-hosting (#507) |
  | 2 | C306 Bun versions, Playwright script (#582) | C307 module map's Identity rows (#508) |
  | 3 | C308 test-Instance module (#560) | C309 mvp1.md Shipping (#509) |
  | 4 | C310 fresh and Multi-user presets (#560) | C311 sandbox reviewer's checklist (#510) |
  | 5 | C312 shared test export (#560) | C313 ADR pointers (#511) |
  | 6 | C314 Learner steps (#575) | |
  | 7 | C315 smoke and screenshots (#575, #582) | |
  | 8 | C316 exit check and `Release-As: 1.19.9` | |
- **Rounds: 12.**
  - The longest chain is five cards (C308, C310, C312, C314, C315), and lane A's seven cards set the build: seven rounds.
  - There are three reviews: two security and one sandbox.
  - The last card and the cut add one round each.

**Exit:**
- All 13 Sprint 22 cards are Done, and `ci` is green on `main`.
- `ci-gate.sh` waits on the one job name `tests`, and `grep -c "bun-version: [0-9]" .github/workflows/ci.yml` prints 0.
- Neither Playwright config builds an Instance in a shell string, and `grep -rn "/proc\|localhost:417[45]" src/routes` prints nothing.
- The smoke test and the screenshot script name no Topic, Chapter or Problem id.
- `compose.yaml` holds no pull note and passes `RUNNER_MAX_CONCURRENT`, and `docs/self-hosting.md` has a Runner troubleshooting section.
- `grep -n "superpowers:" docs/agents/board.md` and `grep -n "fully automatic" docs/product/mvp1.md` print nothing.
- #507, #508, #509, #510, #511, #560, #569 and #575 are closed.
- The orchestrator cuts 1.19.9 from the release PR and records the cut. Releases stay `1.x`.

**Not in the sprint:** #570, the release webhook's notify script, stays card C340 with no Sprint until C220 and C221 are Done.

## Sprint 23 · The Learning core and the Problem screen

**Goal:** every Learning-core rule and every Problem-screen rule has one home that a Vitest test reaches. The Main Line is indexed once, the Unlock diff is one function, the Map's current Topic is decided once, and the access check runs once a call. The save protocol's server half sits beside its write, and its two halves meet in one test. The Problem screen's wire, driver and view rules leave the component, the header and the Topic rows stop restating rules, rendered Markdown has one style, and the desktop gutter is a token.

Release `R v1.19.10: Sprint 23 · The Learning core and the Problem screen`, version 1.19.10 (patch, because no card is `feat`: the cards are `refactor`, `fix`, `test` and `docs`).

- **Scope.** #500, #502, #503, #504, #505, #561, #571, #572, #573 and #579, #517's split, and #582's tokens item.
- **Twenty-three cards, C317 to C339.**
  - **Learning core, the Map and the Topic** (`rules.ts`, `core.ts`, `progress.ts`, the catalogue):
    - C317: a pure indexer derives the Main Line (#517).
    - C319: one pure Unlock diff (#571).
    - C321: the Map's current Topic is decided once (#572), then C323: one Map-entries function feeds the figure and the column (#572).
    - C325: one opened context per call (#573).
    - C327: the Topic view carries each step (#503), then C333: one module for the row wording, and a smaller `ProblemTable` (#503).
    - C329: removing a Learner is a call on the core (#579).
    - C331: `progress.ts` saves a step on a base (#561).
    - C335: the module map names the Learner-row precondition and the history columns (#579).
    - C337: `workspace.test.ts` refuses by code (#579).
  - **The Problem screen, the header and prose:**
    - C318: `problem-wire.ts` encodes and decodes the requests (#504), then C320: the driver loop is a plain module (#504), then C322: HintsTab posts through the encoder (#504).
    - C324: the screen runs `view.ts`'s transitions, then C326: `view.ts` says what each pane shows (#500).
    - C328: the header model says what a phone shows, then C332: the route-policy table says which routes draw their own bar (#505).
    - C330: the seed decision answers a kind, and the screen words it (#579).
    - C334: one protocol test plays the tab against a real core (#561).
    - C336: one prose module styles rendered Markdown (#502).
    - C338: the desktop gutter and bar height are tokens (#582).
  - **Last:** C339, the exit check and `Release-As: 1.19.10`.
- **Issues closed.**
  - C317 closes #517, C319 #571, C323 #572, C325 #573, C326 #500.
  - C322 closes #504, C332 #505, C333 #503, C334 #561, C336 #502.
  - C337 closes #579, after C329, C330 and C335.
  - C338 closes #582, after Sprint 21's C293 and Sprint 22's C306 and C315.
- **Decided before the sprint** (recommended answers; none is a hard call unless it says so):
  - **#571:** Topic Completed means "was not Complete before, and is now". No screen reads `reachChapter`'s flag.
  - **#572:** the current Topic is the open Topic with the most recent activity, or none.
  - **#500:** make the screen run `view.ts`'s transitions, the issue's first direction, rather than deleting them.
  - **#579's two stored columns, `Submission.files` and `failingProblemId`:** kept and documented (C335). Dropping them is a schema change that loses data, **a hard call left to the maintainer**; no card drops them.
  - **#579's Learner-row precondition:** documented, with no new error code.
  - **#582's tokens item, "speculative":** done (C338). The tokens are layout sizes, not `tokens()` colours, so the canvas does not change.
- **Reviews.**
  - The orchestrator's two-reader review: C329 (Identity's Remove path) and C332 (a column in the route-policy table, which the gate does not read).
  - None for the rest: the Learning core, screens and tests. No card touches the Runner, the gate's rules or a header.
- **Shared files**, each an ordered chain:
  - `learning/rules.ts`: C319, C321, C325, C327, then C330. `rules.test.ts`: C317, C319, C321, C325, C327, then C330.
  - `learning/progress.ts`: C319, C321, C329, then C331. `learning/core.ts`: C325, C329, then C331. `core.test.ts`: C325, then C331.
  - `ProblemWorkspace.svelte`: C320, C324, C326, C330, then C332.
  - `problems/[problemId]/+page.svelte`: C324, C326, then C336. `view.ts` and its test: C324, then C326. `HintsTab.svelte`: C322, then C336.
  - `header.ts` and its test: C328, then C332. `AppHeader.svelte`: C328, then C338.
  - `topics/[topicId]/+page.svelte`: C327, C333, then C338. `chapters/[chapterId]/+page.svelte`: C333, C336, then C338. `routes/+page.svelte`: C323, then C338.

  | Round | A · Learning core, Map and Topic | B · Problem screen, header and prose |
  |---|---|---|
  | 1 | C317 Main Line indexer (#517) | C318 wire both ways (#504) |
  | 2 | C319 Unlock diff (#571) | C320 driver module (#504) |
  | 3 | C321 current Topic (#572) | C322 HintsTab (#504) |
  | 4 | C323 Map entries (#572) | C324 screen runs `view.ts` (#500) |
  | 5 | C325 opened context (#573) | C326 what each pane shows (#500) |
  | 6 | C327 Topic steps (#503) | C328 header's phone items (#505) |
  | 7 | C329 Learner removal (#579) | C330 seed kind (#579) |
  | 8 | C331 save on a base (#561) | C332 `inPage` from the table (#505) |
  | 9 | C333 row wording (#503) | C334 protocol test (#561) |
  | 10 | C335 module map (#579) | C336 prose module (#502) |
  | 11 | C337 refused by code (#579) | C338 gutter and bar tokens (#582) |
  | 12 | C339 exit check and `Release-As: 1.19.10` | |
- **Rounds: 15.**
  - The longest chain is eight cards (C317, C319, C321, C325, C327, C333, C336, C338), and each lane's eleven cards set the build: eleven rounds.
  - There are two security reviews.
  - The last card and the cut add one round each.

**Exit:**
- All 23 Sprint 23 cards are Done, and `ci` is green on `main`.
- `grep -n "function placeOf\|function catalogueOf" src/lib/server/learning/rules.test.ts` and `grep -n "seedNoteOf" src/lib/server/learning/rules.ts` print nothing.
- `grep -c "requireOpenTopic(" src/lib/server/learning/rules.ts` prints 1, and `grep -rln "deleteLearner" src` lists only files under `src/lib/server/learning/`.
- `ProblemWorkspace.svelte` holds no `dispatch`, `perform`, `post` or `ACTION`, and `save-protocol.test.ts` runs in the `unit` job.
- `grep -rln ".prose :global" src/routes` and `grep -rn "6\.7vw\|100vh - 93px" src` print nothing.
- #500, #502, #503, #504, #505, #517, #561, #571, #572, #573, #579 and #582 are closed.
- The orchestrator cuts 1.19.10 from the release PR and records the cut. Releases stay `1.x`.

**Not in the sprint:** dropping `Submission.files` and `failingProblemId`, a schema change that is the maintainer's call (#579).

## After each build sprint

After a sprint is released, a separate session reviews the architecture (`docs/agents/board.md`, After a major feature). Only a bug, a security problem or something that blocks a planned feature becomes an issue. Every other finding goes into `docs/architecture-candidates.md`, and is planned only if the maintainer picks it.
