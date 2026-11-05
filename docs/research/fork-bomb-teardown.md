# Fork-bomb teardown: why the forced remove can hang past the hard stop

Card C201. Question from the sandbox-security review of #435 (C131): in main's CI run 40871712674 (`sandbox` job, 2026-10-29) the test "ends a bomb that forks without bound within the time limit, as a verdict or a refusal" (`src/lib/server/runner/escape.sandbox.test.ts`) took 22 133 ms against a 15 000 ms bound. The Runner logged `Could not remove container … (attempt 1/3)` with `Timed out waiting for the Sandbox exit`, and a second attempt took about 2.8 s. This note says where the time goes and what to change. No Runner code, container flag or limit was changed to produce it.

## Summary

- **Where the time goes.** The hard stop fires on time (about 10.1 s after create). Everything after it is the container taking seconds to die after `SIGKILL`, while the Runner's forced remove (issued in the same tick as the kill) waits for that death. The remove's 9 s budget ran out in CI because the container did not die for more than 9 s after the kill.
- **The error text is misleading.** `Timed out waiting for the Sandbox exit` is the generic message of `within()` (`sandbox.ts:226-228`), reused for the remove attempt. It does not mean the exit-status wait timed out.
- **Not proven: why CI's container took more than 9 s to die.** I could not reproduce a 9 s death on this host with a single container at the Runner's real limits (see Limits of this study). The measured part is that death after `SIGKILL` takes 1.2 to 2.8 s when the host is saturated, and that this latency, not the remove, is what the remove waits on. The cause below is an inference from that.
- **Recommended fix: no container flag or limit change.** Log what the kill did and how long the container took to die, fix the misleading message, and give the test a bound that matches the teardown the code is designed to allow. Details in Recommendation.

## How the fork-bomb case ends

The test sends `import os\nwhile True:\n    os.fork()` (`escape.sandbox.test.ts`). The container has `PidsLimit 64`, `Memory 256m` with the same swap, `NanoCpus 1e9` (`config.ts`, `containerSpec` in `sandbox.ts`). The harness (PID 1) gives each Test 2 s, then `kill(-1)` and waits up to 2 s in `reap()`; the Runner's hard stop is 10 s (`containerTimeoutMs`), the in-container deadline 15 s.

Three endings were seen:

1. **Memory kill (fastest, common alone).** 64 Python processes outgrow 256 MB, the kernel's OOM killer takes the harness too, the container dies with status 137 and the Runner refuses the request ("Sandbox harness exited with status 137"). About 1.5 s in total.
2. **Harness survives, reports `timeout`.** About 2.6 to 7 s depending on host load.
3. **Harness is starved; the hard stop fires.** Only this ending reaches `engine.kill` (`sandbox.ts:156`). This is CI's ending.

## Method and measurements

Instrumentation lives outside the repo (a Bun script that wraps the repo's own `createEngine`/`createSandboxRunner` in a timing proxy and logs each engine call, plus `docker events` with the kill signal and exit code, plus cgroup samples). The Runner code under test is main as of this card. All runs on a 2-CPU, 8 GB host, Docker 29.7.2, cgroup v2, kernel 6.8, `python:3.13-slim`, one at a time under the shared heavy lock. The client was pinned with `taskset -c 0`; where marked, the container too (`CpusetCpus: "0"`, added to the spec in the patched copy only).

### One container, the Runner's real limits

| Case | create | start | OOM / bomb ends | die (exit code) | remove call | remove returns |
| --- | --- | --- | --- | --- | --- | --- |
| Unbounded bomb, free host | 70 ms | 140 ms | OOM at ~1.2 s | 1.48 s (137) | 1.54 s | 1.67 s (131 ms) |
| Same, container on CPU 0, client on CPU 0 (3 runs) | 40 ms | 120-170 ms | OOM at 1.06-1.27 s | 1.2-1.4 s (137) | 1.25-1.43 s | 1.36-1.44 s (7-110 ms) |
| Same, plus three `yes` CPU hogs on CPU 0 (2 runs) | n/a | ~0.2 s | OOM at ~1.1-2.3 s | 2.37-2.48 s (137) | 2.46-2.56 s | +12 ms |
| Shell fork bomb (`:(){ :\|:& };:`, pids-limited, no memory growth) (2 runs) | n/a | ~0.11 s | harness reports `timeout` | 2.5-2.65 s (0) | 2.54-2.69 s | +8-107 ms |

In none of these did the hard stop fire, so no `kill` was ever sent: alone, the container ends itself well inside 10 s, and the remove is fast (7 to 131 ms) once the container is gone.

### Several containers at once (the hard stop fires)

The hard stop fired only when many bombs competed, which starves each harness of CPU so it neither reaches OOM nor finishes its 2 s Test timeout. These runs used 4, 8 and 20 simultaneous Runs, all pinned to CPU 0.

| Concurrent bombs | Result |
| --- | --- |
| 4 | All `timeout` verdicts, remove called at 4.6-4.8 s, no hard stop |
| 8 | All `timeout`, remove called at 5.9-7.3 s, no hard stop |
| 20 (two runs) | Hard stop (`kill` called) at 10.4-12.1 s for 17-19 of 20; `kill` resolves 1.4-3.1 s later; `remove` was called 0-15 ms after `kill`, resolves 50-130 ms after the container's `die` |

**The 20-container runs were taken under host memory pressure**. Use them only for the shape of the teardown, not for the cause or the magnitudes. Per-container, from `docker events`, for the 20-way run with events captured: first `kill` event to `die` event was 1.15 to 2.75 s (median about 1.4 s); every container that got a hard stop received one `kill` event from the Runner's `engine.kill` and a second from the forced remove (`DELETE ?force=true` also sends `SIGKILL`), and exited 137 (two that finished early exited 0). No `oom` event appeared in any of them (the bombs never grew fast enough), which is the point: this is the starved ending.

### Reading the timeline

- **Kill.** `engine.kill` is `POST /containers/{id}/kill`. Docker's reply comes when the container has stopped, so its resolution time is the death time (1.4 to 3.1 s after the call above). The Runner does not await it and swallows its rejection, so its latency and any error are invisible.
- **Exit.** `SIGKILL` to PID 1 of a PID namespace makes the kernel kill every other process in it, but the container only counts as dead once all of them (up to 64, each spinning in `fork` and competing for the one CPU quota) have been scheduled and run their exit. That is the 1.2 to 3.1 s above, and it grows with how loaded the host is.
- **Remove.** `engine.remove` (`DELETE …?force=true&v=true`) is sent 0 to 15 ms after the kill, not after the exit. The daemon holds it until the container is gone (it then answers about 50 to 130 ms later). It has a 9 s budget (`removeAttemptTimeoutMs`, `sandbox.ts:23`). CI's attempt 1 spent all 9 s waiting, so the container there did not die for more than 9 s after the hard stop: about 10.1 s + 9 s = 19.1 s, then 200 ms pause, then a second attempt of about 2.8 s (the container finally gone) = 22.1 s, matching the 22 133 ms.

## Cause

The teardown time is the time the kernel needs to kill and reap a PID namespace full of processes that are spinning in `fork` on a saturated host. The Runner sends `SIGKILL` correctly and on time; it simply has no view of how long the death takes, and no bound on it shorter than the remove's 9 s attempts. The test's 15 s bound (`containerTimeoutMs + 5000`) assumes that death is near-instant, which it is on an idle host (items 1 and 2 above) and is not on a loaded one.

What this study does **not** establish is why CI saw more than 9 s where the loaded local host saw about 3 s. Candidates, none measured: a smaller or busier cgroup CPU share on the CI VM (the job runs six test files and Docker builds on the same daemon), kernel PID-allocation contention with 64 spinning forkers, or a kill that failed or was lost. The last cannot be told from CI's logs because the kill's rejection is swallowed.

## Recommendation (one option)

**Observe first, and make the test's bound match the design; change no flag or limit.**

1. `src/lib/server/runner/sandbox.ts:156`: replace `engine.kill(id).catch(() => {})` with a call that logs a rejection and the time the kill took, for example:
   ```ts
   const killed = performance.now();
   engine.kill(id).then(
     () => console.warn(`Sandbox ${id} killed after ${Math.round(performance.now() - killed)} ms`),
     (error) => console.error(`Could not kill container ${id}`, error)
   );
   ```
   Behaviour is unchanged (still not awaited, still never throws); the next CI occurrence then shows whether the kill failed or just took long.
2. `src/lib/server/runner/sandbox.ts:226-228`: give `within` a label (`within(promise, ms, 'Docker remove of <id>')`) so a slow remove no longer logs `Timed out waiting for the Sandbox exit`. Pass the existing text from the exit-status call so its message is unchanged.
3. `src/lib/server/runner/escape.sandbox.test.ts` (this is C131): bound the unbounded-bomb test by what the code allows, `containerTimeoutMs + 2 * removeAttemptTimeoutMs` (28 s with today's constants, exported or mirrored in `config.ts`), still under the file's 60 s test timeout. Keep the assertions that the outcome is a verdict or refusal and that no container is left (`afterEach`), which are the security properties; the wall-clock bound is not one.

Cost: two small edits in `sandbox.ts` (a log line and a label) and a looser bound on one test; no behaviour change, no new dependency, no container flag or limit changed, so this alone needs no new security review of the sandbox beyond the usual one for any file under `src/lib/server/runner/`.

## Alternatives rejected

- **Lower `PidsLimit` (for example 32), or add a CPU pin/`CpusetCpus`.** Fewer processes would shorten the kernel's exit work, and it may well be the real fix if logging shows the death is slow. It changes a container flag or limit, which needs a `sandbox-security-reviewer` pass, and I have no single-container measurement showing it helps (alone, the bomb never reaches the hard stop). Revisit after step 1 has produced data.
- **A different kill signal.** `SIGKILL` is already the strongest; `docker stop`/`SIGTERM` would be slower and the harness ignores it.
- **Freeze (`docker pause`) before the kill.** Untested here, adds a second API call to the failure path and a new way for teardown to hang.
- **Await the kill and remove after it.** Does not shorten the death; it only serialises two calls that already overlap. It would also make the remove's 9 s budget start later, so a slow death would trigger a longer total.
- **Raise `removeAttemptTimeoutMs`.** Hides the problem and lengthens the worst-case cleanup the comment at `sandbox.ts:22` says is kept near 30 s.
- **Do nothing and raise the test bound only.** Cheaper, but leaves the failure unobservable (the swallowed kill error), which is the gap the review raised.

## Limits of this study

- Single-container runs at the Runner's real limits (`--memory 256m`, swap equal, 64 pids, 1 CPU) never reached the hard stop on this host. Runs that did (4, 8, 20 at once) are shaped by host contention. The 20-way runs were taken under memory pressure. They show the mechanism, not CI's 9 s. (The raw-container run with `--memory 2g` and 20 bombs that also hit the host's out-of-memory kill at 04:17 UTC on 2026-11-05 is not used for any number here, beyond one 1.4-1.6 s kill latency it printed.)
- The host is not CI's runner: kernel, CPU count and Docker daemon differ.
- No tests, Runner code, flags or limits were changed in this card; the patched engine proxy and scripts stay outside the repository.
