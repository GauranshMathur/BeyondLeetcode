# Image Prisma crash: why `web` answered a request with a Prisma error in the smoke test

Question: twice in CI's `docker` job (the image smoke test) the image's `web` answered a request with a Prisma error: `[500] POST /problems/[problemId] PrismaClientRustPanicError` on 2026-11-18 (a Submit) and `[500] GET /problems/[problemId] PrismaClientUnknownRequestError` on 2026-11-16 (a Problem page). Both start-ups also print `prisma:warn Prisma failed to detect the libssl/openssl version` twice. What raised the two errors, is the warning part of it, how often does it happen, and can it happen on an operator's Instance? Nothing was changed to produce this note: no code, no image, no workflow. The fix below is a proposal, and some of it is the maintainer's to decide.

All times are 2026-11-18 unless a date is given. Links of the form `runs/<id>` are `https://github.com/GauranshMathur/BeyondLeetcode/actions/runs/<id>`, and `job/<id>` is the job inside its run.

## Summary

- **The crash is real and not CI-only evidence.** It reproduced once in 600 browser-flow runs of an image built from `main` (`ba51fd4`): the same signature as the 2026-11-18 failure, a Submit that answers `[500] POST /problems/[problemId]` and never shows a Verdict (`runs/44404870965`, job 135157367095, run 5 of 20). The published `v1.21.1` image did not crash in 400 runs. 1 in 400 against 0 in 400 cannot tell the two images apart.
- **Rate.** 2 failures in 490 finished `docker` attempts in `ci` since 2026-11-11 (0.41%), and 1 in 1,000 flows in this note's runs (0.10%). Pooled: 3 in 1,490 (0.20%, about 1 in 500 starts of the image).
- **What raised the two errors is not established.** `web` logs only a class name (module-map, Logging), and the reproduced crash is in the same state. The Prisma source says exactly which code can throw each class (section 1). Both come from the query compiler (WebAssembly built from Rust) or from what the executor and the libSQL adapter return to it. None of it is the native query engine that Prisma 6 had.
- **The libssl warning is harmless and has nothing to do with the crash.** It is printed by the Prisma CLI's `migrate deploy` that `docker-entrypoint.sh` runs before `Listening on` (twice per start), never by the client in `web`. All 1,000 flows of this note's runs, including the 798 that passed, carried the same two lines. The image has no libssl, and the one native Prisma binary it holds (`schema-engine-debian-openssl-1.1.x`) has no unresolved library. Start-up downloads nothing.
- **The tier.** The crash is in code the image runs on every Instance (the same Wasm query compiler, the same Bun, the same `web`), and nothing it needs is specific to CI's runner. So the cause, which we do not have, has not been shown to be CI-only, and #773 should not drop to Tier 2 on this evidence.
- **The next step is a measurement, and it is the maintainer's call.** Without the error's message no fix can be cut. The smallest change that gets it is a CI-only run that lets Prisma's own debug output reach the record. That prints messages from `web`, which the Logging rule forbids, so it is asked as a question in the Recommendation.

## Method

Everything is from runs and files in this repository's CI and from Prisma's source. Nothing ran on the maintainer's host.

- **The two failed jobs' logs**: `job/134874335057` (`runs/44325154845`, PR head `7740bda`) and `job/133244904937` (`runs/43851495481`, release PR head `ede18aa`), fetched over REST with `gh api`.
- **Their build records** (`.dockerbuild` artifacts of those runs, plus the passing re-run of the first, `job/134886001920`), unpacked and read for base image digests, Bun versions and cached stages.
- **ci's history**: every `ci` run created on or after 2026-11-11 (480 runs, the newest 2026-11-18 21:28 UTC), and every `docker` job attempt of each (`/runs/<id>/jobs?filter=all`, 493 attempts). Every failed attempt's log was read for a `PrismaClient` line.
- **The `smoke-repeat` workflow** (on `main`), dispatched four times, each 10 jobs of 20 browser-flow runs on a fresh Instance each, plus the Prisma stress in the image and from a checkout:

| Run | Date | Image | Flows | Counted | Query-engine | Other | Stress rounds (image + checkout) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [`runs/44402958861`](https://github.com/GauranshMathur/BeyondLeetcode/actions/runs/44402958861) | 2026-11-18 | `ghcr.io/gauranshmathur/beyondleetcode:v1.21.1` (digest `sha256:bba48aa0...`, 21:35 to 21:46 UTC) | 200 | 200 passed | 0 | 0 | 3,000 per job, errors=0 |
| [`runs/44404870965`](https://github.com/GauranshMathur/BeyondLeetcode/actions/runs/44404870965) | 2026-11-18 | built from `main` `ba51fd4` (21:46 to 21:59 UTC) | 200 | 199 passed | **1** | 0 | 3,000 per job, errors=0 |
| [`runs/44407363818`](https://github.com/GauranshMathur/BeyondLeetcode/actions/runs/44407363818) | 2026-11-18 | `v1.21.1` (22:01 to 22:09 UTC) | 200 | 199 passed | 0 | 1 | 200 per job, errors=0 |
| [`runs/44408880436`](https://github.com/GauranshMathur/BeyondLeetcode/actions/runs/44408880436) | 2026-11-18 | built from `main` `ba51fd4` (22:09 to 22:19 UTC) | 200 | 200 passed | 0 | 0 | 200 per job, errors=0 |
| [`runs/44415991803`](https://github.com/GauranshMathur/BeyondLeetcode/actions/runs/44415991803) | 2026-11-18 | built from `main` `ba51fd4` (digest `sha256:421b17d5...`, 22:54 to 23:17 UTC) | 200 | 200 passed | 0 | 0 | 15,000 per job, errors=0 |

  Each job's record is the artifact `smoke-repeat-<job>` of its run (`summary.md`); the class of every flow is in its "Browser-flow runs" table. In total: 1,000 flows (400 on `v1.21.1`, 600 on `main`'s build), 998 passed, 1 query-engine, 1 other. The stress ran 214,000 rounds in the image and 214,000 from the checkout (8 calls a round, 3,424,000 calls in all), and none was an error. The stress counts per job were 3,000, 200 and 15,000. The workflow's own limit is `40 + 8 x runs + rounds / 100` minutes, capped at 350, so at 20 flows a job 15,000 rounds is the largest that fits: the last run below used it (it took 23 minutes). The first two pairs of runs used smaller counts, and the 15,000-round run was added after a review. A first dispatch with `image=1.21.1` failed at once on `manifest unknown` (`runs/44401969967`): the tag is `v1.21.1`. It ran nothing and is not counted. The one `other` flow (`runs/44407363818`, job 135166092994, run 7) failed at the Chapter screen's "read" marker (`smoke.smoke.ts:36`, a 5 s wait), with no `PrismaClient` line in `web`'s log. It is not a query-engine error and is not counted. Four earlier runs, on the pull request that built `smoke-repeat`, are not in the totals. Each ran 2 jobs of 3 flows, with the image built from the pull request's head (`Image: beyondleetcode:smoke-repeat`, not the published image): `runs/44379984450` (head `d6dd651`), `runs/44386178397` (`011c18d`), `runs/44391487962` (`20d3123`) and `runs/44397156648` (`9d52196`), all on 2026-11-18. The records of all eight jobs were read: 24 flows, all passed, 200 stress rounds per job and pass, errors=0.
- **Prisma 7.10.1's source** (the version `bun.lock` pins), the tarball of `prisma/prisma` at tag `7.10.1` over REST. The worktree has no `node_modules`, and nothing was installed, so the lines below are in the repository's TypeScript source, not the compiled `@prisma/client` runtime: the line numbers locate the code, they are not lines of the shipped bundle.
- **No step ran `bun run build` or any container on the maintainer's host.** The run counts are CI's.

Two limits apply wherever a conclusion rests on a clean stress. `web` runs through the built bundle and the stress runs from source. And `web` makes an Identity and Instance query on every request (`src/lib/server/handle.ts`) and the stress does not. So a clean stress says the Learning core's own queries do not crash in a long-lived process. It does not say `web`'s per-request path cannot.

## 1. The two errors

**What `web` and the logs give.** Only the class name and the route: in job 134874335057 `[500] POST /problems/[problemId] PrismaClientRustPanicError`, in job 133244904937 `[500] GET /problems/[problemId] PrismaClientUnknownRequestError`, and in the reproduction `[500] POST /problems/[problemId] PrismaClientUnknownRequestError` (`runs/44404870965`, job 135157367095, run 5 of 20: the flow's own Run passed, then the wait for the Verdict at `smoke.smoke.ts:66` timed out after 180 s). The message, stack and the query that failed are not in any of them, so which call failed is **not established**.

**What can throw each class in a client built with a driver adapter** (`PrismaClient({ adapter: new PrismaLibSql(...) })`, `src/lib/server/db.ts:20`). The generated client uses Prisma's client engine: the query compiler runs as WebAssembly, loaded from `@prisma/client/runtime/query_compiler_fast_bg.sqlite.wasm-base64.mjs` (the generated `internal/class.ts` imports it, per the image record), and the executor calls the adapter. All of it is in `packages/client/src/runtime/core/engines/client/ClientEngine.ts` at tag `7.10.1`:

| Class | Raised at | When |
| --- | --- | --- |
| `PrismaClientRustPanicError` | line 66 | The global panic hook `PRISMA_WASM_PANIC_REGISTRY.set_message`, for a Wasm panic outside the compile call's own handler |
| | line 368, in `#withLocalPanicHandler` (344 to 371) | The Wasm query compiler panicked during `compile` or `compileBatch` (called at lines 697 and 717), or while it was being constructed (line 272) |
| | line 303, in `#transformRequestError` | An error with code `GenericFailure` whose message starts with `PANIC:`, coming out of the executor or the adapter |
| | `RequestHandler.ts:245` and `:254` | Rethrown with context when the error is a panic |
| `PrismaClientUnknownRequestError` | line 338, in `#transformCompileError` (326 to 342) | The compiler returned an error with a `message` and no `code` |
| | line 318, in `#transformRequestError` (299 to 324) | The error was a string that parses as JSON with `message` and `backtrace` |
| | `RequestHandler.ts:247` | Rethrown with context |

So `RustPanic` here means a panic in Rust code that runs as WebAssembly, or an error the executor labels `PANIC:`. `UnknownRequestError` is a compile error with no known code, or a JSON error the engine produced. A driver error (a SQLite `SQLITE_BUSY`, a constraint) is not these two classes: they reach the client as `PrismaClientKnownRequestError` with a code (`UserFacingError` at lines 308 to 309; the mapping is `mapDriverError` in `packages/adapter-libsql/src/errors.ts:19`). The libSQL native addon is a Neon module (`libsql` 0.5.29 depends on `@neon-rs/load`, `bun.lock` line 480), and a Rust panic in such a module becomes a JavaScript exception; I did not verify that in the module's source here, so treat it as likely, not shown. The reproduction's `GET /` answered 200 afterwards, so the process lived.

On a panic the engine discards the compiler and disconnects (`#withLocalPanicHandler`, 358 to 365 of its 344 to 371), and the next request reconnects through `#ensureStarted` (lines 184 to 229). A compile error leaves the engine connected.

**Which one is it.** Not established. The evidence that points at the compiler: the failures are a Problem page and a Submit, the two requests that run the most Prisma queries; the compile step runs once for each new query shape per process, then the plan is cached (`#queryPlanCache`, lines 494 to 502 and 566 to 574); and every failure so far was in the flow's first use of a fresh `web`. That is a hypothesis from the source and the three cases, not a finding. What would settle it is the message of one crash, which needs a change to what `web` prints in a CI-only run (Recommendation).

**What the Learner saw.** The Verdict never appeared in the Submit cases (the flow waited 180 s for it: "element(s) not found" in the first job's log, line 2004), and the editor never rendered in the GET case (the flow waited the whole 600 s test timeout for `Code: main.py`, `smoke.smoke.ts:11`). Neither is one of the Learning core's errors (404, 403, 409, 400, 503): they are SvelteKit's 500 for an error the app does not map. The text the page showed is not recorded; the smoke flow keeps no screenshot of the failing page.

## 2. The libssl warning

**Where it is printed.** `packages/get-platform/src/getPlatform.ts:500` in the Prisma CLI's platform detection (`getBinaryTargetForCurrentPlatformInternal`): it prints when `libssl === undefined` on Linux and then "Defaulting to openssl-1.1.x". The detection (`getSSLVersion`, lines 343 to 403) looks for `libssl.so.*` in known directories, then `ldconfig -p`, then `openssl version -v`. The client runtime does not import `@prisma/get-platform` (the only reference under `packages/client/src` is a type import, in `EngineNotFoundErrorInput.ts`). So the warning comes from the CLI, not from the Prisma client in `web`.

**It comes from `prisma migrate deploy`, run on start.** `docker-entrypoint.sh` runs `bunx prisma migrate deploy` for the `web` role before it `exec`s `bun src/lib/server/web-entry.ts`. In the failed job's log the two `prisma:warn` lines sit between "Loaded Prisma config from prisma.config.ts." and "Prisma schema loaded from prisma/schema.prisma." and so before "Listening on" (`job/134874335057`, `web`'s lines, from "Loaded Prisma config" to "Listening on"; the same in `job/133244904937`). The image record shows the same two lines, with no `web` running, from `prisma migrate deploy` run as the entrypoint runs it: `runs/44397156648`, artifact `smoke-repeat-1`, section "Prisma in the image" (a version command prints it once, the migrate deploy twice). And in all 1,000 flows of this note's five runs `web`'s log held exactly 2 such lines, one pair per start. If the client printed it too, a start would show more than 2.

**The image has no OpenSSL, and the engine file needs none.** From the same record (identical for `v1.21.1` and for the build from `main`, `runs/44402958861` artifact `smoke-repeat-1` and `runs/44404870965` artifact `smoke-repeat-9`): Debian 12, Bun 1.2.19, no `openssl` binary on the PATH, no `libssl.so*` or `libcrypto.so*` anywhere. The Prisma and libSQL files under `/app/node_modules`:

| File | What it is | Needs OpenSSL? |
| --- | --- | --- |
| `@prisma/engines/schema-engine-debian-openssl-1.1.x` (28 MB) | Native Rust schema engine, the one `migrate deploy` runs ("Schema Engine: schema-engine-cli d1b3f377... at node_modules/@prisma/engines/schema-engine-debian-openssl-1.1.x") | `ldd` lists no unresolved library, and there is none to resolve: it needs no libssl in this image |
| `@prisma/client/runtime/query_compiler_fast_bg.sqlite.wasm-base64.mjs` and `.js` (4.4 MB) | The query compiler, WebAssembly | No: it is not an ELF file |
| `prisma/build/*.wasm`, `schema_engine_bg.wasm` | The CLI's own Wasm compilers and schema engine | No |
| `@libsql/linux-x64-gnu/index.node` (9.7 MB) | libSQL's native addon, what `@prisma/adapter-libsql` loads for a `file:` database | `ldd`: no unresolved library |

(The `-musl` addon files in the list are the alternative builds for Alpine; their `ldd` lines show `libc.so not found` and they are never loaded on this Debian image.) The name `openssl-1.1.x` in the engine's file name is only Prisma's default label for the binary it picks when detection fails.

**Start-up downloads nothing.** The record runs `migrate deploy` twice, once on the default network and once with `--network none`. Both exit 0 with the same output and "All migrations have been successfully applied", so nothing was fetched.

**So: harmless.** The warning appears on every start, with and without a crash: 998 of the 1,000 flows passed with the same two lines in the log. It says a library the CLI does not use in this image is missing. Adding `openssl` to the image (an apt package) would silence it. That is a change to the image's packages and the maintainer's decision, and nothing here shows it prevents the crash. The other way to silence it, an environment variable, was not looked for and is not claimed.

## 3. Reproduction

| Where | Flows | Query-engine | Per flow | Stress rounds |
| --- | --- | --- | --- | --- |
| `v1.21.1` image, `runs/44402958861` and `runs/44407363818` | 400 (399 passed, 1 other) | 0 | 0 of 399 | image 32,000, errors=0 |
| Image built from `main` `ba51fd4`, `runs/44404870965`, `runs/44408880436` and `runs/44415991803` | 600 (599 passed, 1 query-engine) | **1**, `[500] POST /problems/[problemId] PrismaClientUnknownRequestError` | 1 of 600 | image 182,000, errors=0 |
| A checkout on Bun 1.2.19, the same four runs | not a flow | | | 214,000 rounds (1,712,000 calls), errors=0 |

- **The crash reproduces, once, on the image built from `main`.** It is the Submit signature of the 2026-11-18 failure with the other class (`UnknownRequestError` where that one was `RustPanicError`). It happened in run 5 of 20 on a runner that had already run four flows, so not a cold runner.
- **The published `v1.21.1` image did not crash in 399 counted flows.** That does not show it cannot: at the rate measured in CI (0.41%) no crash in 399 flows has a probability of about 19%, and at the pooled 0.20% about 45%. Rates above about 3/399 = 0.75% are unlikely. The two images are the same build in the facts that matter: the image facts in the two records are the same apart from file times and the image digests (`v1.21.1` is `sha256:bba48aa0...`, the build from `main` `sha256:ea386d57...`), and the second `prisma:warn` line sits in a different place in the two migrate outputs, which is only how the two output streams interleave. Both builds use the same two Bun images (below).
- **The stress does not reproduce it.** 428,000 rounds in all (214,000 in the image, 214,000 from a checkout, 3,424,000 calls), zero errors, while the flows crashed at about 1 in 600 on `main`'s build. The stress is therefore not a test of this crash. The three failures were each on a fresh `web`'s first requests, and the stress is one long-lived process (see the limits in Method).
- **Bun: the checkout and the image run the same Bun, 1.2.19.** The card asks for a run with `bun_version=1.4.3` only when the stress reproduced an error. It did not, and that input changes only the checkout pass, not the image the flows use, so it could not separate the runtime from the packaging here. Not run.
- **The build records.** The three records (`.dockerbuild` artifacts 14436962065 of `runs/44325154845` job 134874335057, 14437394305 of its passing re-run job 134886001920, and 14218482903 of `runs/43851495481` job 133244904937) name the same two base images: build stage `docker.io/oven/bun:1.4.3@sha256:ec06c3b6cea04192ae6770c434f668ca41d343ad19fa6472216c7b48be39c598`, and `deps` and runtime stage `docker.io/oven/bun:1.2.19@sha256:31f25ad4c661322a3dc9d9d98fbf34989502b1ea588a2ca629da98c8e5a2d116`. The `deps` stage (`bun install --production`, step 5 of 5) was cached (`#19 CACHED`) in both failed jobs' logs and in the passing re-run's, so it does not tell them apart. The three builds name the same base images, so the failing and the passing build differ in nothing these records show.

## 4. Rate

**ci's history since 2026-11-11** (`runs?created>=2026-11-11`, 480 runs; every job named `docker`, 493 attempts including 13 re-runs):

| Attempts | Count |
| --- | --- |
| Success | 487 |
| Failed with a `PrismaClient` line in `web`'s log | **2** (`job/133244904937`, `job/134874335057`) |
| Failed for another reason | 1 (`job/133213879228`, `runs/43842348712`, 2026-11-16: Docker Hub's unauthenticated pull limit, `toomanyrequests`, then `runner RunnerNotReady`, and no Prisma line) |
| Cancelled | 1 (`job/132523333413`) |
| Still running when counted | 2 |

So 2 Prisma failures in 490 finished attempts, 0.41%, 1 in about 245. The card-writer's "2 in about 465 runs" is the same figure with the window's ends not counted. The Docker Hub failure is kept out. By event: 2 of 367 finished attempts on pull requests, 0 of 123 on pushes to `main`. That is not enough to say `main` is safer: 2 against 0 is a difference this small a count cannot support. Of the 13 re-runs, all passed; the three failed attempts are not among them.

The failures are not tied to a dependency change: `bun.lock` was last changed on 2026-11-08 and the Dockerfile on 2026-11-10 (comments only after that), before the window opened.

**This note's runs**: 1 query-engine in 1,000 flows, 0.10%. The two figures agree within what such small counts can say. **Pooled** with ci's history, counting each `docker` attempt as one flow: 3 in 1,490, 0.20%.

## 5. Operators or CI only

Not shown to be CI-only. For and against:

- **It reproduced in the image's own code on the same kind of runner**, and not in anything CI adds: the failing path is `web` (the Wasm query compiler, `@prisma/adapter-libsql`, `@libsql/linux-x64-gnu`, Bun 1.2.19, SvelteKit's handler) in a container built by the Dockerfile. The Runner is part of every Instance (the `runner` role of `docker-entrypoint.sh`, module-map, Instance packaging), so the composed stack is the operator's stack. What CI adds is the Playwright browser and the flow, on a GitHub-hosted `ubuntu-24.04` host that `docker info` in the job logs reports as 4 CPUs and 15.61 GiB (`job/134874335057` log lines 224 and 513; `job/133244904937` lines 224 and 512; `job/135157367095` lines 408 and 698). A comment in `ci.yml` (line 120) says the runner has two CPUs; the two were not reconciled here. Whether a small operator VPS is more or less loaded than that host, and whether load matters at all, is **not established**: no cause is known, so no property of the host can be tied to it.
- **Against**: all three cases are on GitHub's runners, and the rate, 0.2% to 0.4% of fresh starts, is low. Nothing here comes from an operator's Instance, and no operator report exists.
- **What the evidence on timing says.** All three cases were on a fresh `web`'s first requests. In `job/134874335057`, the log gives these times: `web` started at 14:33:19.2 (`Container ...-web-1 Started`), the browser flow's test began at 14:33:50.7, and the 180 s Verdict wait that failed began at about 14:33:53 (the failure was logged 14:36:53.16). So the Submit that crashed ran about 34 s after `web` started. In `job/133244904937` `web` started at 10:46:05.5 (log line 1949) and the test began at 10:46:37.2 (line 1989), 32 s later; the failing GET was for the Problem page whose editor the flow then waited for (`smoke.smoke.ts:11`), so it came after the test began, and its exact time is not in the log. `web` prints no timestamps and the log is shown after the flow ends, so the time from "Listening on" to the 500 is not in it. An operator's long-lived `web` has had its queries compiled and cached by its first minutes; the first Submit after each start would be the exposed request.
- **Did `web` answer the next request.** Yes, once: in the reproduction `web` answered `GET /` with HTTP 200 afterwards (`runs/44404870965`, artifact `smoke-repeat-9`, the "web answered GET / afterwards" column of run 5). In the two earlier jobs `web` logged nothing after the 500 and the flow stopped there, so nothing shows whether it recovered. The source says a compile error leaves the engine connected and a panic disconnects and reconnects on the next request (section 1).
- **Did a crashed Submit leave anything recorded.** Not established. A Submit makes three kinds of database call: `web`'s per-request Identity and Instance reads, the Build save before the Runner is called (`saveThen`), and the Submission and its progress in one transaction after the Verdict (`recordSubmission`, `src/lib/server/learning/progress.ts:112` to `:116`, which inserts first and reads after, in `db.$transaction`). A Runner outage records nothing by design, and a failed transaction rolls back, but which call failed is the unknown, and the Instances were deleted by `down -v` before anything could be read. To settle it, the failing run's database would have to be read before it is removed.

**What decides the tier.** The Instance definition (CONTEXT.md) is one self-hosted installation run by an operator, and nothing above rules out an operator's Instance. By the principal's rule on the issue ("drops to Tier 2 if the cause proves to be CI-only"), the cause is not shown to be CI-only, so Tier 0 stands for now. It would be the principal's to move.

## 6. The fix

**No fix can be written from this evidence.** The cause is not known, so a card that "fixes the crash" would guess. What follows is what the note can support.

1. **The libssl warning needs no code change.** It is the CLI's, harmless (section 2), and not linked to the crash. The honest options are a line in the operators' guide, or installing `openssl` in the image. The second adds an apt package to the image: **the maintainer's decision**, and the evidence does not ask for it.
2. **The cause needs one measurement first: the message. Starting it is the maintainer's decision (see Recommendation).** Smallest way to get it: in `smoke-repeat` only, start `web` with Prisma's own debug output on (the `DEBUG` variable the Prisma client reads; the exact namespaces to be read from the source or docs by the card, not decided here), through a compose override in `.github/smoke-repeat.sh`, so a crashing flow's record carries the error's message and stack. That changes no `web` code and no logging module, but the process then prints messages, so the same care the stress already takes applies: throwaway Instance, bundled content, generated values, record scrubbed of the Runner token and auth secret. Because a 0.2% crash needs about 1,300 flows to show once more, it is several dispatches (Q7).
3. **Then the fix goes where the message points.** If it is a Wasm compile panic or error on a cold start, the candidates are the Prisma version (a patch of 7.x), warming the client with one query at start before serving (`src/lib/server/db.ts` or `web-entry.ts`), or the production Bun version. A different Bun or a Prisma bump is the **maintainer's decision** (mvp1.md: the stack lines name Bun and "SQLite through Prisma 7 with `@prisma/adapter-libsql`"). A change to Prisma 7 with a different adapter, or to the schema, is also the maintainer's. A fix that stays inside `db.ts` or `web-entry.ts` (retry of a failed request on a panic, warming at start) adds no dependency but changes behaviour on an error path, so a card for it should name that.
4. **Whether to ship a retry is not decided here.** A panic leaves the engine to reconnect on the next request (section 1), so a retry of the failed request is possible. It would hide the crash from the Learner and from the log, so it is a product and logging question.

## 7. The proof's run count

Zero crashes in *n* flows has a chance below 5% when *n* is about 3 / rate (exactly ln 20 / rate = 3.0 / rate). At the rates measured before the fix:

| Rate | Source | Flows for zero crashes to be less than 5% likely by chance |
| --- | --- | --- |
| 0.41% (2 in 490) | ci's history | about 735 |
| 0.10% (1 in 1,000) | this note's runs | about 3,000 |
| **0.20% (3 in 1,490)** | pooled | **about 1,490** |

Recommended: **1,800 browser-flow runs** on the fixed image, which is six dispatches of 10 jobs of 30 runs (the workflow's largest per-job count, about 16 minutes each), and every run of the fixed image counted by its own link. It covers the pooled rate with a margin, and it is more than 4 times the published image's 399 clean flows. If the first measurement in section 6 shows the crash only on a first Submit after start, the proof might be cheaper, which that measurement would have to show. A fixed image that shows one query-engine error in the proof fails it.

**Stress rounds: no count can be given.** The stress produced no error in 428,000 rounds (214,000 in the image), so it has no measured rate, and zero in any number of rounds proves nothing about this crash (limits in Method). The proof should rest on flows. If the fix changes what the stress could see (for example warming at start), the stress should first be changed to start a fresh process per round, a change to `src/lib/server/prisma-stress.bun-check.ts` for a later card.

## Recommendation

**Question for the maintainer.** May a CI-only `smoke-repeat` run start the image's `web` with Prisma's DEBUG output on, so that a crashing flow's record carries the error's message?

**Recommended answer: yes, on these terms.** The change is a compose override in `.github/smoke-repeat.sh` for `smoke-repeat` runs only: no change to `web`, to the logging module or to the published image. It would be a card for the lane; the note builds nothing. The decision is the maintainer's, because the Logging rule (module-map: only a class name and a known code are logged, never a message) is a security rule, and because the run would make `web` print what that rule keeps out.

**What DEBUG would print, stated fairly.** The error's message line is `debug(error)` in `RequestHandler.ts:202`, namespace `prisma:client:request_handler`. DEBUG does not print only that: it prints every line of the namespaces chosen. In the client engine that includes the driver adapter's configuration with `%O` (`ClientEngine.ts:127`, namespace `prisma:client:clientEngine`) and every query plan created (`ClientEngine.ts:508`), for every request of the flow. So the record's scrubbing would have to cover more than the Runner token and the auth secret the stress and the flow already handle: whatever the adapter configuration holds (the database URL) and whatever values the plans carry. The smallest namespace that holds the message is `prisma:client:request_handler`; whether it prints the failing query is not checked here. A card for this must read the namespaces and what each prints before it chooses, and the record must be shown clean of generated values and of the adapter configuration, as the existing record is now.

**If the answer is no.** The cause stays unknown. The note's other options are then to raise the rate of the crash (it is about 0.2% of fresh starts, so the proof's 1,800 flows), or to try a Prisma patch version and measure the same rate, which is the maintainer's decision under mvp1.md.

**Tier.** #773 stays Tier 0 on this evidence (section 5). The libssl warning needs no change.

## Findings for the principal

- **ADR 0003's sentence "Prisma 7 has no Rust engine" is accurate about the query engine and incomplete about the image.** The image runs Rust in three places: the CLI's native schema engine (`migrate deploy`, 28 MB), the query compiler as WebAssembly (the Rust that raises `PrismaClientRustPanicError`), and libSQL's native addon. The class's name predates the change. The ADR is not edited here.
- **Two versions of `@libsql/client` are in the image.** The app depends on `^0.18.0`, and `@prisma/adapter-libsql@7.10.1` nests its own `0.17.4` (`bun.lock`, the `@prisma/adapter-libsql/@libsql/client` entry), both on the same native `libsql` 0.5.29. Not shown to matter; a measured fact.
- **`web`'s per-request path is not in the stress.** Section 3's limits: a later stress card should use a fresh process per round and the Identity and Instance reads.

## Limits of this study

- **The message of the error was never seen.** Every statement about what raised it is from Prisma's source and the classes, not from a captured error.
- **One reproduction.** The crash happened once in 1,000 flows. A rate from one event is wide: 1 in 1,000 is consistent with anything from about 0.003% to 0.6%.
- **Times in the first job** are derived from step timestamps because `web` prints none.
- **The Prisma source read is the repository tree at tag `7.10.1`**, not the compiled package that ships in the image.
- **The `other` flow** (`runs/44407363818`, job 135166092994, run 7) failed on the Chapter "read" marker, not on Prisma; it is a separate and unexplained flake in 1,000 runs.
- **Host and image digests**: GitHub-hosted `ubuntu-24.04`, `mcr.microsoft.com/playwright:v1.64.1-noble@sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea` for the browser; the image under test `v1.21.1` is `sha256:bba48aa0c3621de7daa0a1a1a80cf2e8391ba0aa22feb8c0718d1117a28767e3`, and the build from `main` is `sha256:ea386d5764a46783dc2255d96139fb202db226cd4be45305f228724a9d2d674a` (job 135157367095's record).
