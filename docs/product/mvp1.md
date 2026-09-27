# MVP1: product and stack decisions

Settled with the maintainer on 2026-09-27. Treat each line as decided: build to it, and raise a change as a question to the maintainer rather than working around it. ADRs in `docs/adr/` record the reasoning once Sprint 1 writes them.

## Product

**Shape.** A topic map of DSA topics. Each topic holds several chapters; each chapter is a reading about a real system and the data structure decision it made, followed by that chapter's problems, solved in the browser.

**Progress.**
- Topics hard-lock in order, NeetCode-style. A topic is done when every chapter is read and every *core* problem is solved; *extra* problems are optional.
- Inside an unlocked topic nothing locks: any chapter or problem can be opened in any order.
- The Map is the progress view. There is no separate Progress page.

**Problems.**
- Languages: Python, TypeScript, Go.
- Hints reveal one at a time.
- The solution unlocks after the problem is solved, or after N failed submissions.
- An accepted submission shows an Accepted panel; when it completes the topic, the panel says so and names the topic it unlocks.
- Every problem and chapter has a prefilled "report an issue" link that opens a GitHub issue.

**Instance modes.**
- **Local:** single user, no login. The nav shows "Local" instead of a username.
- **Multi-user:** local accounts, plus optional GitHub and Google sign-in. Registration is open or invite-only (admin toggle); invite-only uses an Accept invite page. There is no email reset: the admin resets passwords from the Users page. A first-run setup screen creates the admin.
- Instance settings beyond the registration toggle live in config, not UI, for MVP1.

**Devices.** Desktop first. Mobile must work, including writing and submitting code. Mobile boards exist for Problem, Map, Topic, Chapter and Sign in.

**Out of MVP1.** Leaderboard, Progress page, Readings list (Map → Topic is the only path), paid anything. The landing page becomes the project site later, outside the app.

**Content.** New topics, chapters and problems arrive as GitHub issues, then PRs, under `docs/content-standards.md`.

## Stack

| Concern | Choice |
|---|---|
| Language | TypeScript |
| Runtime + package manager | Bun |
| Web framework | SvelteKit |
| Database | SQLite through Prisma 7 with `@prisma/adapter-libsql` (Bun lacks the native driver `better-sqlite3` needs; Prisma 7 requires a driver adapter). Prisma stays for its migrations. |
| Auth | Better Auth |
| Editor | CodeMirror 6 |
| Lint + format | Biome |
| Tests | Vitest (unit), Playwright (e2e), k6 (load: on demand + nightly) |

## Code runner

Each run starts a fresh, unprivileged container from the official `python`, `node` or `golang` image and removes it when done:

`--network none`, `--read-only` root with a tmpfs work dir, non-root user, `--cap-drop ALL`, `--security-opt no-new-privileges`, memory / CPU / pids limits, a wall-clock timeout, `--rm`.

- A separate **runner** process owns the Docker socket and starts these containers. The **web** process never touches the socket.
- Optional hardening for operators: rootless Docker or Podman, gVisor (`runsc`). A Kubernetes backend comes later.
- Rejected: Judge0 and Piston (amd64-only, need privileged mode, old runtimes).

## Shipping

- One image, `ghcr.io/gauranshmathur/beyondleetcode`, with a `web` role, a `runner` role, and an `init` command that writes `compose.yaml` and `.env` for the operator.
- `docker compose up` runs everything. SQLite lives on a volume. Only the runner mounts the Docker socket. Content is bundled in the image.
- Builds for amd64 and arm64.
- Releases via release-please. GHCR tags: `vX.Y.Z` and `latest` on release, `edge` on every push to `main`.
- CI on every PR: typecheck, Biome, Vitest, build, Playwright, and a Docker build without push.
