# Hardening the Sandboxes: rootless Docker, rootless Podman and gVisor

## What this is

By default every Sandbox runs under rootful Docker, with the flags in [ADR 0002](adr/0002-sandbox-per-run-containers.md). Each of the three engines below was tried once, on a GitHub-hosted runner, with the Sandbox tests and the composed Instance, and not on any other host. Rootful Podman was not tried, because its socket is root on the host, as rootful Docker's is. A Kubernetes backend is not covered: `docs/product/mvp1.md` says it comes later.

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

The failed legs were re-run once, as the card allows, and both attempts are written here:

- Rootless Docker, first attempt: red. The suite `http-adapter.sandbox.test.ts` failed to start with `DeadlineError: Docker POST /containers/create timed out`, so its 76 checks were skipped (146 reported, 69 passed, 1 failed suite, 76 skipped). The composed Instance and the browser flow passed. Second attempt: green, below. The run does not show why the first attempt timed out.
- Podman and gVisor: the same totals in both attempts (34 of 145 and 139 of 145 passed).

The tables and totals below are from the second attempt. One caveat applies to every leg: the escape test that probes the Docker host gateway reads the bridge network's gateway and falls back to `172.17.0.1` when it cannot. The summaries do not record which address it used, so on the rootless legs its pass is not proven to be a probe of the host's address.

## Rootless Docker

**Outcome.** The Instance ran under rootless Docker with all 145 Sandbox checks passing and the composed Instance's browser flow passing, on the second attempt. The first attempt failed at the start of one suite (see above); that is not explained by the run.

**Version tried.** Docker Engine 28.0.4 (rootlesskit 2.3.4, slirp4netns 1.2.1), the same version as the runner image's own docker-ce.

**What to install or set on the host.** These are the steps the leg took, in order, as the runner user:

1. Install `uidmap`, `dbus-user-session` and `slirp4netns` from the Ubuntu 24.04 archive if missing (the runner already had them). Docs: [Rootless mode, prerequisites](https://docs.docker.com/engine/security/rootless/).
2. Give the user subordinate ids: `sudo usermod --add-subuids 231072-296607 --add-subgids 231072-296607 <user>`, when `/etc/subuid` and `/etc/subgid` have no line for the user. Docs: the same page.
3. Delegate the cgroup controllers to user sessions, so the Sandbox's CPU, memory and pids limits can be set. Write `/etc/systemd/system/user@.service.d/delegate.conf` with `[Service]` and `Delegate=cpu cpuset io memory pids`, then run `sudo systemctl daemon-reload`. Docs: [Limiting resources](https://docs.docker.com/engine/security/rootless/tips/).
4. Enable linger for the user, so the user's engine outlives the login: `sudo loginctl enable-linger <user>`. Steps 2 to 4 concern the user that runs the engine.
5. Install `docker-ce-rootless-extras` at the same version as Docker (here `docker-ce-rootless-extras_28.0.4-1~ubuntu.24.04~noble_amd64.deb`, from Docker's `noble` stable pool, checked against its sha256 `2abb177d60561ac77b50a42b60500ab194b70f40f4b225d837c1fdccaaab7a28`), with `sudo dpkg -i`. Docs: [Rootless mode](https://docs.docker.com/engine/security/rootless/).
6. As the user, run `dockerd-rootless-setuptool.sh install --force`. The `--force` was used because the runner's rootful daemon stayed running; a host without one would not need it. Docs: the same page.
7. Put the images in the engine. The rootless engine has its own image store, so the leg copied the Sandbox images and the app image into it with `docker load`; an operator's host would pull them instead (the run did not test that).

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

- `docker info` with `DOCKER_HOST` set to the user's socket. Worked when `SecurityOptions` includes `name=rootless`: `SecurityOptions=["name=seccomp,profile=builtin","name=rootless","name=cgroupns"]`, with `CgroupVersion=2` and `DefaultRuntime=runc`.
- The user's systemd manager lists the controllers, which worked when `cgroup.controllers` includes `cpu memory pids` (it printed `cpuset cpu io memory pids`).
- The Runner's `/health`, asked from inside its container with the Runner token, answers 200 and lists `python`, `typescript` and `go`. It did within 3 s of `docker compose up -d`.
- A Run in each Language: the browser flow (one smoke test, Map to Topic to Chapter to Problem, then Run and Submit in Python, TypeScript and Go in turn) passed.

**What held and what did not.**

| Check | Baseline (rootful Docker) | Rootless Docker |
|---|---|---|
| No network | pass | pass |
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

Totals: 145 Sandbox checks, 145 passed, 0 failed. No failed test.

## Rootless Podman

**Outcome.** The Instance did not run correctly under rootless Podman. 111 of 145 Sandbox checks failed, and the composed Instance came up (the Runner answered `/health` in 6 s) but the browser flow failed. The Runner logged `runner RunnerFailed DockerReplyError`, and the direct Sandbox tests show the engine's reply: Podman refused to create the Sandbox container with `unknown mount option "uid=65534"` (the owner option on the Sandbox's `/work` and `/exec` tmpfs mounts). It is not a Compose matter. This is not fixed here: a Runner change for Podman is the maintainer's decision.

**Version tried.** Podman 4.9.3 (the runner image's own), crun as the OCI runtime, rootless: true, seccomp on, cgroup v2 with the systemd manager.

**What to install or set on the host.** The leg's steps, as the runner user:

1. Install `uidmap` and `dbus-user-session` from the Ubuntu 24.04 archive if missing (the runner already had them). Docs: [rootless tutorial](https://github.com/containers/podman/blob/main/docs/tutorials/rootless_tutorial.md).
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
- The Docker-compatible `docker info` through the socket printed `SecurityOptions=["name=apparmor","name=seccomp,profile=default","name=rootless"]`, `DefaultRuntime=crun` (a record only; it also reported CPUCfsQuota false, whatever the delegation).
- The Runner's `/health` answered 200 listing all three Languages. It did, 6 s after `docker compose up -d`.
- A Run in each Language: the browser flow failed. It is one smoke test that runs Python, TypeScript and Go in turn and stops at its first failure; its output names no Language. It failed at its first Run (inferred from its duration of 3.0 min), waiting 180 s for `Example Test 01` to show a pass.

**What held and what did not.**

| Check | Baseline (rootful Docker) | Rootless Podman |
|---|---|---|
| No network | pass | fail (1 of 1) |
| Read-only root | pass | fail (2 of 2) |
| Not root, no capabilities, no new privileges | pass | fail (1 of 1) |
| No engine socket inside | pass | fail (1 of 1) |
| Memory limit | pass | fail (2 of 2) |
| Pids limit | pass | fail (1 of 1) |
| CPU limit | pass | fail (1 of 1) |
| Infinite loop ended, and the wall-clock kill | pass | fail (2 of 2) |
| Core limit and the seccomp filter | pass | fail (6 of 6) |
| No container left behind (the test) | pass | fail (1 of 1) |
| A Problem solved in Python, TypeScript and Go: the content check on the fixture | pass | fail (15 of 43) |
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

**Outcome.** The Instance did not run correctly under gVisor. 6 of 145 Sandbox checks failed, and the composed Instance came up only on the second try (the Runner's own container on `runc`), after which the browser flow failed. None of this is fixed here: a Runner change for gVisor, or a Sandbox limit that does not hold under it, is the maintainer's decision. The run cannot tell, for each of the six failed Sandbox checks, whether it is a weaker Sandbox or a test that assumes `runc`'s behaviour. The first two (writing outside `/work`; a hidden Test input carried to a later Test through System V IPC, shared memory or POSIX queues) are isolation checks.

**Version tried.** gVisor release-20261116.0 (`runsc version release-20261116.0`, spec 1.2.1), under Docker Engine 28.0.4, with `runsc` as Docker's default runtime.

**What to install or set on the host.** The leg's steps:

1. Download `gvisor-x86_64.tar.bz2` of release-20261116.0 from `https://github.com/gvisor/gvisor/releases/download/release-20261116.0/gvisor-x86_64.tar.bz2`, and check its sha256 `e22638939473759a8602e80f2b96a9b67e4afcdf58f2c51db52b1a8e9031ea45` (from the release's SHA256SUMS).
2. Extract it into `/usr/local/bin`: `sudo tar -xjf gvisor-x86_64.tar.bz2 -C /usr/local/bin`. It holds `runsc`, `containerd-shim-runsc-v1` and `gvisor-bin/`.
3. Register the runtime with Docker: `sudo /usr/local/bin/runsc install`.
4. Make `runsc` Docker's default runtime: set `"default-runtime": "runsc"` in `/etc/docker/daemon.json`.
5. Restart Docker: `sudo systemctl restart docker`.

The script cites gVisor's installation guide ("Install latest release") and the Docker Quick Start by name, with no link. This engine needs no rootless setup, so there are no steps for linger or delegation, and none for the Ubuntu restriction on user namespaces. The Runner gets the host's rootful Docker socket, `/var/run/docker.sock`, so that socket is root on the host.

**What to change in `compose.yaml` or `.env`.** Two tries were made.

- Try 1, no override. The Runner's own container ran under `runsc` and listened, but every engine call it made failed: its start-up sweep logged `Could not clean up leftover Sandbox containers: Error`, its image check logged `Could not pull Sandbox image ...: Error` for all three images, and no "Pulling Sandbox image" line appears. It was not ready in 5 minutes. The run does not say why the calls failed.
- Try 2, `runtime: runc` on the `runner` service only, so the Runner's own container runs on `runc` and every Sandbox runs on `runsc`. The Runner was ready in 5 s. This is the try that came up:

```yaml
services:
  runner:
    runtime: runc
```

The merged configuration had one socket mount, `/var/run/docker.sock`, on `runner` and none on `web`. In try 2, `web`, under `runsc`, got no answer from the Runner (`runner RunnerUnreachable`: refused, unknown host, reset or its 30 s timeout; the log does not say which), and the Runner logged no refusal or failure. gVisor's FAQ ("DNS doesn't work on a Docker user defined bridge network, including Docker Compose") describes a limit that would cause this; that is a likely cause the run does not prove.

**How to check it took effect.**

- `runsc --version` printed `runsc version release-20261116.0`.
- `docker info` with `DefaultRuntime=runsc` printed, and the Docker version output lists `runsc: Version: release-20261116.0`.
- The Runner's `/health` answered 200 listing all three Languages, in try 2 only.
- A Run in each Language: the browser flow failed, at its first Run (inferred from its duration of 3.0 min, waiting 180 s for `Example Test 01` to show a pass). It is one smoke test and its output names no Language.

**What held and what did not.**

| Check | Baseline (rootful Docker) | gVisor |
|---|---|---|
| No network | pass | pass |
| Read-only root | pass | fail (1 of 2) |
| Not root, no capabilities, no new privileges | pass | pass |
| No engine socket inside | pass | pass |
| Memory limit | pass | fail (2 of 2) |
| Pids limit | pass | fail (1 of 1) |
| CPU limit | pass | pass |
| Infinite loop ended, and the wall-clock kill | pass | pass |
| Core limit and the seccomp filter | pass | pass |
| No container left behind (the test) | pass | pass |
| A Problem solved in Python, TypeScript and Go: the content check on the fixture | pass | pass |
| No container left behind (the leg's leftover checks, after the tests and after the composed Instance) | pass | pass |
| A Problem solved in Python, TypeScript and Go: the composed Instance's browser flow | pass | fail |

Two failed tests belong to no row above: the hidden Test input carried through IPC (an isolation check), and `is not aborted by learner code signalling PID 1`. The CPU limit held: `three busy processes used 0.71 CPU in all`.

Totals: 145 Sandbox checks, 139 passed, 6 failed. The failed tests, word for word:

- `src/lib/server/runner/escape.sandbox.test.ts > Sandbox escapes: network, filesystem, identity > cannot write anywhere outside /work: /, /tmp, /usr and /etc`
- `src/lib/server/runner/escape.sandbox.test.ts > Sandbox escapes: one Test to the next > cannot carry a hidden Test input to a later Test through System V IPC, shared memory or POSIX queues`
- `src/lib/server/runner/escape.sandbox.test.ts > Sandbox escapes: resource exhaustion > kills a memory hog as a runtime error, not a hang, and serves the next request`
- `src/lib/server/runner/escape.sandbox.test.ts > Sandbox escapes: resource exhaustion > cannot ask for more memory than the Runner allows`
- `src/lib/server/runner/escape.sandbox.test.ts > Sandbox escapes: resource exhaustion > stops a fork bomb at the pids limit, within the time limit, and serves the next request`
- `src/lib/server/runner/http-adapter.sandbox.test.ts > Runner: the harness cannot be hijacked by learner code > is not aborted by learner code signalling PID 1`

## What this page does not say

It recommends no engine over another. No result here is a promise for another host: each engine was tried once, on GitHub-hosted runners, and rootless Docker's first attempt failed where its second did not. The page proposes no change to a Sandbox limit, flag, mount or image.
