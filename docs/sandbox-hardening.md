# What was found running the Sandboxes under rootless Docker, rootless Podman and gVisor

## What this is

By default every Sandbox runs under rootful Docker, with the flags in [ADR 0002](adr/0002-sandbox-per-run-containers.md). Each of the three engines below was tried in one run, in two attempts on GitHub-hosted runners, with the Sandbox tests and the composed Instance, and not on any other host. Rootful Podman was not tried, because its socket is root on the host, as rootful Docker's is. A Kubernetes backend is not covered: `docs/product/mvp1.md` says it comes later.

This page reports what one run found. It recommends no engine over another, and no result here is a promise for another host. It proposes no change to a Sandbox limit, flag, mount or image: a Runner change for an engine, or a Sandbox limit that does not hold under one, is the maintainer's decision.

## The run

- Run: [https://github.com/GauranshMathur/BeyondLeetcode/actions/runs/44303339981](https://github.com/GauranshMathur/BeyondLeetcode/actions/runs/44303339981), the on-demand `sandbox-engines` workflow on `main`.
- Commit: `51cff991145d6e2e6dae07614fa1564fb9cbfdf2`.
- Date: 2026-11-18. The first attempt started at 12:22 UTC; the second, of the failed legs only, at 12:38 UTC.
- Runner images and kernels (`ImageOS ImageVersion`, kernel). GitHub assigned them per leg and attempt, so they differ:
  - baseline (rootful Docker): `ubuntu24 20261111.370.1`, `7.0.0-1017-azure`;
  - rootless Docker: first attempt `ubuntu24 20261111.370.1`, `7.0.0-1017-azure`; second attempt `ubuntu24 20261111.127.1`, `7.0.0-1014-aws`;
  - Podman: first attempt `ubuntu24 20261111.127.1`, `7.0.0-1014-aws`; second attempt `ubuntu24 20261111.370.1`, `7.0.0-1017-azure`;
  - gVisor: first and second attempt `ubuntu24 20261111.127.1`, `7.0.0-1014-aws`.
- Baseline leg (the runner image's own rootful Docker, docker-ce 28.0.4, no change): 145 Sandbox checks, 145 passed, 0 failed; the composed Instance came up in 5 s and the browser flow passed.

The legs that failed in the first attempt were re-run once, and both attempts are written here:

- Rootless Docker, first attempt: red. One suite, `http-adapter.sandbox.test.ts`, failed in its shared set-up with `DeadlineError: Docker POST /containers/create timed out`, so 76 of the 145 checks did not run (the leg reported 146: 69 passed, 1 failed suite, 76 skipped). A `POST /containers/create` got no reply in time, in that suite's set-up and before any of its tests. By the job log's timestamps, the suite's Runner reported ready at 12:24:56.8 UTC and the suite failed at 12:25:11.9, 15 s later (the suite reported 15213 ms). The images had finished loading into the rootless engine at 12:24:56.0, and its daemon had begun listening at 12:24:40.0. The 15 s matches the engine-call limit in `src/lib/server/runner/config.ts` (`engineCallTimeoutMs`, a reading of the Runner's code, not something the run printed). Reading the test's code, the create that timed out was the test set-up's own warm-up call to the engine, which uses the same 15 s default, not a call by the Runner process. The other 69 checks, the composed Instance and the browser flow passed. The run has no engine-side log for that moment and does not show why. Second attempt: green, below.
- Podman and gVisor: the same tests failed in both attempts (34 of 145 and 139 of 145 passed).

The tables and totals below are from the second attempt. One caveat applies to every leg: the escape test that probes the Docker host gateway reads the bridge network's gateway and falls back to `172.17.0.1` when it cannot. The summaries do not record which address it used, so on the rootless legs its pass is not proven to be a probe of the host's address. The caveat concerns only the gateway probe: the internet and DNS targets are fixed in the test, and on every leg where the test reached a verdict they were blocked.

## Rootless Docker

**Outcome.** On the second attempt the Instance ran under rootless Docker with all 145 Sandbox checks passing and the browser flow passing. The first attempt was red: one suite's shared start timed out and 76 of the 145 checks did not run (details under "The run"); the run does not show why. What the trial host shows is that the Instance works under rootless Docker. It does not show a host where rootless lowers what an escape reaches: the runner user had `sudo`, and the runner's rootful daemon kept running (which is why `--force` was needed in step 6). From Docker's rootless documentation, not from this run ([Rootless mode](https://docs.docker.com/engine/security/rootless/)): rootless mode "executes the Docker daemon and containers inside a user namespace", with "both the daemon and the container ... running without root privileges"; and when a system-wide daemon is kept running, `--force` is needed and "until you shutdown and disable you're still running rootful Docker". That last case is the trial host's.

**Version tried.** Docker Engine 28.0.4 (rootlesskit 2.3.4, slirp4netns 1.2.1), the same version as the runner image's own docker-ce.

**What to install or set on the host.** These are the steps the leg took, in order, as the runner user:

1. Packages: the leg needed `uidmap`, `dbus-user-session` and `slirp4netns` and found them already installed, so it installed nothing and the host-change list has no line for them. Docs: [Rootless mode, prerequisites](https://docs.docker.com/engine/security/rootless/).
2. Give the user subordinate ids: `sudo usermod --add-subuids 231072-296607 --add-subgids 231072-296607 <user>`, when `/etc/subuid` and `/etc/subgid` have no line for the user. Docs: the same page.
3. Delegate the cgroup controllers to user sessions, so the Sandbox's CPU, memory and pids limits can be set. Write `/etc/systemd/system/user@.service.d/delegate.conf` with `[Service]` and `Delegate=cpu cpuset io memory pids`, then run `sudo systemctl daemon-reload`. Docs: [Limiting resources](https://docs.docker.com/engine/security/rootless/tips/).
4. Enable linger for the user, so the user's engine outlives the login: `sudo loginctl enable-linger <user>`. Steps 2 to 4 concern the user that runs the engine.
5. Install `docker-ce-rootless-extras` at the same version as Docker (here `docker-ce-rootless-extras_28.0.4-1~ubuntu.24.04~noble_amd64.deb`, from Docker's `noble` stable pool, checked against its sha256 `2abb177d60561ac77b50a42b60500ab194b70f40f4b225d837c1fdccaaab7a28`), with `sudo dpkg -i`. Docs: [Rootless mode](https://docs.docker.com/engine/security/rootless/).
6. As the user, run `dockerd-rootless-setuptool.sh install --force`. `--force` was used because the runner's rootful daemon stayed running. Docs: the same page.

Not a host change: the rootless engine has its own image store, so the trial copied the Sandbox images and the app image into it with `docker load`. The run did not test a pull from a registry: the start test pulled `python:3.13-slim` into the engine with its layers already present (nothing was downloaded), and the other images were never pulled.

Ubuntu 24.04 only: it restricts unprivileged user namespaces (`kernel.apparmor_restrict_unprivileged_userns = 1` on every leg, baseline included). The leg did not change that setting. Its setup checked that the `rootlesskit` AppArmor profile file was present, which Docker's rootless troubleshooting page ([Troubleshoot](https://docs.docker.com/engine/security/rootless/troubleshoot/)) says comes with the Ubuntu `apparmor` package, and it went on.

**What to change in `compose.yaml` or `.env`.** The Runner gets the user's socket instead of `/var/run/docker.sock`. The leg used this `compose.override.yaml` and no `.env` change beyond naming the app image:

```yaml
services:
  runner:
    volumes:
      - /run/user/1001/docker.sock:/var/run/docker.sock
```

`1001` was the runner user's uid on the runner; use the uid of the user that runs the engine. The merged configuration had exactly one socket mount, from `/run/user/1001/docker.sock`, and `web` had none.

**How to check it took effect.**

- `docker info` with `DOCKER_HOST` set to the user's socket. It printed `SecurityOptions=["name=seccomp,profile=builtin","name=rootless","name=cgroupns"]`, `CgroupVersion=2` and `DefaultRuntime=runc`. Compared with the baseline's `SecurityOptions`, `name=apparmor` is absent here; Docker's rootless troubleshooting page ([Troubleshoot](https://docs.docker.com/engine/security/rootless/troubleshoot/), known limitations) lists AppArmor among the features that are "not supported" in rootless mode (from the documentation).
- The check that delegation took effect, which the leg used as its gate: `docker info --format '{{.CPUCfsQuota}} {{.MemoryLimit}} {{.PidsLimit}}'` must print `true true true`. It still matters after the trial, by a reading of the Runner's code (not something the run showed): the Runner refuses a Sandbox whose create reply says the engine discarded the memory or pids limit, but a `none` cgroup driver drops the limits with no warning, so only this check catches that. The engine's half is in Docker's rootless tips page ([Tips](https://docs.docker.com/engine/security/rootless/tips/), from the documentation): without cgroup v2 and systemd, "rootless mode ignores the cgroup-related `docker run` flags", and "typically, only `memory` and `pids` controllers are delegated to non-root users by default".
- A record, not a check: the user's systemd manager's `cgroup.controllers` printed `cpuset cpu io memory pids` and `cgroup.subtree_control` printed `cpu memory pids`.
- The Runner's `/health`, asked from inside its container with the Runner token, answers 200 and lists `python`, `typescript` and `go`. It did within 3 s of `docker compose up -d`.
- A Run in each Language: the browser flow (one smoke test, Map to Topic to Chapter to Problem, then Run and Submit in Python, TypeScript and Go in turn) passed.

**What held and what did not.**

| Check | Baseline (rootful Docker) | Rootless Docker |
|---|---|---|
| No network, the internet, host-gateway and DNS probes in one test (see the gateway caveat above) | pass | pass |
| Read-only root | pass | pass |
| Not root, no capabilities, no new privileges | pass | pass |
| No engine socket inside | pass | pass |
| Memory limit | pass | pass |
| Pids limit | pass | pass |
| CPU limit | pass | pass |
| Infinite loop ended, and the wall-clock kill | pass | pass |
| Core limit and the seccomp filter | pass | pass |
| No container left behind (the test) | pass | pass |
| A Problem solved in Python, TypeScript and Go: the content check on the fixture | pass | pass |
| No container left behind (the leg's leftover checks, after the tests and after the composed Instance) | pass | pass |
| A Problem solved in Python, TypeScript and Go: the composed Instance's browser flow | pass | pass |

Totals: 145 Sandbox checks, 145 passed, 0 failed. No failed test. In the first attempt, the rows whose tests had no verdict were "Infinite loop ended, and the wall-clock kill" and "No container left behind (the test)" (their tests are in the suite that did not start); the other rows' tests passed.

## Rootless Podman

**Outcome.** The Instance did not run correctly under rootless Podman. 111 of 145 Sandbox checks failed, and the composed Instance came up (the Runner answered `/health` in 6 s) but the browser flow failed. The Runner logged `runner RunnerFailed DockerReplyError`, and the direct Sandbox tests show the engine's reply: Podman refused to create the Sandbox container with `unknown mount option "uid=65534"` (the owner option on the Sandbox's `/work` and `/exec` tmpfs mounts). It is not a Compose matter. This is not fixed here: a Runner change for Podman is the maintainer's decision, and this page proposes no change to the Sandbox's mounts, user or mode.

**Version tried.** Podman 4.9.3 (the runner image's own), crun as the OCI runtime, rootless: true, seccomp on, cgroup v2 with the systemd manager.

**What to install or set on the host.** The leg's steps, as the runner user:

1. Packages: the leg needed `uidmap` and `dbus-user-session` and found them already installed, so it installed nothing and the host-change list has no line for them. Docs: [rootless tutorial](https://github.com/containers/podman/blob/main/docs/tutorials/rootless_tutorial.md).
2. Give the user subordinate ids, as in step 2 of rootless Docker. Docs: the rootless tutorial, "/etc/subuid and /etc/subgid configuration".
3. Delegate the cgroup controllers (`Delegate=cpu cpuset io memory pids` in `/etc/systemd/system/user@.service.d/delegate.conf`) and run `sudo systemctl daemon-reload`. The script cites Docker's page for this step: [Limiting resources](https://docs.docker.com/engine/security/rootless/tips/).
4. Enable linger for the user: `sudo loginctl enable-linger <user>`.
5. Start the user's socket: `systemctl --user start podman.socket`. Docs: [socket activation](https://github.com/containers/podman/blob/main/docs/tutorials/socket_activation.md).

Ubuntu 24.04 only: the restriction on unprivileged user namespaces (the sysctl read `1`). The leg did not change it; its setup checked that Ubuntu's `podman` AppArmor profile file exists and went on. Docs the script cites: [Ubuntu's blog on restricted unprivileged user namespaces](https://ubuntu.com/blog/ubuntu-23-10-restricted-unprivileged-user-namespaces) and the [24.04 release notes](https://documentation.ubuntu.com/release-notes/24.04/). Steps 2 to 4 are for the user that runs the engine. The Podman package itself was the runner image's, so this page has no install step for it.

**What to change in `compose.yaml` or `.env`.** The Runner gets the user's Podman socket. The leg used this `compose.override.yaml`, and no `.env` change beyond naming the app image:

```yaml
services:
  runner:
    volumes:
      - /run/user/1001/podman/podman.sock:/var/run/docker.sock
```

The merged configuration had exactly one socket mount, from `/run/user/1001/podman/podman.sock`, and `web` had none.

**How to check it took effect.**

- `podman info`: it printed `rootless: true`, `ociRuntime: name: crun`, `cgroupVersion: v2`, `cgroupControllers` listing `cpu`, `memory` and `pids`.
- The check that delegation took effect, which the leg used as its gate: `podman --remote --url unix://<socket> info --format '{{json .Host.CgroupControllers}}'` must hold `cpu`, `memory` and `pids`.
- A record only: the Docker-compatible `docker info` through the socket printed `SecurityOptions=["name=apparmor","name=seccomp,profile=default","name=rootless"]` and `DefaultRuntime=crun`. The leg's script notes that Podman 4.9.3's Docker-compatible info reports `CPUCfsQuota` false on cgroup v2; this run did not print that field.
- A record, not a check: the user's systemd manager's `cgroup.controllers` printed `cpuset cpu io memory pids`.
- The Runner's `/health` answered 200 listing all three Languages. It did, 6 s after `docker compose up -d`.
- A Run in each Language: the browser flow failed. It is one smoke test that runs Python, TypeScript and Go in turn and stops at its first failure; its output names no Language. It failed at its first Run (inferred from its duration of 3.0 min), waiting 180 s for `Example Test 01` to show a pass.

**What held and what did not.**

| Check | Baseline (rootful Docker) | Rootless Podman |
|---|---|---|
| No network, the internet, host-gateway and DNS probes in one test (see the gateway caveat above) | pass | fail (1 of 1) |
| Read-only root | pass | fail (2 of 2) |
| Not root, no capabilities, no new privileges | pass | fail (1 of 1) |
| No engine socket inside | pass | fail (1 of 1) |
| Memory limit | pass | fail (2 of 2) |
| Pids limit | pass | fail (1 of 1) |
| CPU limit | pass | fail (1 of 1) |
| Infinite loop ended, and the wall-clock kill | pass | fail (2 of 2) |
| Core limit and the seccomp filter | pass | fail (6 of 6) |
| No container left behind (the test) | pass | fail (1 of 1) |
| A Problem solved in Python, TypeScript and Go: the content check on the fixture | pass | fail (all 15 fixture cases) |
| No container left behind (the leg's leftover checks, after the tests and after the composed Instance) | pass | pass |
| A Problem solved in Python, TypeScript and Go: the composed Instance's browser flow | pass | fail |

A fail here means the test failed under Podman. Where the output shows Podman's reply, it is the refusal above, so the check did not run to a verdict; the run does not show that for every one of the failed tests. The CPU ratio line was not found in the test output.

Totals: 145 Sandbox checks, 34 passed, 111 failed. The failed tests, word for word:

- `src/lib/server/runner/content-check.sandbox.test.ts > content check: Reference Code is Accepted > shared > stacks-push / python`
- `src/lib/server/runner/content-check.sandbox.test.ts > content check: Reference Code is Accepted > shared > stacks-push / typescript`
- `src/lib/server/runner/content-check.sandbox.test.ts > content check: Reference Code is Accepted > shared > stacks-push / go`
- `src/lib/server/runner/content-check.sandbox.test.ts > content check: Reference Code is Accepted > shared > stacks-peek / python`
- `src/lib/server/runner/content-check.sandbox.test.ts > content check: Reference Code is Accepted > shared > stacks-peek / typescript`
- `src/lib/server/runner/content-check.sandbox.test.ts > content check: Reference Code is Accepted > shared > stacks-peek / go`
- `src/lib/server/runner/content-check.sandbox.test.ts > content check: Reference Code is Accepted > shared > stacks-pop / python`
- `src/lib/server/runner/content-check.sandbox.test.ts > content check: Reference Code is Accepted > shared > stacks-pop / typescript`
- `src/lib/server/runner/content-check.sandbox.test.ts > content check: Reference Code is Accepted > shared > stacks-pop / go`
- `src/lib/server/runner/content-check.sandbox.test.ts > content check: Reference Code is Accepted > shared > queues-enqueue / python`
- `src/lib/server/runner/content-check.sandbox.test.ts > content check: Reference Code is Accepted > shared > queues-enqueue / typescript`
- `src/lib/server/runner/content-check.sandbox.test.ts > content check: Reference Code is Accepted > shared > queues-enqueue / go`
- `src/lib/server/runner/content-check.sandbox.test.ts > content check: Reference Code is Accepted > shared > heaps-insert / python`
- `src/lib/server/runner/content-check.sandbox.test.ts > content check: Reference Code is Accepted > shared > heaps-insert / typescript`
- `src/lib/server/runner/content-check.sandbox.test.ts > content check: Reference Code is Accepted > shared > heaps-insert / go`
- `src/lib/server/runner/escape.sandbox.test.ts > Sandbox escapes: network, filesystem, identity > cannot open a connection to the internet, the Docker host gateway or DNS`
- `src/lib/server/runner/escape.sandbox.test.ts > Sandbox escapes: network, filesystem, identity > cannot write anywhere outside /work: /, /tmp, /usr and /etc`
- `src/lib/server/runner/escape.sandbox.test.ts > Sandbox escapes: network, filesystem, identity > cannot mount a filesystem, remount the root writable or chroot`
- `src/lib/server/runner/escape.sandbox.test.ts > Sandbox escapes: network, filesystem, identity > runs as uid 65534 with no capabilities and no way to gain any`
- `src/lib/server/runner/escape.sandbox.test.ts > Sandbox escapes: network, filesystem, identity > has no Docker socket inside the container`
- `src/lib/server/runner/escape.sandbox.test.ts > Sandbox escapes: one Test to the next > cannot carry a hidden Test input to a later Test through System V IPC, shared memory or POSIX queues`
- `src/lib/server/runner/escape.sandbox.test.ts > Runner: repeated runs > answers 40 sequential runtime-error requests with a verdict each, never a 500`
- `src/lib/server/runner/escape.sandbox.test.ts > Sandbox escapes: core dumps > finds RLIMIT_CORE at (1, 1), cannot raise it, and aborts without a core`
- `src/lib/server/runner/escape.sandbox.test.ts > Sandbox escapes: core dumps > cannot lower RLIMIT_CORE, by setrlimit, prlimit64 or the prlimit tool, and still aborts without a core`
- `src/lib/server/runner/escape.sandbox.test.ts > Sandbox escapes: core dumps > reports a crashing Test as a runtime error, as any crash does`
- `src/lib/server/runner/escape.sandbox.test.ts > Sandbox escapes: tracing > refuses ptrace(PTRACE_TRACEME and PTRACE_ATTACH) with EPERM in python`
- `src/lib/server/runner/escape.sandbox.test.ts > Sandbox escapes: tracing > refuses ptrace(PTRACE_TRACEME and PTRACE_ATTACH) with EPERM in typescript`
- `src/lib/server/runner/escape.sandbox.test.ts > Sandbox escapes: tracing > refuses ptrace(PTRACE_TRACEME and PTRACE_ATTACH) with EPERM in go`
- `src/lib/server/runner/escape.sandbox.test.ts > Sandbox escapes: resource exhaustion > kills a memory hog as a runtime error, not a hang, and serves the next request`
- `src/lib/server/runner/escape.sandbox.test.ts > Sandbox escapes: resource exhaustion > cannot ask for more memory than the Runner allows`
- `src/lib/server/runner/escape.sandbox.test.ts > Sandbox escapes: resource exhaustion > stops a fork bomb at the pids limit, within the time limit, and serves the next request`
- `src/lib/server/runner/escape.sandbox.test.ts > Sandbox escapes: resource exhaustion > holds three busy processes to one CPU between them, and serves the next request`
- `src/lib/server/runner/escape.sandbox.test.ts > Sandbox escapes: resource exhaustion > ends a bomb that forks without bound within the design bound, as a verdict or a refusal`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner port contract: HTTP adapter + Runner + Docker (python) > returns one ok result per Test, in request order, with the program output`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner port contract: HTTP adapter + Runner + Docker (python) > returns no results for no Tests`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner port contract: HTTP adapter + Runner + Docker (python) > reports each Test on its own: ok, runtimeError and timeout in one request`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner port contract: HTTP adapter + Runner + Docker (python) > reports a program that outlives the time limit as timeout`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner port contract: HTTP adapter + Runner + Docker (python) > marks the Tests a stopped container left unanswered as cut off, and no others`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner port contract: HTTP adapter + Runner + Docker (python) > reports code that does not compile as a compileError message and no results`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner port contract: HTTP adapter + Runner + Docker (typescript) > returns one ok result per Test, in request order, with the program output`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner port contract: HTTP adapter + Runner + Docker (typescript) > returns no results for no Tests`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner port contract: HTTP adapter + Runner + Docker (typescript) > reports each Test on its own: ok, runtimeError and timeout in one request`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner port contract: HTTP adapter + Runner + Docker (typescript) > reports a program that outlives the time limit as timeout`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner port contract: HTTP adapter + Runner + Docker (typescript) > marks the Tests a stopped container left unanswered as cut off, and no others`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner port contract: HTTP adapter + Runner + Docker (typescript) > reports code that does not compile as a compileError message and no results`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: typescript in a fresh Sandbox per run > passes a typed program with no warnings on stderr`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: typescript in a fresh Sandbox per run > reports a wrong answer as ok output for the core to compare`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: typescript in a fresh Sandbox per run > reports a thrown error as a runtime error with the message on stderr`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: typescript in a fresh Sandbox per run > reports a type error as a compile error`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: typescript in a fresh Sandbox per run > reports an enum as a compile error, since Node cannot strip it`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: typescript in a fresh Sandbox per run > runs a Build of several files that import each other with extensions`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: typescript in a fresh Sandbox per run > names main.ts and the Learner line in a runtime error, from the emitted JavaScript`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: typescript in a fresh Sandbox per run > names the imported file and its line when the error is thrown in ./util.ts`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: typescript in a fresh Sandbox per run > restores the emitted JavaScript before every Test, so a Test cannot change the next`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: typescript in a fresh Sandbox per run > ignores a learner tsconfig.json: the Build still runs with the fixed options`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: typescript in a fresh Sandbox per run > still reports a type error as a compile error beside a tsconfig.json`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: typescript in a fresh Sandbox per run > does not let a tsconfig.json loosen the strict checks`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: typescript in a fresh Sandbox per run > keeps learner code away from the hidden inputs of other Tests`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: typescript in a fresh Sandbox per run > kills a process a Test left behind, even one that detached`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner port contract: HTTP adapter + Runner + Docker (go) > returns one ok result per Test, in request order, with the program output`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner port contract: HTTP adapter + Runner + Docker (go) > returns no results for no Tests`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner port contract: HTTP adapter + Runner + Docker (go) > reports each Test on its own: ok, runtimeError and timeout in one request`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner port contract: HTTP adapter + Runner + Docker (go) > reports a program that outlives the time limit as timeout`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner port contract: HTTP adapter + Runner + Docker (go) > marks the Tests a stopped container left unanswered as cut off, and no others`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner port contract: HTTP adapter + Runner + Docker (go) > reports code that does not compile as a compileError message and no results`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: go in a fresh Sandbox per run > passes a correct solution`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: go in a fresh Sandbox per run > reports a wrong answer as ok output for the core to compare`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: go in a fresh Sandbox per run > reports a panic as a runtime error with the message on stderr`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: go in a fresh Sandbox per run > reports a compile error with file:line:col diagnostics and no results`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: go in a fresh Sandbox per run > reports a missing func main as a compile error, from the linker`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: go in a fresh Sandbox per run > reports a package that is not main as a compile error`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: go in a fresh Sandbox per run > reports a Build that mixes packages as a compile error`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: go in a fresh Sandbox per run > reports a cgo-only file as a compile error: cgo is off`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: go in a fresh Sandbox per run > reports a Build with no .go file as a compile error without running go build`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: go in a fresh Sandbox per run > runs a Build of several files in package main`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: go in a fresh Sandbox per run > ignores a learner go.mod: it cannot pick a toolchain or ask for a dependency`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: go in a fresh Sandbox per run > reports an import it cannot fetch as a compile error: the Sandbox has no network`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: go in a fresh Sandbox per run > compiles a typical solution within the time limit, with the standard packages pre-warmed`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: go in a fresh Sandbox per run > keeps learner code away from the hidden inputs of other Tests`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: go in a fresh Sandbox per run > kills a process a Test left behind, even one that detached`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: go in a fresh Sandbox per run > wipes /exec and restores the binary before every Test: what a Test writes there is gone`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: python in a fresh Sandbox per run > returns the output of correct code`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: python in a fresh Sandbox per run > reports a runtime error with the traceback on stderr`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: python in a fresh Sandbox per run > reports a compile error with the compiler message and no results`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: python in a fresh Sandbox per run > reports a null byte in the source as a compile error`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: python in a fresh Sandbox per run > runs a Build of several files`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: python in a fresh Sandbox per run > compiles with the real py_compile even if the Build ships a file of that name`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: python in a fresh Sandbox per run > times out an infinite loop within the per-Test limit, not the request timeout`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: python in a fresh Sandbox per run > honours a lower per-Test limit`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: python in a fresh Sandbox per run > kills the container at the hard limit and times out every unfinished Test`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: python in a fresh Sandbox per run > runs learner code unprivileged, offline and on a read-only root`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: python in a fresh Sandbox per run > keeps learner code away from the harness result channel`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: python in a fresh Sandbox per run > caps stdout and marks it truncated`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: python in a fresh Sandbox per run > leaves no container behind after success, failure or timeout`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: the harness cannot be hijacked by learner code > does not let a learner-written traceback.py forge results after tests/N.in is deleted`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: the harness cannot be hijacked by learner code > is not aborted by learner code signalling PID 1`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: the harness cannot be hijacked by learner code > kills every process a Test left behind, even ones that detached`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: the harness cannot be hijacked by learner code > does not leak any Test input to learner code, not from /work/tests nor via files a Test left behind`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: the harness cannot be hijacked by learner code > survives learner code that locks /work or nests directories deeply, and carries nothing over in /work metadata`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: the harness cannot be hijacked by learner code > stops printing results and exits non-zero when something unexpected happens`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: the harness cannot be hijacked by learner code > exits on its own at the in-container deadline if the Runner is gone`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: the harness cannot be hijacked by learner code > gives Tests past the total output budget empty, truncated output but still runs them`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: container configuration > is created with AutoRemove, no IPC, no log driver and the label`
- `src/lib/server/runner/sandbox-go-image.sandbox.test.ts > Go Sandbox image > prints the pinned Go version and has a warmed, read-only cache`
- `src/lib/server/runner/sandbox-go-image.sandbox.test.ts > Go Sandbox: RLIMIT_CORE > cannot lower the core limit with syscall.Setrlimit, and the limit stays (1, 1)`
- `src/lib/server/runner/sandbox-node-image.sandbox.test.ts > TypeScript Sandbox image > prints the pinned node and tsc versions`
- `src/lib/server/runner/sandbox-node-image.sandbox.test.ts > TypeScript Sandbox: RLIMIT_CORE > cannot lower the core limit with the prlimit tool, and process.abort() leaves no core`
- `src/lib/server/runner/start.sandbox.test.ts > Runner start: image pull > pulls the missing image, reports Python ready, then serves a run`
- `src/lib/server/runner/start.sandbox.test.ts > Runner start: sweep > leaves a fresh container of another instance and removes an old one`
- `src/lib/server/runner/start.sandbox.test.ts > Runner start: sweep > removes a container labelled by a version before instance ids, however fresh`
- `src/lib/server/runner/start.sandbox.test.ts > Runner start: sweep > never removes its own instance’s containers`

## gVisor

**Outcome.** The Instance did not run correctly under gVisor. 6 of 145 Sandbox checks failed, and the composed Instance came up only on the second try (the Runner's own container on `runc`); after that the browser flow failed. None of this is fixed here: a Runner change for gVisor, or a Sandbox limit that does not hold under it, is the maintainer's decision. What the failed tests' output shows:

- Writing outside `/work`: every write to `/`, `/usr`, `/etc`, `/usr/local`, `/proc` and `/sys` was denied. The output also shows an extra writable `/tmp` that the Sandbox does not ask for: `wrote /tmp/escape` and `made /tmp/escape-dir`. The run did not test whether that `/tmp` survives from one Test to the next, how large it is, or whether files in it can be executed. Reading the Runner's harness (not run output): it wipes only `/work` (and `/exec` for Go) before each Test, so nothing in the Runner clears that `/tmp` between the Tests of one request.
- Hidden Test input: under gVisor a hidden Test input reached a later Test of the same request through System V IPC. The later Test's output held `queue 32 b'SECRET-ipc'`, `shm data b'SECRET-shm'` and `sem 1 7777`. What the later Test printed is data the earlier Test's code wrote there, chosen from its own input; so a Test can hand on anything it holds, its input included. Two bounds, each a reading of the Runner as shipped rather than something the run printed: a request uses one container, and visible and hidden Tests run in separate containers.
- Memory hog, asking for more memory than the Runner allows, the fork bomb at the pids limit, and learner code signalling PID 1: each failed with `RunnerFailed: Runner responded 500`. The test output carries `runner RunnerFailed HarnessExitError` lines (in both attempts); reading the Runner's code, that class means the Sandbox's harness exited with a non-zero status, and the Runner logs neither the status nor the harness's stderr. The Runner refused each Run with an error and answered every later request. The run does not show the cause, and does not show that a limit stopped the Sandbox or that it did not, only that the Run ended in an error. For the memory hog, the request for more memory and the fork bomb, the run cannot tell whether each is a weaker Sandbox or a test that assumes `runc`'s behaviour. For the PID 1 test, the leg recorded runsc's `signal-unkillable-policy` as `none`; runsc's description of that flag is "controls protection of PID namespace init processes from signals under Linux SIGNAL_UNKILLABLE semantics: none (default) or linux", so by default runsc does not give a namespace's init the protection from signals that Linux gives it (from runsc's flag description, not run output). The consequence stated above stands: the Runner refused that Run, and it affects only that Run.

**Version tried.** gVisor release-20261116.0 (`runsc version release-20261116.0`, spec 1.2.1), under Docker Engine 28.0.4, with `runsc` as Docker's default runtime.

**What to install or set on the host.** The leg's steps:

1. Download `gvisor-x86_64.tar.bz2` of release-20261116.0 from `https://github.com/gvisor/gvisor/releases/download/release-20261116.0/gvisor-x86_64.tar.bz2`, and check its sha256 `e22638939473759a8602e80f2b96a9b67e4afcdf58f2c51db52b1a8e9031ea45` (from the release's SHA256SUMS).
2. Extract it into `/usr/local/bin`: `sudo tar -xjf gvisor-x86_64.tar.bz2 -C /usr/local/bin`. It holds `runsc`, `containerd-shim-runsc-v1` and `gvisor-bin/`.
3. Register the runtime with Docker: `sudo /usr/local/bin/runsc install`.
4. Make `runsc` Docker's default runtime: set `"default-runtime": "runsc"` in `/etc/docker/daemon.json`.
5. Restart Docker: `sudo systemctl restart docker`.

The script cites gVisor's installation guide ("Install latest release") and the Docker Quick Start by name, with no link. This engine needs no rootless setup, so there are no steps for linger or delegation, and none for the Ubuntu restriction on user namespaces. The Runner gets the host's rootful Docker socket, `/var/run/docker.sock`, so that socket is root on the host.

**What to change in `compose.yaml` or `.env`.** Two tries were made.

- Try 1, no override. The Runner's own container ran under `runsc` and listened, but every engine call it made failed: its start-up sweep logged `Could not clean up leftover Sandbox containers: Error`, its image check logged `Could not pull Sandbox image ...: Error` for all three images, and no "Pulling Sandbox image" line appears. It was not ready in 5 minutes. The leg's own record shows runsc's `host-uds` setting as `none`. gVisor's documentation ([observability](https://gvisor.dev/docs/user_guide/observability/), the page the script cites) shows `--host-uds=all` on a separate runtime entry in `/etc/docker/daemon.json`, used only by the container that needs host sockets; on the runtime the Sandboxes use it would apply to every Sandbox. The same page warns that doing this "does not provide you the full security of gVisor". The trial set it on no runtime, so the run does not show that this is the cause.
- Try 2, `runtime: runc` on the `runner` service only, so the Runner's own container runs on `runc` and every Sandbox runs on `runsc`. The Runner was ready in 5 s. This is the try that came up. It leaves the Runner's own container exactly where the stock engine has it: gVisor then stands between Sandboxes and the host, never between the Runner (which holds the engine socket) and the host. No Sandbox ran in the composed Instance under gVisor, since `web` got no answer from the Runner.

```yaml
services:
  runner:
    runtime: runc
```

The merged configuration had one socket mount, `/var/run/docker.sock`, on `runner` and none on `web`. In try 2, `web`, under `runsc`, got no answer from the Runner (`runner RunnerUnreachable`: refused, unknown host, reset or its 30 s timeout; the log does not say which), and the Runner logged no refusal or failure. gVisor's FAQ ("DNS doesn't work on a Docker user defined bridge network, including Docker Compose") describes a limit that would cause this; that is a likely cause the run does not prove.

**How to check it took effect.**

- `runsc --version` printed `runsc version release-20261116.0`.
- `docker info` printed `DefaultRuntime=runsc`, and `docker version` lists `runsc: Version: release-20261116.0`.
- `docker run --rm --network none --memory 256m --memory-swap 256m <a Sandbox image> dmesg`, the leg's own check: its output names gVisor (the leg's check passed).
- A record of runsc's flags as Docker reports them, for the default runtime: `oci-seccomp` `false`, `platform` `systrap`, `overlay2` `root:self`, `network` `sandbox`, `file-access` `exclusive`, `host-uds` `none`; and the runtime's features list AppArmor as not enabled. `signal-unkillable-policy` `none`. Reading these: runsc describes `oci-seccomp` as "Enables loading OCI seccomp filters inside the sandbox." with default false, so Docker's default seccomp profile is not applied to Sandboxes under gVisor (from runsc's flag description plus the recorded value). The harness's own seccomp filter is: the tracing and core-dump tests passed.
- The Runner's `/health` answered 200 listing all three Languages, in try 2 only.
- A Run in each Language: the browser flow failed, at its first Run (inferred from its duration of 3.0 min, waiting 180 s for `Example Test 01` to show a pass). It is one smoke test and its output names no Language. It failed on the second try only, since the first try never had a ready Runner.

**What held and what did not.**

| Check | Baseline (rootful Docker) | gVisor |
|---|---|---|
| No network, the internet, host-gateway and DNS probes in one test (see the gateway caveat above) | pass | pass |
| Read-only root | pass | 1 of 2 failed: every probed path outside `/work` (seven are probed) was denied except `/tmp`, which was writable |
| Not root, no capabilities, no new privileges | pass | pass |
| No engine socket inside | pass | pass |
| Memory limit | pass | 2 of 2 failed: the Runner answered 500 (the run shows neither that the limit stopped it nor that it did not) |
| Pids limit | pass | 1 of 1 failed: the Runner answered 500 (the run shows neither that the limit stopped it nor that it did not) |
| CPU limit | pass | pass |
| Infinite loop ended, and the wall-clock kill | pass | pass |
| Core limit and the seccomp filter | pass | pass |
| No container left behind (the test) | pass | pass |
| A Problem solved in Python, TypeScript and Go: the content check on the fixture | pass | pass |
| No container left behind (the leg's leftover checks, after the tests and after the composed Instance) | pass | pass |
| A Problem solved in Python, TypeScript and Go: the composed Instance's browser flow | pass | fail |

Two failed tests belong to no row above: the hidden Test input carried through IPC (an isolation check, described in the outcome), and `is not aborted by learner code signalling PID 1`. The CPU limit held: `three busy processes used 0.71 CPU in all`.

Totals: 145 Sandbox checks, 139 passed, 6 failed. The failed tests, word for word:

- `src/lib/server/runner/escape.sandbox.test.ts > Sandbox escapes: network, filesystem, identity > cannot write anywhere outside /work: /, /tmp, /usr and /etc`
- `src/lib/server/runner/escape.sandbox.test.ts > Sandbox escapes: one Test to the next > cannot carry a hidden Test input to a later Test through System V IPC, shared memory or POSIX queues`
- `src/lib/server/runner/escape.sandbox.test.ts > Sandbox escapes: resource exhaustion > kills a memory hog as a runtime error, not a hang, and serves the next request`
- `src/lib/server/runner/escape.sandbox.test.ts > Sandbox escapes: resource exhaustion > cannot ask for more memory than the Runner allows`
- `src/lib/server/runner/escape.sandbox.test.ts > Sandbox escapes: resource exhaustion > stops a fork bomb at the pids limit, within the time limit, and serves the next request`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: the harness cannot be hijacked by learner code > is not aborted by learner code signalling PID 1`

## What this page does not say

It recommends no engine over another. No result here is a promise for another host: each engine was tried in one run, in two attempts, on GitHub-hosted runners, and rootless Docker's first attempt failed where its second did not. The page proposes no change to a Sandbox limit, flag, mount or image.
