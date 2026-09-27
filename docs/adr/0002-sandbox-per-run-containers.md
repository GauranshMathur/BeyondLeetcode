# Learner code runs in a fresh unprivileged container per run, started by a separate Runner

Every Run and Submission starts a new container from the official `python`, `node` or `golang` image with `--network none`, a read-only root plus tmpfs, a non-root user, `--cap-drop ALL`, `no-new-privileges`, memory/CPU/pids limits and a wall-clock timeout, removed afterwards. Only the Runner process holds the container engine's socket; the web process never touches it, because socket access is root on the host.

## Considered Options

- **Judge0 / Piston:** rejected. Both need privileged containers, are amd64-only (we ship arm64 too) and lag behind current language runtimes.
- **One long-lived sandbox per Learner:** rejected. State leaks between runs and a compromise persists.

## Consequences

Operators can harden further with rootless Docker/Podman or gVisor without code changes. Container start-up time is paid on every run; k6 tests watch runner throughput. A Kubernetes backend can replace the Runner's engine later behind the same seam.
