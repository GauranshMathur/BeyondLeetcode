# TypeScript Submit timing: where a late Main Line Submit spends its time

Card C199. Question: on #418's CI (run 40850527851, attempt 1, 2026-10-29) the content check's TypeScript cases for `graphs-redundant`, `graphs-islands`, `graphs-cost` and `graphs-ways` got Time Limit Exceeded on the earlier step `graphs-same` (or `graphs-waves`) and passed on re-run. Where does a TypeScript Submit's time go, and can a Learner's correct Submit time out the same way on a slow host? No time limit, Sandbox setting or Runner code was changed to produce this note; the fix below is the maintainer's to decide.

## Summary

- **The failures are the container's hard stop, not a slow Test.** A TypeScript container spends about 1.5 s on `tsc` and then about 0.17 s per Test. A full batch of 25 hidden Tests is about 6.5 s of work at one full CPU, against `containerTimeoutMs` = 10 s counted from create. A host that gives the container about half a CPU pushes the batch past 10 s: the Runner kills the container, and every Test not yet answered becomes `timeout`. The per-Test limit (2 s) is never close.
- **Why the earlier step.** `submitPlan` puts the earlier Problems' Tests first, so a cut-off batch loses its last Tests. For all four failed Problems the first batch is 25 Tests and Test 25 belongs to `graphs-same` (Tests 21 to 24 to `graphs-waves`). That is the `earlierStep` in the four CI messages.
- **Reproduced on one CPU.** With the container and the client both on CPU 0 and one CPU hog competing, `graphs-redundant`'s TypeScript Submit gives Time Limit Exceeded every time (2 of 2), in 13.3 and 14.5 s. CI's failures took 13.5 to 14.0 s.
- **A Learner's correct Submit can fail the same way.** The code the Runner runs for a Learner has the same shape as the Reference Code (the Learner's `main.ts` carries the same earlier functions, so the same `tsc` cost and the same batches). Any host that gives a container less than about 0.6 CPU for 10 s will fail a late Problem's first full batch. The Learner then sees Time Limit Exceeded on an earlier step they did not touch.
- **Recommended fix:** compile TypeScript to JavaScript once per container and run the JavaScript, so each Test stops paying for Node's type stripping (about 100 to 130 ms of the 170 ms). Measured: a full batch drops from about 6.5 s to about 3.5 s. It changes `harness.py` only: no container flag, no limit, no Sandbox image. Details in Recommendation.

## What a Submit is

`graphs-redundant` is a late Core Problem: seven earlier steps (`graphs-edges`, `-matrix`, `-path`, `-dfs`, `-order`, `-waves`, `-same`). `submitPlan` (`learning/rules.ts`) turns its Submit into three Runner calls, each its own container:

| Call | Tests | What |
| --- | --- | --- |
| 1 | 1 | the Problem's own Example Test |
| 2 | 25 | hidden batch 1: earlier steps' Example and hidden Tests, in Main Line order (4 each), `graphs-same` last |
| 3 | 6 | hidden batch 2: `graphs-same`'s tail and `graphs-redundant`'s 3 hidden Tests |

Each container is created, started, sent the Build and the inputs, and then the harness (`harness.py`) does the following inside it: unpacks the files, runs `tsc --noEmit` once on the whole Build, and for each Test wipes `/work`, writes the Build back, starts `node main.ts`, waits, `kill(-1)`s and reaps. The Runner's hard stop (`containerTimeoutMs`, 10 s) starts when the daemon answers the create call and covers everything after it.

## Method

All on this 2-CPU, 8 GB host, Docker 29.7.2, the Sandbox node image `ghcr.io/gauranshmathur/beyondleetcode-sandbox-node:1`, the repo's real `createEngine` and `createSandboxRunner`, the real `graphs-redundant` Reference Code from `content/`, one container at a time under the shared heavy lock. The Runner's own limits applied (256 MB, 64 pids, one CPU quota, read-only root, `/work` tmpfs).

- **Phase timings** come from a script kept outside the repo that wraps the engine in a timing proxy (create, attach, start, remove) and stamps every output frame. The harness prints one line per Test, so frame times give the time of the first result (start of the harness to the end of `tsc` plus Test 1), the last result, and the gap between Tests. The harness and Runner are untouched.
- **One CPU** means `taskset -c 0` on the client, plus, where marked, `CpusetCpus: "0"` added to the container spec by the proxy only (the repo's spec is unchanged). With only the client pinned, the container could still use both CPUs.
- **Slow host** was imitated by running `yes` processes on CPU 0 beside the container: one hog is a half CPU share, two a third.
- **Micro-timings** of `tsc` and `node` inside one container at the Runner's limits and `--cpuset-cpus 0`, run directly with `docker run`, to split the per-Test cost.

## Measured phases

Timings in ms, three repetitions, `graphs-redundant` / TypeScript, a quiet host.

### Whole Submit

| Setup | Submit total (3 runs) | Verdict |
| --- | --- | --- |
| Client on CPU 0, container free | 11 594, 11 130, 12 076 | Accepted |
| Client and container on CPU 0 | 12 039, 11 558, 11 784 | Accepted |

### Per container (client and container on CPU 0, ranges over 3 runs)

| Call | Tests | Create | Attach | Start | `tsc` + Test 1 (start returns to first result) | Per Test (mean gap) | Last result after start | Container wall | Remove |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 40 to 44 | 1 | 111 to 129 | 1 790 to 1 815 | n/a | 1 790 to 1 815 | 2 135 to 2 148 | 110 to 111 |
| 2 | 25 | 38 to 39 | 1 | 117 to 137 | 1 803 to 1 844 | 178 to 194 (max 225) | 6 126 to 6 471 | 6 462 to 6 828 | 111 to 112 |
| 3 | 6 | 31 to 40 | 1 to 2 | 100 to 134 | 1 763 to 1 852 | 170 to 181 (max 219) | 2 620 to 2 703 | 2 956 to 3 061 | 110 to 120 |

The free-container runs match to within noise (batch 25: 5 906 to 6 570 ms).

### Split of the time

| Phase | Cost | Measured how |
| --- | --- | --- |
| `tsc --noEmit` of the 7 KB Build, once per container | about 1.4 to 1.6 s | `docker run` micro-timing, 4 runs 1 486 to 1 604 ms (and 1 377 to 1 437 ms in a later run) |
| `node main.ts` for one Test (type stripping and running) | about 135 to 165 ms (later run: 172 to 209 ms) | same |
| `node -e 0` alone | about 30 ms | same |
| `python -I -c 0` alone | about 20 ms | same |
| Rest of a Test (wipe `/work`, write the Build, `kill(-1)`, reap) | about 20 to 30 ms | gap per Test 170 to 190 ms less the `node main.ts` time |
| Create, start, attach, remove | about 40 + 120 + 1 + 110 ms per container | proxy |

So of a 25-Test container, about 1.6 s is `tsc` and start-up, about 4.5 s is 25 Tests (of which about 3 s is Node loading and stripping the TypeScript), and 0.11 s is the remove, which is after the Run. Across the three containers a Submit pays `tsc` three times (about 4.8 s) and 32 Tests (about 5.5 s).

## A slow host

Same Submit, client and container on CPU 0, with `yes` hogs on CPU 0:

| CPU share | Run | Submit total | Verdict | Call 2 wall | `tsc` + Test 1 | Per Test | Killed by the hard stop |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 (no hog) | 3 runs | 11.6 to 12.0 s | Accepted | 6.5 to 6.8 s | 1.8 s | 0.18 s | no |
| about 1/2 (1 hog) | 1 | 13 337 | Time Limit Exceeded | 10 184 | 4 133 | 334 | yes |
| about 1/2 (1 hog) | 2 | 14 506 | Time Limit Exceeded | 10 204 | 3 953 | 348 | yes |
| about 1/3 (2 hogs) | 1 | 14 515 | Time Limit Exceeded | 10 206 | 4 132 | 345 | yes |
| about 1/3 (2 hogs) | 2 | 14 385 | Time Limit Exceeded | 10 180 | 3 939 | 323 | yes |

At half a CPU, `tsc` takes 4 s and each Test 0.33 to 0.35 s, so Test 22 or so is the last to answer before the 10 s stop. A call-1 container (1 Test) still finishes (2.7 to 4.3 s). `runSubmission` stops at the first batch with a timeout, so call 3 never runs and the Submit ends at about 14 s. The test-by-test results are what `judge` reads: the first Test that timed out names the step.

I measured 1 and 1/2 and 1/3 of a CPU. The 0.6 CPU break-even is arithmetic, not a measurement: about 6.1 s of work (1.6 s start-up and `tsc` + 25 x 0.18 s) against the 10 s hard stop.

## The CI run

From the `sandbox` job of run 40850527851, attempt 1 (REST: `actions/jobs/123368571311/logs`; job `sandbox`, `ubuntu-24.04`, `bun run test:sandbox` with `CONTENT_DIR=content`, `SANDBOX_CONCURRENCY` at its default of 4, so four cases and up to four containers in flight):

| Case (TypeScript) | Time | Result | Cut off at |
| --- | --- | --- | --- |
| graphs-edges | 6 379 ms | pass | |
| graphs-matrix | 7 118 | pass | |
| graphs-path | 8 141 | pass | |
| graphs-dfs | 9 013 | pass | |
| graphs-would | 8 769 | pass | |
| graphs-order | 10 699 | pass | |
| graphs-waves | 11 699 | pass | |
| graphs-loop | 11 742 | pass | |
| graphs-same | 17 523 | pass | |
| graphs-redundant | 13 837 | Time Limit Exceeded | earlier step `graphs-same` |
| graphs-islands | 13 998 | Time Limit Exceeded | earlier step `graphs-same` |
| graphs-cost | 13 510 | Time Limit Exceeded | earlier step `graphs-waves` |
| graphs-farthest | 20 617 | pass | |
| graphs-ways | 13 659 | Time Limit Exceeded | earlier step `graphs-same` |

The same run's Python and Go cases for these Problems all passed in 4.0 to 7.6 s: Python Tests cost about 20 ms and Go runs a compiled binary, so neither comes near the 10 s stop. The `sandbox` job ran 822 s in total and had 4 failures out of 532.

What the CI timings say:

- The four failures took 13.5 to 14.0 s. The reproduction at half a CPU took 13.3 to 14.5 s: call 1 (3 to 4 s) plus a 25-Test container cut at the 10 s hard stop. A slow Test would not look like this.
- The cut-off step matches the plan: Test 25 of batch 1 is `graphs-same` for `graphs-redundant`, `-islands`, `-cost` and `-ways` (Tests 21 to 24 are `graphs-waves`; CI's `graphs-cost` run was cut a few Tests earlier, so its first timeout fell in `graphs-waves`).
- "Growing along the Main Line" is the number of containers. A Problem pays one 1.6 s `tsc` and one 10 s stop per container, and the later the Problem, the more full 25-Test containers its Submit runs, each with the same 10 s limit. A longer Submit therefore has more chances to meet a slow moment, but each full batch alone is already the risky unit. `graphs-same` at 17.5 s and `graphs-farthest` at 20.6 s passed with several full batches.
- The CI log does not say how many vCPUs the host had or what else ran. Four concurrent cases on a small runner give each container a CPU share below one, and the reproduction at half a share matches in time, but that is consistent evidence, not proof of the share.

## Can a Learner's correct Submit time out the same way?

Yes, on a host that cannot give each running container about 0.6 CPU or more for the first 10 s.

- The Learner's Build for a late Problem holds the same earlier functions, so `tsc` costs the same, and the batches are the same: `submitPlan` does not depend on the code.
- The Runner runs `availableParallelism()` containers at once by default (`main.ts`), each with a one-CPU quota. On a 2-CPU host that is both CPUs for two containers, with the web server, the database and Docker itself running alongside. Anything that takes more than about 40% of a CPU from a running container during a full batch is enough.
- The Learner would see Time Limit Exceeded on an earlier step (`graphs-same`) that their code passed before, and a re-run passes. That reads as a Runner problem and is, but the message blames their code.
- Only TypeScript is near the limit. Python (20 ms a Test) and Go (compile once, then a binary) are not, on this evidence.

## Recommendation

**Compile once, run the compiled JavaScript.** In `harness.py`, make the TypeScript compile step emit JavaScript into the work directory instead of `--noEmit`, and run `node out/main.js` for each Test instead of `node main.ts`. The type check is the same `tsc` call with the same flags; only the emit is new.

Measured in a container at the Runner's limits on CPU 0 (the same `graphs-redundant` Build, 3 to 8 runs each):

| | `--noEmit` today | Emit once |
| --- | --- | --- |
| `tsc` | 1 377 to 1 604 ms | 1 508 to 2 001 ms |
| One Test (`node`) | `node main.ts` 172 to 209 ms | `node main.js` 42 to 70 ms |
| A 25-Test container, `tsc` and Tests | about 5.7 to 6.8 s | about 2.6 to 3.8 s |

The full batch would then need about 3.3 s of work against the 10 s stop, which holds until the container gets about a third of a CPU, instead of about 0.6 now. Python and Go are unaffected.

What it would change, and what it would not:

- **Changes:** `compile_typescript` and the TypeScript `run` entry in `harness.py`, and any `harness.test.ts` / sandbox test that expects a stack trace or runtime-error text naming `main.ts` (the emitted file would be `main.js`; a source map or a path rewrite would be needed to keep line numbers in a Learner's runtime error). The harness is still one script, sent with `python -I -c`, so ADR 0002's "one harness" holds.
- **Does not change:** any container flag, any limit in `sandboxConfig`, the image, the tmpfs size or its `noexec` option (Node reads `.js`, it does not execute the file; the emit is a few KB). It is Runner code, so it needs the `sandbox-security-reviewer` pass.
- **To check before building:** `--erasableSyntaxOnly` already makes type stripping and emit produce the same program, so behaviour should match; the cases to run are a runtime error with its line number, `import ... from './util.ts'` (the emit needs `--rewriteRelativeImportExtensions`, in the TS 6 compiler the image pins; I used it and it compiled) and a Build with several files.

**Alternatives, if the maintainer prefers not to touch the harness:**

1. *Raise `containerTimeoutMs` from 10 s to about 15 s* (and `containerDeadlineS` from 15 s to about 20 s, which must stay above it). That is a limit change, in `config.ts` only. It moves the break-even to about 0.4 CPU. The cost is that a Submit's three calls can now take 3 x 15 s, over `adapterTimeoutMs` (30 s) and the queue arithmetic written beside `queueWaitMs`, so those would move too. Not recommended on its own.
2. *Lower `hiddenBatchTests` from 25 to about 15.* No, because `checkSubmitBatches` caps a Submit at `maxSubmitCalls` (3) Runner calls, so a Problem with more than 30 earlier-plus-own Tests would stop loading, and every extra container pays another 1.6 s `tsc`.
3. *Retry a Submit once when a batch was cut by the hard stop.* A policy change in the Learning core, and it hides the cause.

## Limits of this study

- Two runs at each slow-host setting; the pass/fail pattern was the same in all four, so the numbers are indicative, not a distribution.
- CPU share was imitated with `yes` processes on a pinned CPU. CI's contention is other containers on a shared runner, and its vCPU count is not in the log, so I did not model it further.
- Per-phase timing for the CI side is not available: the log has only each case's total.
- The `tsc`, `node` and emit timings are from `docker run` against the same image, not through the Runner, so they leave out the proxy's create/attach/start (about 0.2 s).
- The emit variant was measured, not built into the harness. Its effect on the Runner's runtime-error text and tests has not been tried.
