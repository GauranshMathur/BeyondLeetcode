# Module map

The modules MVP1 is built from, where their seams sit, and how each is tested. Vocabulary: `CONTEXT.md` for the domain, the `codebase-design` skill for module, interface, seam, adapter, depth. Spec: issue #24.

| Module | What it hides | Seam and dependencies | Tested through |
|---|---|---|---|
| **Content catalogue** | Loading the bundled content, validating it (schema, acyclic Prerequisites, Reference Code and Solution in every Language) and answering read-only queries | In-process, no port. Tests load a fixture content folder | Its own queries; seam 3 (content check) |
| **Learning core** | Every product rule: Unlock, Read, Attempted/Solved, Complete, Builds, Branches, Language switch, assembling a Submission, Verdict, hiding Hidden Tests | Uses the Content catalogue and Prisma directly; the Runner through the Runner port | Seam 1 |
| **Runner port** | How code reaches a Sandbox | The one real seam: an HTTP adapter (production) and a scripted fake (tests); a Kubernetes adapter can follow | Both adapters satisfy the same contract tests |
| **Runner** (process) | Turning a request into a fresh hardened container per run (ADR 0002), collecting output, cleaning up | Owns the container engine socket; nothing else does | Seam 2, real Docker |
| **Identity** | Local Mode vs Multi-user Mode, Better Auth, Registration Mode, Invites, Admin password reset | Hands the rest of the app only a Learner id. Local → Multi-user links the first Admin's Account to the existing Local Learner, so no progress moves | Seam 1 style tests + screen e2e |
| **Web** | Nothing on purpose: SvelteKit routes call Identity, then the Learning core, then render | No rules live here | Screen e2e; seam 4 |
| **Instance packaging** | The `web`, `runner` and `init` roles (ADR 0004), migrations on start | — | Seam 4, the image smoke test |

## Learning core interface

```ts
createLearningCore({ catalogue, db, runner, clock? }): LearningCore
core.forLearner(learnerId): Learner      // every call below acts for this one Learner

// screen reads: never write
learner.map()                 learner.topic(topicId)
learner.chapter(chapterId)    learner.problem(problemId)

// Learner actions
learner.reachChapterEnd(chapterId)                    // → progress change (may Complete a Topic)
learner.saveCode(problemId, files, baseRevision)      // → new revision, or RevisionConflict
learner.run(problemId, files, baseRevision)           // → RunView { revision, compileError?, tests[{ name, input, expected, actual, stderr, passed, status }] }; Example Tests only; never changes progress
learner.submit(problemId, files, baseRevision)        // saves, runs, returns Verdict + Accepted panel
learner.startFromReferenceCode(problemId)
learner.switchLanguage(topicId, language)
learner.revealHint(problemId)
```

Errors: `NotFound` (404), `TopicLocked` (403; anything inside a Locked Topic except the Map), `RevisionConflict` (409; stale tab or second device), `InvalidBuild` (400; bad paths or a Build over the size cap), `NoMoreHints`, `RunnerUnavailable` (503; the Runner is down, busy or failed). A Verdict is never an error. Routes map codes to statuses through one shared helper.

**Rules the interface guarantees**

- Unlocked, Complete, Solved and Attempted are derived from Read marks and Submissions, never stored as flags, so content upgrades (keyed by stable ids) just work.
- A step's code is copied once, when the step is first touched: from the Learner's previous Core step, else from Reference Code. Later edits upstream never change it.
- The first Problem of a Topic starts from an empty Build. "Start from Reference Code" loads the Reference Code after the *previous* Problem.
- An Extra Problem works on a Branch copied from its parent Core step; nothing flows back to the Main Line.
- Submit runs the Problem's Tests plus every earlier Core Problem's Tests (up to the parent step for an Extra). It waits for the result; a Runner outage records nothing. It makes two Runner calls, each its own container: the Problem's Example Tests (the only output ever shown), then every other Test (outcomes only). Tests in one container are not isolated from each other: kernel counters survive the harness's cleanup, so a Hidden input must never share a container with a Test whose output is shown.
- The core, not the Runner, picks the Verdict: Compile Error > Time Limit Exceeded > Runtime Error > Wrong Answer > Accepted.
- A failing Hidden Test (or earlier step) shows only which Problem failed and the Verdict: no input, expected output or Learner output. Output is shown for failing Example Tests.
- A Solution's code is the Reference Code after that Problem.

**Inside the core.** The rules (Unlock graph, code seeding, Test assembly, Verdict, hiding Hidden Tests, the before/after diff for the Accepted panel) are pure functions with no I/O; a thin shell loads state, calls them, calls the Runner and saves. The pure rules are an internal seam: table tests may cover them, but behaviour tests go through `forLearner`.

## Runner port

```ts
execute({ language, files, tests: { id, input }[], limits })
  → { compileError?, results: { id, status: 'ok' | 'runtimeError' | 'timeout', stdout, stderr }[] }
```

Expected outputs never go to the Runner: learner code cannot read what is not in its container. The core compares outputs.

## Test seams

1. **Learning core:** Learner actions through `forLearner`, in-memory SQLite, fixture content, scripted Runner. Most tests live here.
2. **Runner and Sandbox:** real Docker; real code in all three Languages, plus escape attempts that must be contained.
3. **Content check:** every shipped Reference Code passes its own and earlier Core Tests in the real Sandbox.
4. **Image smoke test:** the built image through `init` and `docker compose up`, Playwright solving a Problem in each Language.
