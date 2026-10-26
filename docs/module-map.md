# Module map

The modules MVP1 is built from, where their seams sit, and how each is tested. Vocabulary: `CONTEXT.md` for the domain, the `codebase-design` skill for module, interface, seam, adapter, depth. Spec: issue #24.

| Module | What it hides | Seam and dependencies | Tested through |
|---|---|---|---|
| **Content catalogue** | Loading the bundled content, validating it (schema, acyclic Prerequisites, Reference Code and Solution in every Language) and answering read-only queries | In-process, no port. Tests load a fixture content folder | Its own queries; seam 3 (content check) |
| **Learning core** | Every product rule: Unlock, Read, Attempted/Solved, Complete, Builds, Branches, Language switch, assembling a Submission, Verdict, hiding Hidden Tests | Uses the Content catalogue and Prisma directly; the Runner through the Runner port | Seam 1 |
| **Runner port** | How code reaches a Sandbox | The one real seam: an HTTP adapter (production) and a scripted fake (tests); a Kubernetes adapter can follow | Both adapters satisfy the same contract tests |
| **Runner** (process) | Turning a request into a fresh hardened container per run (ADR 0002), collecting output, cleaning up | Owns the container engine socket; nothing else does | Seam 2, real Docker |
| **Identity** | Who a request is: Local Mode vs Multi-user Mode, the Instance mode and Registration Mode (stored in the database, cached per process), Better Auth (email and password, optional GitHub and Google), the gate, registration, Invites, Accounts (list, remove, reset a password), first-run Setup, and the `reset-admin-password` command | One call per request, `resolve(event)`, answers `{ learnerId, displayName, role }` (role `admin` or `learner`) or nobody; the hook binds the Learning core to that Learner and the root layout shows the display name. Two adapters: Local Mode, always the Local Learner (`admin`, shown as "Local"), and Multi-user, the session's Account and its own Learner. The gate decides, per path, who may pass in each mode. Local → Multi-user links the first Admin's Account to the existing Local Learner, so no progress moves (ADR 0006). The Instance mode and Registration Mode are read once per process, so an Instance runs one web process per data volume. Invites are claimed before anything is written, so one link makes one Account. A Learner's rows leave with its Account (cascade) | Seam 1 style tests + screen e2e. Local e2e files each act as their own Learner through a test-only cookie that the Local adapter honours only when `IDENTITY_TEST_LEARNER=1` (set by the e2e web server alone); `*.multi.e2e.ts` files run against a Multi-user server, and any that change Instance state start their own |
| **Web** | Nothing on purpose: SvelteKit routes call Identity, then the Learning core, then render | No rules live here | Screen e2e; seam 4 |
| **Instance packaging** | The `web`, `runner`, `init` and `reset-admin-password` roles (ADR 0004), migrations on start | — | Seam 4, the image smoke test |

## Learning core interface

```ts
createLearningCore({ catalogue, db, runner, clock? }): LearningCore
core.forLearner(learnerId): Learner      // every call below acts for this one Learner

// screen reads: never write
learner.map()                 learner.topic(topicId)
learner.chapter(chapterId)    learner.problem(problemId)

// Learner actions
learner.reachChapterEnd(chapterId)                    // → progress change (may Complete a Topic)
learner.saveCode(build, files)    // build: Build reference { problemId, language, revision } → { revision }, or RevisionConflict
learner.run(build, files)         // saves, then → RunView { revision, compileError?, tests[{ name, input, expected, actual, stderr, passed, status }] }; Example Tests only; never changes progress
learner.submit(build, files)      // saves, runs, returns Verdict (+ accepted: next Problem, Topic Complete, newly Unlocked)
learner.startFromReferenceCode(build)  // replaces this Build with the Reference Code after the previous Problem (an Extra: its parent; empty on a Topic's first Problem) → { files, revision }; same revision check as saveCode; keeps Submissions, changes no progress or Hint
learner.switchLanguage(problemId, language)   // the Language of that Problem's Topic
learner.hints(problemId)      // screen read: { total, revealed[{ number, html }], chapter } - never an unrevealed Hint
learner.solution(problemId)    // screen read: { explanationHtml, referenceCode: Language → files }; never changes progress or a Build
learner.revealHint(problemId)  // raises the revealed count by one; past the last Hint it changes nothing and answers the Hints already revealed (never an error) → the same view
learner.resetProgress()       // deletes this Learner's read Chapters, saved code, Submissions, Languages per Topic and revealed Hints in one transaction; the Learner row stays
```

**Build reference.** `learner.problem()` returns `build: { problemId, language, revision }`: the Problem, the Language the screen shows, and the revision its code is based on (0 for a step never saved). The tab hands it back unchanged with every save, run or submit and takes the new revision from the reply. The core never trusts it: a `language` other than the Topic's current one, or a stale `revision`, is `RevisionConflict`, with one exception so a retried save lands as saved: a save exactly one revision behind whose files equal the stored head (compared per path, after validateBuild, never by JSON key order) is answered with the head's revision and writes nothing, because its reply was lost after it committed. Two or more behind is always `RevisionConflict`, so a later edit back to old code is never mistaken for a retry. Start from reference code is a save of the Reference Code, so a retried restart is answered the same way. The tab re-sends a request that got no reply exactly as it was (same files, same base), then sends newer edits on the revision that reports; a lost restart is retried as a restart; Run and Submit are never re-sent automatically (a lost one is retried as a save), so no Submission is recorded twice. Run and Submit are "save, then act" in one core path.

Errors: `NotFound` (404), `TopicLocked` (403; anything inside a Locked Topic except the Map), `RevisionConflict` (409; stale tab, second device, or a Language switched elsewhere), `InvalidBuild` (400; bad paths or a Build over the size cap), `RunnerUnavailable` (503; the Runner is down, busy or failed). A Verdict is never an error. An error raised after the code was saved (`RunnerUnavailable` during Run or Submit) carries the `revision` that save produced. Routes map codes to statuses, and pass that revision on, through one shared helper (`withLearningErrors`) and do nothing else with them. There is no `NoMoreHints`: the core owns what revealing past the last Hint means.

**Problem screen wire contract.** `src/lib/problem-wire.ts` is imported by the Problem route's actions and by the screen's state machine (browser-safe). A refusal travels as the core's own code in the error body (`{ message: code, revision? }`), plus `BadRequest` for a form the route cannot read; the status is informational. The browser turns any answer into a `Reply` (`toReply`): data, a refusal with its code, `signedOut` (a 401 or a redirect: the Learner's code stays in the editor, nothing is retried, the screen says to sign in again) or `unreachable` (retried).

**Rules the interface guarantees**

- Unlocked, Complete, Solved and Attempted are derived from Read marks and Submissions, never stored as flags, so content upgrades (keyed by stable ids) just work.
- A step's code is copied once, when the step is first touched: from the Learner's previous Core step, else from Reference Code. Later edits upstream never change it.
- The first Problem of a Topic starts from an empty Build. "Start from Reference Code" loads the Reference Code after the *previous* Problem.
- An Extra Problem works on a Branch copied from its parent Core step; nothing flows back to the Main Line.
- Submit runs the Problem's Tests plus every earlier Core Problem's Tests (up to the parent step for an Extra). It waits for the result; a Runner outage records nothing. It makes two Runner calls, each its own container: the Problem's Example Tests (the only output ever shown), then every other Test (outcomes only). Tests in one container are not isolated from each other: kernel counters survive the harness's cleanup, so a Hidden input must never share a container with a Test whose output is shown.
- The core, not the Runner, picks the Verdict: Compile Error > Time Limit Exceeded > Runtime Error > Wrong Answer > Accepted.
- A failing Hidden Test (or earlier step) shows only which Problem failed and the Verdict: no input, expected output or Learner output. Output is shown for failing Example Tests.
- A Solution's code is the Reference Code after that Problem. It is always available (any Problem inside an Unlocked or Complete Topic, solved or not), read only, and loaded by its own call: the Problem view never carries it.
- Reset progress deletes every row of this Learner in every progress table (every model with a `learnerId`) in one transaction, and nothing of any other Learner. A test fails when the Prisma schema has such a model that the reset does not clear. Settings such as the theme are not progress and are kept.
- Hints reveal in number order and the Learner's count is stored per Problem (one number). Revealing is free, changes no progress and is atomic, so two at once never pass the total. The browser only receives the revealed Hints' text; every Hint links to the Problem's Chapter.

**Inside the core.** The rules (Unlock graph, code seeding, Test assembly, Verdict, hiding Hidden Tests, the before/after diff for the Accepted panel) are pure functions with no I/O; a thin shell loads state, calls them, calls the Runner and saves. The pure rules are an internal seam: table tests may cover them, but behaviour tests go through `forLearner`.

## Runner port

```ts
execute({ language, files, tests: { id, input }[], limits })
  → { compileError?, results: { id, status: 'ok' | 'runtimeError' | 'timeout', stdout, stderr }[] }
```

Expected outputs never go to the Runner: learner code cannot read what is not in its container. The core compares outputs.

**Inside the Runner.** One Python harness runs in every Sandbox image and switches on the Language only to compile (py_compile, `tsc --noEmit`, `go build`) and to run. A learner mistake is a Compile Error; a crashed or killed compile step is a Runner error, never a Verdict. On start the Runner pulls each Language's image and is ready per Language: a Language whose image is not there yet answers 503 while the others run. Its containers carry its instance id, and its start-up sweep removes only containers of other instances older than the hard wall clock.

## Test seams

1. **Learning core:** Learner actions through `forLearner`, in-memory SQLite, fixture content, scripted Runner. Most tests live here.
2. **Runner and Sandbox:** real Docker; real code in all three Languages, plus escape attempts that must be contained.
3. **Content check:** every shipped Reference Code passes its own and earlier Core Tests in the real Sandbox.
4. **Image smoke test:** the built image through `init` and `docker compose up`, Playwright solving a Problem in each Language.
