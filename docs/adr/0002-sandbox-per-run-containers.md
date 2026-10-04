# Learner code runs in a fresh unprivileged container per run, started by a separate Runner

Every Run and Submission starts a new container from the official `python`, `node` or `golang` image with `--network none`, a read-only root plus tmpfs, a non-root user, `--cap-drop ALL`, `no-new-privileges`, memory/CPU/pids limits and a wall-clock timeout, removed afterwards. Only the Runner process holds the container engine's socket; the web process never touches it, because socket access is root on the host.

## Considered Options

- **Judge0 / Piston:** rejected. Both need privileged containers, are amd64-only (we ship arm64 too) and lag behind current language runtimes.
- **One long-lived sandbox per Learner:** rejected. State leaks between runs and a compromise persists.

## Consequences

Operators can harden further with rootless Docker/Podman or gVisor without code changes. Container start-up time is paid on every run; k6 tests watch runner throughput. A Kubernetes backend can replace the Runner's engine later behind the same seam.

## Amended 2026-10-04

Sandbox images are the stock `python` image for Python, and our own images for TypeScript and Go. Each of ours is `python:3.13-slim` plus the language toolchain, so the one Python harness runs in every image and branches only at compile and run. Images are pinned by tag, and the tag is bumped by hand.

Go compiles to a native binary, and `/work` is `noexec`. So a Go container has one extra tmpfs, `/exec` (`rw,exec,nosuid,nodev`, 64m, uid/gid 65534, mode 0700), and every other flag is the same. The harness builds into `/exec`, keeps the binary in memory, and before each Test wipes `/exec` and restores the binary from memory, as it does `/work`, so nothing a Test writes there survives into the next. Python and TypeScript keep only `/work`. The Go build cache is a read-only, pre-warmed copy in the image, linked into `/work` at run time; Go never touches the network or fetches a toolchain.
