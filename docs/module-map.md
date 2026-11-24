# Module map

The modules MVP1 is built from, where their seams sit, and how each is tested. Vocabulary: `CONTEXT.md` for the domain, the `codebase-design` skill for module, interface, seam, adapter, depth. Spec: issue #24.

| Module | What it hides | Seam and dependencies | Tested through |
|---|---|---|---|
| **Content catalogue** | Loading the bundled content, validating it (schema, acyclic Prerequisites, Reference Code and Solution in every Language) and answering read-only queries | In-process, no port. Tests load a fixture content folder. Its Submit batch guard uses `submit-plan.ts`, a leaf module the Learning core also uses, to build each batch's Runner request, and measures it with `worstCaseBodyBytes` from `runner/http-adapter.ts` (the adapter's body size for any Build) against the limits it reads from `runner/config.ts`. In dev mode the core gets `createReloadingCatalogue` instead (`content/catalogue.ts`): it reads `CONTENT_DIR` again once per Learner view (the hook makes one per request), on that view's first call, and every call of the view sees that one read. A read that fails validation throws `ContentError` from that view's calls only, and the next view reads again. The folder must be valid at start | Its own queries; seam 3 (content check) |
| **Learning core** | Every product rule: Unlock, Read, Attempted/Solved, Complete, Builds, Branches, Language switch, and, in `learning/submission.ts`, judging a Submission (the plan and batch order, when to stop, the Verdict, hiding Hidden Tests) | Uses the Content catalogue and Prisma directly; the Runner through the Runner port | Seam 1 |
| **Runner port** | How code reaches a Sandbox | The one real seam: an HTTP adapter (production) and a scripted fake (tests); a Kubernetes adapter can follow | Both adapters satisfy the same contract tests |
| **Runner** (process) | Turning a request into a fresh hardened container per run (ADR 0002), collecting output, cleaning up | Owns the container engine socket; nothing else does | Seam 2, real Docker |
| **Identity** | Who a request is: Local Mode vs Multi-user Mode, the Instance mode and Registration Mode (stored in the database, cached per process), Better Auth (email and password, optional GitHub and Google), the gate and the route-policy table, registration, Invites, Accounts (list, remove, reset a password), first-run Setup, and the `reset-admin-password` command | One call per request, `identity.resolve(event)`, answers an `IdentityAnswer` (see Identity interface below); the hook binds the Learning core to that Learner and the root layout shows the display name. Two adapters: Local Mode, always the Local Learner (`admin`, shown as "Local"), and Multi-user, the session's Account and its own Learner (read through `currentSession`). The gate decides, per path, who may pass in each mode. Local → Multi-user links the first Admin's Account to the existing Local Learner, so no progress moves (ADR 0006). The Instance mode and Registration Mode are read once per process, so an Instance runs one web process per data volume. Invites are claimed before anything is written, so one link makes one Account. A Learner's rows leave with its Account (cascade). A Local Instance started in dev mode refuses to become Multi-user (`DevModeOnError` from `instance.chooseMulti`, before anything is written), and a Multi-user Instance with `DEV_MODE=1` refuses to start | Seam 1 style tests + screen e2e. Local e2e files each act as their own Learner through a test-only cookie that the Local adapter honours only when `IDENTITY_TEST_LEARNER=1` (set by the e2e web server alone); `*.multi.e2e.ts` files run against a Multi-user server, and any that change Instance state start their own |
| **Web** | Nothing on purpose: SvelteKit routes call Identity and its actions (account actions, Admin actions), then the Learning core, then render | No rules live here. The hook copies `app.devMode`, fixed at start, to `locals.devMode`; the root layout sends `devMode: true` only when it is on, and draws the band; the Problem route's `runReference` action answers 404 unless `locals.devMode`, before it reads the body. In dev mode the error hook answers a `ContentError` with `{ message: 'Invalid content', contentIssues }` (at most 200, then `and N more`); in either mode it logs only `formatServerError`'s line | Screen e2e; seam 4 |
| **Logging** (`src/lib/server/logging.ts`) | What the server may print: redacting Invite tokens from every console line (`installLogRedaction`), Better Auth's own logger (`redactingLogger`), the line SvelteKit's error hook prints (`formatServerError`), and `logFailure` for a failure outside the hook. Only a class name and a known code are logged, never a message, stack or what a request sent | A leaf with no dependency on the other server modules; the hook installs it once at start | Its own unit tests (`logging.test.ts`) |
| **Languages** (`src/lib/languages.ts`) | The one list of Languages a Learner can build in: id, display name, entry file and file extension (`LANGUAGES`, `LANGUAGE_IDS`, `languageById`, `entryFileOf`) | Browser-safe, so the editor, the Content catalogue and the problem wire contract read the same list; each Language's Sandbox image lives server-side in `server/runner/config.ts` | Its own unit tests (`languages.test.ts`) |
| **Instance packaging** | The `web`, `runner`, `init` and `reset-admin-password` roles (ADR 0004), migrations on start | The image and the files `init` writes never name `DEV_MODE` (`image-files.test.ts`) | Seam 4, the image smoke test |

## Learning core interface

```ts
createLearningCore({ catalogue, db, runner, clock?, devMode? }): LearningCore
                                         // devMode: fixed when the core is built, so no call or request switches it; no Topic is Locked; it writes no row (LearningCoreDeps.devMode in core.ts)
core.forLearner(learnerId): Learner      // every call below acts for this one Learner

// screen reads: never write
learner.map()                 learner.topic(topicId)
learner.chapter(chapterId)    learner.problem(problemId)
learner.startingLanguage()    // the Language Topics not yet started open in, or undefined while the Learner has none

// Learner actions
learner.reachChapterEnd(chapterId)                    // → progress change (may Complete a Topic)
learner.saveCode(build, files, inflightDigest?)    // build: Build reference { problemId, language, revision } → { revision }, or RevisionConflict; inflightDigest: see Build reference
learner.run(build, files)         // saves, then → RunView { revision, compileError?, tests[{ name, input, expected, actual, stderr, passed, status }] }; Example Tests only; never changes progress
learner.submit(build, files)      // saves, runs, returns Verdict (+ accepted: next Problem, Topic Complete, newly Unlocked)
learner.startFromReferenceCode(build)  // replaces this Build with the Reference Code after the previous Problem (an Extra: its parent; empty on a Topic's first Problem) → { files, revision }; same revision check as saveCode; keeps Submissions, changes no progress or Hint
learner.runReference(problemId, language)   // dev mode only: NotFound with it off, for an unknown Problem, or for a Language with no Reference Code. Runs the Reference Code against the Tests a Submit of the Problem runs, in the same batches and limits → { tests[{ problemId, name, kind, status }] } in run order, never an input, an expected output or Runner output; saves no Build, records no Submission, changes no progress, and takes a run place; RunnerUnavailable for an outage, a cut-off batch or a compile error (core.ts, submission.ts judgeReference)
learner.switchLanguage(problemId, language)   // the Language of that Problem's Topic
learner.setStartingLanguage(language)   // writes only the Learner row; InvalidBuild for an unknown Language, NotFound for a Learner with no row; a Topic already worked on keeps its Language
learner.hints(problemId)      // screen read: { total, revealed[{ number, html }], chapter } - never an unrevealed Hint
learner.solution(problemId)    // screen read: { explanationHtml, referenceCode: Language → files }; never changes progress or a Build
learner.revealHint(problemId)  // raises the revealed count by one; past the last Hint it changes nothing and answers the Hints already revealed (never an error) → the same view
learner.resetProgress()       // deletes this Learner's read Chapters, saved code, Submissions, Languages per Topic and revealed Hints in one transaction; the Learner row stays
```

**Build reference.** `learner.problem()` returns `build: { problemId, language, revision }`: the Problem, the Language the screen shows, and the revision its code is based on (0 for a step never saved). The tab hands it back unchanged with every save, run or submit and takes the new revision from the reply. The core never trusts it: a `language` other than the Topic's current one, or a stale `revision`, is `RevisionConflict`, with one exception so a retried save lands as saved: a save exactly one revision behind whose files equal the stored head (compared per path, after validateBuild, never by JSON key order) is answered with the head's revision and writes nothing, because its reply was lost after it committed. Two or more behind is always `RevisionConflict`, so a later edit back to old code is never mistaken for a retry. A second exception serves a closing tab: while its autosave is still on the wire, the tab sends the latest files as a keepalive save on the same base with `inflightDigest`, `filesDigest` (problem-wire.ts: SHA-256 over the path-sorted [path, content] pairs) of the files of that save. A save exactly one revision behind is then accepted when the stored head's files match the digest (the in-flight save landed first) and is stored at head + 1; if it lands first the normal rule stores it and the in-flight save then conflicts, so the latest files win in both orders. A digest that does not match the head (another tab saved) stays `RevisionConflict`. The digest is only 64 bytes, so the unload body stays under the browser's 64 KiB keepalive cap; a Build too big for keepalive is not sent on unload (the fetch is refused by the browser). Start from reference code is a save of the Reference Code, so a retried restart is answered the same way. The tab re-sends a request that got no reply exactly as it was (same files, same base), then sends newer edits on the revision that reports; a lost restart is retried as a restart, with the editor locked meanwhile so no edit is overwritten; Run and Submit are never re-sent automatically (a lost one is retried as a save), so no Submission is recorded twice. Run and Submit are "save, then act" in one core path. The Build path rule `buildPathsIssue` (with `MAX_PATH_BYTES` and `MAX_BUILD_FILES`) lives at the Runner port, runner/port.ts; the core's `validateBuild`, the Runner's request schema and the scripted fake all use it.

Errors: `NotFound` (404), `TopicLocked` (403; anything inside a Locked Topic except the Map), `RevisionConflict` (409; stale tab, second device, or a Language switched elsewhere), `InvalidBuild` (400; bad paths or a Build over the size cap), `RunnerUnavailable` (503; the Runner is down, busy or failed). A Verdict is never an error. An error raised after the code was saved (`RunnerUnavailable` during Run or Submit) carries the `revision` that save produced. Routes map codes to statuses, and pass that revision on, through one shared helper (`withLearningErrors`) and do nothing else with them. There is no `NoMoreHints`: the core owns what revealing past the last Hint means.

**Problem screen wire contract.** `src/lib/problem-wire.ts` is imported by the Problem route's actions and by the screen's state machine (browser-safe). A refusal travels as the core's own code in the error body (`{ message: code, revision? }`), plus `BadRequest` for a form the route cannot read; the status is informational. The browser turns any answer into a `Reply` (`toReply`): data, a refusal with its code, `signedOut` (a 401 or a redirect: the Learner's code stays in the editor, nothing is retried, the screen says to sign in again) or `unreachable` (retried).

**Rules the interface guarantees**

- Unlocked, Complete, Solved and Attempted are derived from Read marks and Submissions, never stored as flags, so content upgrades (keyed by stable ids) just work.
- Dev mode (`devMode`): no Topic is Locked, for any read or action that checks access. Complete, Solved, Attempted and Read stay derived from real Read marks and Submissions, so Complete shows only real progress, and an Accepted panel names no newly Unlocked Topic. Reading writes no row.
- A step's code is copied once, when the step is first touched: from the Learner's previous Core step, else from Reference Code. Later edits upstream never change it.
- A Topic's Language is the Language the Learner chose for it, else the Language of the code they last saved in it, else their starting Language, else Python; setting the starting Language changes only Topics not yet started.
- The first Problem of a Topic starts from an empty Build. "Start from Reference Code" loads the Reference Code after the *previous* Problem.
- An Extra Problem works on a Branch copied from its parent Core step; nothing flows back to the Main Line.
- Submit runs the Problem's Tests plus every earlier Core Problem's Tests (up to the parent step for an Extra). It waits for the result; a Runner outage records nothing. It makes several Runner calls, each its own container: the Problem's Example Tests (the only output ever shown), then every other Test (outcomes only) in order, in containers of at most `sandboxConfig.hiddenBatchTests` Tests (25), because the harness costs about 0.05 s a Test in TypeScript (each Test runs the JavaScript `tsc` emitted once, not the types stripped again) and `tsc` about 1.5 s once, against the container's 10 s. It stops after a container in which a Test timed out (nothing later can outrank Time Limit Exceeded, so the Verdict and failure are those one container would give) and otherwise runs them all. A compile error in a hidden container is `RunnerUnavailable`, as before. So is a container the Runner cut off at its own wall clock (a result marked `cutOff`), in Run as in Submit: its unanswered Tests never ran to their own limit, so none is shown as Time Limit Exceeded, and nothing is recorded. Only a Test that hit its own `testTimeoutMs` is Time Limit Exceeded. Code that stays inside the per-Test limit but runs a batch past the container's 10 s is therefore told `RunnerUnavailable`, not a Verdict. Tests in one container are not isolated from each other: kernel counters survive the harness's cleanup, so a Hidden input must never share a container with a Test whose output is shown.
- The core, not the Runner, picks the Verdict: Compile Error > Time Limit Exceeded > Runtime Error > Wrong Answer > Accepted.
- A failing Hidden Test (or earlier step) shows only which Problem failed and the Verdict: no input, expected output or Learner output. Output is shown for failing Example Tests.
- A Solution's code is the Reference Code after that Problem. It is always available (any Problem inside an Unlocked or Complete Topic, solved or not), read only, and loaded by its own call: the Problem view never carries it.
- Reset progress deletes every row of this Learner in every progress table (every model with a `learnerId`) in one transaction, and nothing of any other Learner. A test fails when the Prisma schema has such a model that the reset does not clear. Settings such as the theme and the starting Language are not progress and are kept.
- Hints reveal in number order and the Learner's count is stored per Problem (one number). Revealing is free, changes no progress and is atomic, so two at once never pass the total. The browser only receives the revealed Hints' text; every Hint links to the Problem's Chapter.

**Inside the core.** The rules (Unlock graph, code seeding, the before/after diff for the Accepted panel) are pure functions with no I/O in `rules.ts`. `submission.ts` judges a Submission: given the Problem, the Build's Language and files and a Runner, it plans the Tests (`submit-plan.ts`, the leaf the Content catalogue's guard also uses, which also builds each batch's Runner request), runs the batches in order, stops after a timeout, treats a Compile Error in a hidden batch and a batch the container cut off as `RunnerUnavailable` (`runBatch` sends every Run's and Submission's batch, with the configured limits), applies Verdict precedence and hides what a Hidden Test would show, and answers the Verdict, the failure and the failing Problem. `core.submit` is then: save, take a run place, judge, record. A thin shell loads state, calls these, calls the Runner and saves. The pure rules are an internal seam: table tests may cover them, but behaviour tests go through `forLearner`.

## Identity interface

```ts
// src/lib/server/identity/index.ts
app.identity.resolve(event): Promise<IdentityAnswer>
IdentityAnswer =
  | { kind: 'unavailable' }                       // a Multi-user Instance with no Better Auth: the hook answers 503
  | { kind: 'resolved', who: Identity | null,     // Identity { learnerId, displayName, role }; null means nobody
      mustChangePassword: boolean, refreshedCookies: string[] }   // Set-Cookie values the hook sends back

// identity/route-policy.ts: one table, read by both the gate and the response-header step
policyOf(routeId): RoutePolicy   // { audience: 'public' | 'signedIn' | 'admin' | 'setup', multiOnly, noStore, referrer?, bare }

// identity/gate.ts
gate({ mode, who, routeId, pathname, search, mustChangePassword }): GateResult   // pass, a redirect, or a status

// identity/session-binding.ts
currentSession(auth, headers): Promise<CurrentSession | null>   // { userId, identity, mustChangePassword, refreshedCookies }

// built once by createMultiUserInstance (identity/multi-user-instance.ts) as `multiUser`
multiUser.accounts       // AccountActions: providers, status, signIn, startProvider, signUp, changePassword, signOut
multiUser.adminActions   // AdminActions: listAccounts, resetPassword, removeAccount, createInvite, pendingInvites, cancelInvite, setRegistrationMode
multiUser.invites        multiUser.handleAuth(request, clientAddress)

// identity/setup.ts, reached as app.setup.createFirstAdmin
createFirstAdmin({ instance, auth, db }, { name, email, password, convert? })   // claims the Instance as Multi-user and signs the first Admin up
```

**Answers, not exceptions.** Account actions and Admin actions answer a result or a refusal code (`{ refused }`, with the form `field` for an account action). Every Admin action checks `who.role === 'admin'` once, inside `createAdminActions`, and answers `NOT_ADMIN` otherwise. Routes map the code to a status and call nothing else.

**The route-policy table.** A route's audience, whether it exists in Local Mode, its cache and referrer headers and whether its page shows the wordmark alone are written once in `route-policy.ts`. The gate reads the audience and `multiOnly`; `handle.ts` reads `noStore` and `referrer` and sets them on the resolved response; `header.ts` reads `bare`. A route id with no entry gets the default, `signedIn`.

**The first Admin.** `createFirstAdmin` makes the first Account: it runs the sign-up inside a flag no request can set, so registration admits that call alone, links the Account to the `local` Learner, and puts the Instance back as it was if the sign-up fails. It is refused on an Instance that is already Multi-user.

## Runner port

```ts
execute({ language, files, tests: { id, input }[], limits })
  → { compileError?, results: { id, status: 'ok' | 'runtimeError' | 'timeout', stdout, stderr }[] }
```

Expected outputs never go to the Runner: learner code cannot read what is not in its container. The core compares outputs.

**Per-Learner cap.** The Learning core lets one Learner have at most `sandboxConfig.maxRunsPerLearner` (2) Runs and Submits running at once, counted together across every view of that Learner. One past it is refused as `RunnerUnavailable` after the save, so the saved code stays and the error carries its revision; nothing is recorded. The place frees in a `finally` on every path, and at the latest after `runPlaceCeilingMs` (100 s) if the work never settles. The count is in memory, per web process: a restart resets it, and with more than one web process it would be per process (ADR 0006 runs one per data volume).

**Slots.** The Runner runs at most `RUNNER_MAX_CONCURRENT` containers at once. A request that finds them taken waits in a FIFO queue for at most `sandboxConfig.queueWaitMs` (8 s) and the queue holds at most `maxQueued` (8) requests; past either it answers 503 "busy", which the Learning core reports as `RunnerUnavailable`. The wait is what lets a Submission's later batches get a slot after the earlier ones freed theirs. A caller that hangs up leaves the queue.

**Inside the Runner.** One Python harness (`harness.py`) runs in every Sandbox image and switches on the Language only to compile (py_compile, `tsc` emitting JavaScript once, `go build`) and to run. `harness.ts` is the Runner side of its protocol: it sends `<length>\n` and a tar of `build/<path>` and `tests/<i>.in` on stdin (`harnessInput`), the `RUNNER_*` variables in the container Env (`harnessEnv`), and reads one JSON line per Test, or one `compileError` line, from stdout, strictly (`harnessLine`, `createHarnessDecoder`: a line with an unknown field, a bad index or a non-zero exit fails the Run). The script is sent with `python -I -c` (`harnessScript`). A learner mistake is a Compile Error; a crashed or killed compile step is a Runner error, never a Verdict. On start the Runner pulls each Language's image and is ready per Language: a Language whose image is not there yet answers 503 while the others run. Its containers carry its instance id and are named `bl-<instanceId>-<random>` by the Run that creates them. A Run whose create call fails or times out removes exactly that name (retrying a 404 for a few seconds, as the daemon may still be finishing the create), so no never-started container waits for the next instance's sweep unless the daemon registers it more than about 30 s late; the sweeps still go by label and instance id, never by name. Its start-up sweep removes only containers of other instances older than the create-call timeout plus the hard wall clock, the `Created` truncation and a margin. A container labelled `true`, from before instance ids, is swept at any age. A second sweep runs after `secondSweepDelayMs`, for a container the first skipped as too young (a Runner that died between create and start). Each Docker request in a Run (create, start, kill, remove, list, inspect, the wait registration, the attach handshake) has an absolute deadline that rejects on its own, so that age bound holds on the production Bun. An image pull has an idle timeout and an absolute cap of about 30 minutes (then the loop retries with its backoff), its stream is scanned chunk by chunk so an error fails it at once, and it never runs inside a Run: a create that finds its image gone (404) fails that Run as a Runner error, the Language leaves the ready set, and the image loop pulls it again, one pull however many Runs hit it, without holding a Run slot. A create whose reply says the engine discarded the Sandbox's memory or pids limit fails that Run as a Runner error, and the container is removed before it starts; the log names the class, never the warning.

## Test seams

1. **Learning core:** Learner actions through `forLearner`, in-memory SQLite, fixture content, scripted Runner. Most tests live here.
2. **Runner and Sandbox:** real Docker; real code in all three Languages, plus escape attempts that must be contained.
3. **Content check:** every shipped Reference Code passes its own and earlier Core Tests in the real Sandbox.
4. **Image smoke test:** the built image through `init` and `docker compose up`, Playwright solving a Problem in each Language.
