# Self-hosting BeyondLeetcode

Operator details for running an Instance: install, moving to Multi-user, sign-in providers, the Runner, dev mode, upgrading and recovery. For a first run, start with the [quick start](../README.md#quick-start).

## Install (Local Mode)

You need Docker with Compose. `init` writes `compose.yaml` and `.env` into the folder you mount; `--origin` is the URL you will open the app at.

```sh
mkdir beyondleetcode && cd beyondleetcode
docker run --rm -v "$PWD":/out ghcr.io/gauranshmathur/beyondleetcode init --origin http://localhost:3000
docker compose up -d
```

Open the `--origin` URL. **Open Setup straight after the first start:** on a fresh Instance the first visitor to Setup chooses the mode. Choose Local for one Learner and no sign-in.

- **Local Mode has no login.** Anyone who can reach the Instance can read its progress, reset it, or switch it to Multi-user and become the admin. Keep it on your own machine or a trusted network. A web page in a browser on your LAN can also reach it through DNS rebinding, so do not run a Local Instance on a network where you open untrusted pages.
- **The first start pulls three Sandbox images, and each Language waits for its own.** The Runner asks the Docker daemon on your host (not the container) to pull the Python, TypeScript and Go images, so the host needs a route to Docker Hub and `ghcr.io`. Until a Language's image has arrived, a Run or Submit in that Language fails with "The runner is unavailable. Try again." Watch `docker compose logs -f runner`: it logs `Pulling Sandbox image ...` and then `Runner ready for <language>` as each one finishes. A failed pull is logged and retried, with a longer wait each time up to 30 s, until it works. See [Runner troubleshooting](#runner-troubleshooting).
- **Reach the Instance only by its `ORIGIN`.** A request to any other host name or address gets a 403 on every form. If you set `--origin http://localhost:3000`, open `http://localhost:3000`, not `http://127.0.0.1:3000`.
- **Run exactly one web process per data volume.** The Instance mode and the Registration Mode are read once at start and cached in each process (see below).
- Stop with `docker compose down`. Add `-v` only if you want to delete the database volume too.

## Go from Local to Multi-user

Multi-user Mode gives each person an Account that keeps its own progress. Switching keeps your Local progress: it becomes the first admin's, and nothing moves. The switch cannot be undone.

1. **Check `.env`** against "Before you turn on Multi-user" below: `BETTER_AUTH_SECRET` and `ORIGIN` must be set. An `.env` written by a recent `init` already has both. Back up the data volume first if the Instance holds progress you care about.
2. **Open Settings and press "Switch to Multi-user".** If the button leads to a message about a missing secret or `ORIGIN`, fix `.env`, run `docker compose up -d`, and try again.
3. **Fill in the admin's name, email and password.** That Account becomes the admin and is signed in at once. The password is 12 to 128 characters.
4. **Restart every web process.** Normally that is just `docker compose up -d` after any change. A second web process on the same volume keeps its cached Local mode and serves the admin's Learner to anonymous visitors, with read, write and Reset progress, until it restarts. Do not run one.
5. **Choose who can sign up** on the Users page (admin only): *Invite only* (the default) or *Open*. To add a person, press "Invite a user" and send them the link. An Invite works once, for one new Account, for 7 days. The link is shown once; cancel and make a new one if it is lost.

On a fresh Instance, choosing Multi-user at Setup does the same as steps 2 and 3, with no progress to carry over.

Day to day, the admin can also reset another user's password on the Users page (it sets a one-time password the person must change at their next sign-in) and remove an Account. Removing an Account deletes that person's progress with it.

### Sign in with GitHub or Google (optional)

A provider is enabled only when **both** of its variables are set in `.env`; one alone leaves it off. Then run `docker compose up -d` to recreate `web`.

| Provider | Variables | Callback URL to register with the provider |
|---|---|---|
| GitHub | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | `<ORIGIN>/api/auth/callback/github` |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `<ORIGIN>/api/auth/callback/google` |

For example, with `ORIGIN=https://learn.example.com` the GitHub callback is `https://learn.example.com/api/auth/callback/github`. The sign-in page then shows the provider's button. Signing in through a provider follows the Registration Mode like any other sign-up: with Invite only, a new person needs an Invite link first. Running `bun run dev` from a checkout, the provider variables take effect only from the process environment, not from `.env`.

### Forgot the admin's password

Shell access to the server is the proof. From the folder with `compose.yaml`:

```sh
docker compose exec web docker-entrypoint.sh reset-admin-password
```

It prints a one-time password once and signs the admin out everywhere. Sign in with it and you are asked to choose a new one. It needs an Account whose role is admin. With none it changes nothing and says so, even if other Accounts exist. If there are no Accounts at all on a Multi-user Instance, it clears the stored mode instead and asks you to restart `web` and open Setup. If an admin exists but the Instance has lost its stored mode, it stores Multi-user again before it resets the password; restart `web` afterwards, as it asks. **Never run it while someone is setting up or switching to Multi-user:** it can undo their step.

## Before you turn on Multi-user

These settings go in the `.env` next to `compose.yaml`.

- **`BETTER_AUTH_SECRET` is required.** It signs sessions. Use at least 32 characters, and not the example value from `.env.example`. `init` writes a random one for you. `openssl rand -hex 24` makes another.
- **`ORIGIN` is required.** It is the public URL of your Instance, for example `https://learn.example.com`. Setup does not offer Multi-user without it, and a Multi-user Instance will not start without it. `PROTOCOL_HEADER` and `HOST_HEADER` do not replace it.
- **Behind a reverse proxy, set `ORIGIN` plus `ADDRESS_HEADER` and `XFF_DEPTH`.** `ADDRESS_HEADER` is the header your proxy fills in with the client's address, such as `X-Forwarded-For`. `XFF_DEPTH` is how many trusted proxies sit in front of the app, as the [SvelteKit `adapter-node` docs](https://svelte.dev/docs/kit/adapter-node#Environment-variables-ADDRESS_HEADER-and-XFF_DEPTH) describe. Without them every client looks like the proxy, and they all share one sign-in rate limit.
- **If you set those headers, only the proxy may reach the app's port.** A client that goes round the proxy can forge the header, so it gets a fresh sign-in limit on every request, or locks out someone else by naming their address. Docker [publishes a port on every interface](https://docs.docker.com/engine/network/port-publishing/) and [gets past ufw](https://docs.docker.com/engine/network/packet-filtering-firewalls/). So change the `ports` line in `compose.yaml` to `"127.0.0.1:${PORT}:3000"` if the proxy runs on the same machine, or keep the app on the proxy's Docker network only. Use Docker 28.0.0 or later: older releases let hosts on the same network segment reach a port published to `127.0.0.1`. If clients connect straight to the app, set neither header and leave the port binding alone.
- **Open Setup straight after the first start.** On a fresh Instance the first visitor to Setup chooses the mode. Whoever chooses Multi-user first creates the admin Account and becomes the admin.
- **Use https if the Instance is reachable beyond your own machine.** Over plain http, passwords and session cookies cross the network unencrypted.
- **If an older `init` wrote your `compose.yaml`,** edit `web`'s `environment` and then run `docker compose up -d`. Replace `ORIGIN: ${ORIGIN:-}` with a bare `ORIGIN:` line: the old line passes an empty `ORIGIN` when `.env` has none, and [an empty `ORIGIN` stops the server](https://github.com/sveltejs/kit/blob/fef182780ecfc5eecd1c12e03afb99af9d1f7049/packages/adapter-node/utils.js#L26-L35). Behind a proxy, add `ADDRESS_HEADER: ${ADDRESS_HEADER:-}` and `XFF_DEPTH: ${XFF_DEPTH:-1}` too. Without them the headers you set in `.env` never reach the app.
- **Never set** `BETTER_AUTH_SECRETS`, `BETTER_AUTH_URL`, `PUBLIC_BETTER_AUTH_URL`, `BASE_URL`, `BETTER_AUTH_TRUSTED_ORIGINS`, `BETTER_AUTH_TELEMETRY` or `BETTER_AUTH_TELEMETRY_ENDPOINT`. Better Auth, the sign-in library, reads each from the environment on its own. [`BETTER_AUTH_SECRETS`](https://github.com/better-auth/better-auth/blob/db02f233918ad1233bf0753e437e1c0da353273d/packages/better-auth/src/context/create-context.ts#L174) replaces the session secret. [`BETTER_AUTH_TRUSTED_ORIGINS`](https://github.com/better-auth/better-auth/blob/db02f233918ad1233bf0753e437e1c0da353273d/packages/better-auth/src/context/helpers.ts#L155) adds origins it accepts. The app refuses to start while either is set. [The URL variables](https://github.com/better-auth/better-auth/blob/db02f233918ad1233bf0753e437e1c0da353273d/packages/better-auth/src/utils/url.ts#L153-L160) name another base URL, and [the telemetry pair](https://github.com/better-auth/better-auth/blob/db02f233918ad1233bf0753e437e1c0da353273d/packages/telemetry/src/index.ts#L26) sends Better Auth's telemetry to the endpoint you give. Keep those five unset too.

- **Run exactly one web process per data volume.** The Instance mode and the Registration Mode are cached in each process when it starts. A second process (`docker compose up --scale web=2`, or a dev server pointed at the production database) keeps the mode it read at start, and can stay Open after the admin closes sign-up. After a switch from Local to Multi-user, a second process still running keeps its cached Local mode and serves the admin's Learner to anonymous visitors until it restarts. Restart every web process after switching.
- **Behind a reverse proxy, set its read timeout to at least about 100 s.** One Submit makes up to three Runner calls of up to 30 s each, so it can take 90 s before the web process answers. [nginx's `proxy_read_timeout`](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_read_timeout) defaults to 60 s, so a slow Submit gets a 504 while the web process still finishes and records it. In nginx, set `proxy_read_timeout 120s;` in the `location` that proxies to the app. Any reverse proxy with a shorter read timeout needs the same change.
- **Open registration has a small budget, and emails are not verified.** With registration Open, one address can create 20 Accounts per 10 minutes, and one client can spend that budget for everyone behind the same NAT, LAN `/64` or proxy (when `ADDRESS_HEADER` is not set). Emails are never verified, so anyone can sign up with someone else's email address. Use Invite only if that matters.
- **A crash in a Learner's code costs the Runner host two kernel log lines.** If the host's `core_pattern` is a pipe (Ubuntu's apport is one), each crash that would dump (`os.abort()`, a fatal signal, or a Go crash with `GOTRACEBACK=crash`; a default Go panic exits with status 2 and dumps nothing) logs "has RLIMIT_CORE set to 1" and "Aborting core". They are not rate-limited, and the process name in them is one the Learner chooses. The Runner holds every Sandbox's core limit at 1 byte, so no core file is written and the helper does not run. To make it silent, give the Runner host a non-pipe pattern that lasts: disable apport (`systemctl disable --now apport`, since its service writes `core_pattern` again at boot), then set `kernel.core_pattern=core` in a file under `/etc/sysctl.d/` and run `sysctl --system`. A plain `sysctl kernel.core_pattern=core` lasts only until the next reboot. With a non-pipe pattern, a limit of 1 writes nothing.

## The Runner

The `runner` service runs Learners' code in Sandbox containers. Its settings are in `.env` and reach it through `compose.yaml`.

### How many runs at once

`RUNNER_MAX_CONCURRENT` is the most runs the Runner executes at the same time. Leave it empty and it is one per CPU of the machine. A run beyond that waits in a short queue (up to 8 requests, for up to 8 s), and the Runner then answers "busy". Set a whole number of 1 or more in `.env`, then run `docker compose up -d`. The Runner will not start on any other value.

The `init` command writes `RUNNER_MAX_CONCURRENT: ${RUNNER_MAX_CONCURRENT:-}` under `runner`'s `environment` in `compose.yaml`. If an older `init` wrote yours, `.env` is not enough: the variable reaches the container only if `compose.yaml` lists it. Add that line to `runner`'s `environment`, put `RUNNER_MAX_CONCURRENT=<number>` in `.env`, and run `docker compose up -d`. Do not add it to `web`.

### Runner troubleshooting

When a Run or Submit fails because the Runner could not be used, the Learner sees "The runner is unavailable. Try again." Look in both logs: `docker compose logs web runner`. Each failed call to the Runner makes one line in `web`'s log, `runner <kind>`. The Runner adds its own line for three of the kinds, each a line of fixed words (and, for `RunnerFailed`, the error's class name) with nothing from the request. Neither log holds anything from the request.

| `web` logs | What happened | Check first |
|---|---|---|
| `runner RunnerUnauthorized` (the Runner also logs `runner RunnerUnauthorized`) | The Runner answered 401: the token the web sent is not the one the Runner holds. | `RUNNER_TOKEN` must be the same in both services. After changing it in `.env`, run `docker compose up -d` so both are recreated. |
| `runner RunnerRefused` (the Runner also logs `runner RunnerRefused`) | The Runner answered 400: it did not accept the request (a body that is not JSON, or not a valid request). A caller that leaves before its body arrives, or whose stalled body the Runner's idle timeout cuts, is not logged. | Both services should run the same image: `BEYONDLEETCODE_IMAGE` in `.env`, then `docker compose up -d`. Report it if they do. |
| `runner RunnerBusy` | The Runner answered 503 "busy": every slot was taken and the queue was full or too slow. The Runner does not log this. | Wait and retry. If it keeps happening, see [How many runs at once](#how-many-runs-at-once). |
| `runner RunnerNotReady` | The Runner answered 503 "not ready": that Language's image has not been pulled yet, or is being pulled again after it was removed from the host. The Runner does not log this. The first request to hit a removed image can get `RunnerFailed` instead. | `docker compose logs runner` for `Pulling Sandbox image`, `Could not pull Sandbox image` and `Runner lost the <language> image`. A pull that keeps failing is often a host that cannot reach Docker Hub or `ghcr.io`; the logged error says why. |
| `runner RunnerUnreachable` | No answer: the connection failed, or the Runner took longer than 30 s to answer in full. | `docker compose ps`: is `runner` running, not restarting? `docker compose logs runner` shows why it stopped; it refuses to start on a missing, placeholder or too-short `RUNNER_TOKEN` (32 characters at least) or a bad `RUNNER_MAX_CONCURRENT`. |
| `runner RunnerFailed` | Any other answer: a 500 (the Runner logs `runner RunnerFailed <ClassName>`: the class name of the error that was thrown, never its message), a redirect, or a reply that is not a valid result. | `docker compose logs runner`. Check that nothing else is answering at the Runner's address. |

The Runner's request handler logs nothing for a 200, a 404, a 405, a 503 (busy or not ready), a caller that leaves while its request waits for a slot, or a caller that leaves mid-body. Container handling logs its own lines: a Run stopped at the time limit adds `Kill of container <id> answered after N ms` (or `Could not kill container <id>` if the kill failed), and a container that could not be removed logs `Could not remove container ...`.

#### Log rotation

Docker's default `json-file` driver keeps every line a container writes. The `compose.yaml` that `init` writes now caps both services at 3 files of 10 MB each. That applies to new Instances only: `init` never rewrites an existing `compose.yaml`. To get the same on an existing Instance, add this block under both `web` and `runner` (beside `restart`), then run `docker compose up -d`:

```yaml
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

The new limits take effect when the containers are recreated, and apply to the logs they write from then on. Recreating them deletes the logs the old containers wrote, so save any you want first with `docker compose logs > file`.

## Dev mode

Dev mode is a tool for an operator or a content author to check the content. It is not a Learner feature. It is on only for a Local Instance started with `DEV_MODE=1`.

### The switch

- **Only exactly `1` turns it on.** Unset, empty, `0`, `true` or any other value leaves it off.
- **It is read once, when the web process starts,** so turning it on or off takes a restart. Nothing a request sends can turn it on.
- **The image never sets it,** and neither do the `compose.yaml` and `.env` that `init` writes. `compose.yaml` does not list `DEV_MODE`, so a `DEV_MODE` line in `.env` alone never reaches the container. [In the published image](#in-the-published-image) says what does.

### Local Mode only

- **It takes effect only when the Instance is already Local as the process starts.** On a fresh Instance it stays off even with the switch set, and Setup can still make the Instance Multi-user, after which a start with the switch refuses. So start without the switch, choose Local at Setup, then restart with it.
- **A Multi-user Instance with the switch set refuses to start.** The message says to unset `DEV_MODE`.
- **A Local Instance with dev mode on cannot be switched to Multi-user.** Setup answers "Dev mode is on. Restart without DEV_MODE to turn this Instance into a Multi-user one." Restart without the switch first.

### What it does

- **No Topic is Locked.** Every Topic, Chapter and Problem opens. The Map still shows Complete only from real progress, and an Accepted panel names no newly Unlocked Topic.
- **A band reading "Dev mode" and "Everything is unlocked." sits above every screen.**
- **The content folder (`CONTENT_DIR`) is read again once for each request that reads content.** A saved edit to a Chapter, a Problem, a Test or Reference Code shows on the next reload, with no rebuild and no restart.
  - That costs time. On the full `content/` folder (3,428 files) one read took about 0.35 to 0.45 s, and every such request pays it, each autosave included.
  - The folder must still be valid when the web process starts, or it does not start, dev mode or not.
- **Content that fails validation after the start makes the page answer "Invalid content".** The page lists each issue as `<path inside the content folder>: <what is wrong>`, at most 200, then one "and N more" line. Fix the file and reload: the next request reads the folder again. The web process's log still holds only `[500] <METHOD> <route id> ContentError`, as for any error.
- **The Problem screen's console has a Dev item.** Pick a Language under "reference language" and press "Run reference solution".
  - It runs that Problem's Reference Code against the Tests a Submit of it runs: its own Tests and every earlier Core Problem's. An earlier Problem's Tests show that Problem's id.
  - It goes through the Runner with a Submit's limits.
  - It lists one row per Test: its name, Example or Hidden, and pass or the failure (wrong answer, runtime error, time limit exceeded). A row shows nothing else: no input, no expected output, no output and no time.
  - Reference Code that does not compile, a Runner that is down, and a batch the Runner cut off all read "Runner unavailable".
  - It saves no code, records no Submission and changes no progress. It uses one of the Learner's two run places, as a Run does.

### What stays

Opening a page in dev mode writes nothing. What the Learner does is stored as for any Learner (reaching a Chapter's end marks it Read, as it does anywhere, because the page posts that on its own), and it stays after dev mode is turned off: Read marks, saved code (Run and Submit save first), Submissions, revealed Hints, and the Language chosen per Topic.

- **A Topic completed in dev mode stays Complete,** and counts as a Prerequisite.
- **A Topic that dev mode opened, but whose Prerequisites did not, is Locked again once dev mode is off, unless it was completed** (a Complete Topic is never Locked). Its saved work is kept.
- **Give dev mode a database of its own.** Never point it at the database of an Instance someone learns on. That would also be a second web process on one data volume, which this page already says not to run.
- **Settings' Reset progress deletes all of the Learner's progress,** not only the dev-mode part.

### Safety

- **Local Mode has no sign-in, so anyone who reaches the address can use dev mode.** Keep it on your own machine or your tailnet, never on a public address.
- **Run it from the built server or the published image, never `bun run dev` (`vite dev`).** Under `vite dev` SvelteKit skips its [cross-site form check](https://github.com/sveltejs/kit/blob/%40sveltejs%2Fkit%403.1.1/packages/kit/src/runtime/server/respond.js#L101-L135) (the `if (!__SVELTEKIT_DEV__)` block, at `@sveltejs/kit@3.1.1`), so a page on any site you open could submit the Instance's forms.

### From a clone

You need [Bun](https://bun.com/docs/installation) 1.3.13 or later (CI builds with 1.4.3), and Docker for the Runner. On an older Bun, `bun run build` exits 0 without writing `build/`.

1. Run `bun install`.
2. Run `cp .env.example .env`. In `.env`, set:
   - `CONTENT_DIR=content`. The example points at the test fixture.
   - A `DATABASE_URL` of its own, as an absolute path, for example `file:/home/you/beyondleetcode-dev.db`.
   - A `RUNNER_TOKEN` of 32 or more random characters, for example from `openssl rand -hex 24`. The Runner refuses the example's.
   - `ORIGIN` to the URL you will open: `http://localhost:3000` on your own machine (the built server listens on port 3000 unless `PORT` is set), or the tailnet URL ([Over the tailnet](#over-the-tailnet)).
3. Load `.env` into the shell, because `prisma.config.ts` reads `DATABASE_URL` from the process environment. Then migrate the database and build:

   ```sh
   set -a; . ./.env; set +a
   bunx prisma migrate deploy
   bun run build
   ```

4. In a second terminal, load `.env` the same way, then run `bun run runner`. The Runner pulls the three Sandbox images before it can run code.
5. Run `bun ./src/lib/server/web-entry.ts`, open `ORIGIN`, choose Local at Setup, then stop the web process.
6. Start it again with the switch:

   ```sh
   DEV_MODE=1 bun ./src/lib/server/web-entry.ts
   ```

   The band shows. Edit files under `content/` and reload. A change to the app's own code still needs `bun run build` and a restart.

### In the published image

1. **Use a folder whose name no other Instance's folder has,** for example `beyondleetcode-dev`, because [Compose names the project, its containers and the `data` volume after the folder](https://docs.docker.com/compose/how-tos/project-name/). A folder with the same name as another Instance's would take over its containers and its volume, and turn dev mode on over a Learner's database. Run `init` there with `--origin` set to the URL you will open and a `--port` no other Instance uses (the default is 3000).
2. **Run the image the content was written for.** Content the image's version cannot read stops `web` at start. For a clone of `main`, set `BEYONDLEETCODE_IMAGE` in `.env` to the `edge` tag, which is built on every push to `main`.
3. **Run `docker compose pull && docker compose up -d`, and choose Local at Setup,** as in [Install](#install-local-mode).
4. **Beside `compose.yaml`, write a `compose.override.yaml`.** It sets `DEV_MODE: "1"` under `web`'s `environment`, and mounts the clone's `content/` folder read-only over `/app/content`, the image's `CONTENT_DIR`. Compose [reads `compose.override.yaml` on its own](https://docs.docker.com/compose/how-tos/multiple-compose-files/merge/).

   ```yaml
   services:
     web:
       environment:
         DEV_MODE: "1"
       volumes:
         - /path/to/your/clone/content:/app/content:ro
   ```

5. **Run `docker compose up -d`.** It recreates `web` with dev mode on.
6. **To turn it off,** delete `compose.override.yaml` and run `docker compose up -d`. The switch and the mount both go.

### Over the tailnet

- **`ORIGIN` is the exact URL you open over the tailnet,** for example `http://<machine>.<tailnet>.ts.net:3000`. It is the `--origin` you give `init`, or `ORIGIN` in a clone's `.env`.
- **A Local Instance needs it over plain http.** Without `ORIGIN` the built server takes every request for [https unless you tell it otherwise](https://svelte.dev/docs/kit/adapter-node#Environment-variables-PROTOCOL_HEADER-HOST_HEADER-and-PORT_HEADER), and refuses every form as cross-site. Forms work at that one URL only (see "Reach the Instance only by its `ORIGIN`" above).
- **The tailnet address must exist when the web process starts.** After a reboot, start it once Tailscale is up. This holds for a clone's `HOST` and for the image's `ports` line.
- **Listen on the tailnet only.** From a clone, set `HOST` to the machine's tailnet address, which `tailscale ip -4` prints ([`tailscale ip`](https://tailscale.com/kb/1080/cli)). The built server otherwise listens on every interface: [adapter-node's `HOST`](https://svelte.dev/docs/kit/adapter-node#Environment-variables-PORT-HOST-and-SOCKET_PATH) defaults to `0.0.0.0`.
- **In the image, change the `ports` line in `compose.yaml` itself** to `"<tailnet address>:${PORT}:3000"`, as the proxy note above does with `127.0.0.1`. Do not do it in the override file: Compose [adds an override's `ports` to the base list](https://docs.docker.com/reference/compose-file/merge/) rather than replacing it.

## Upgrading

`.env` names the exact version `init` ran from (`BEYONDLEETCODE_IMAGE=ghcr.io/gauranshmathur/beyondleetcode:vX.Y.Z`), and `compose.yaml` runs that image, so pulling alone fetches the same version again. To upgrade, set `BEYONDLEETCODE_IMAGE` in `.env` to the new tag (or to `:latest` to follow releases), then pull and recreate: `docker compose pull && docker compose up -d`. Migrations run when `web` starts. `init` never touches existing files, so for settings added later, edit your `compose.yaml` and `.env` as described above.

**If `web` stops with `stopped_the_same_provider_identity_belongs_to_different_users_resolve_by_hand`,** the `20261023000000_learner_relations` migration found one GitHub or Google identity attached to two Users, and will not guess which keeps it. Recover by hand:

1. Stop `web` (`docker compose stop web`) and back up the data volume.
2. List the duplicates. The image has no `sqlite3`, so use Bun, run as the `bun` user so the database file keeps its owner:

   ```sh
   docker compose run --rm --no-deps --user bun --entrypoint bun web -e '
   import { Database } from "bun:sqlite";
   const db = new Database("/data/beyondleetcode.db");
   console.table(db.query(`select id, userId, providerId, accountId from Account
     where providerId || accountId in
       (select providerId || accountId from Account group by providerId, accountId having count(distinct userId) > 1)`).all());'
   ```

3. Decide which User keeps the identity, and delete the other row by its `id`:

   ```sh
   docker compose run --rm --no-deps --user bun --entrypoint bun web -e '
   import { Database } from "bun:sqlite";
   new Database("/data/beyondleetcode.db").run("delete from Account where id = ?", ["<the id to delete>"]);'
   ```

4. Tell Prisma the migration did not apply, then start again:

   ```sh
   docker compose run --rm --no-deps --user bun -e HOME=/home/bun --entrypoint bunx web prisma migrate resolve --rolled-back 20261023000000_learner_relations
   docker compose up -d
   ```

**Upgrading from a version before 0.60.0 on a Multi-user Instance:** an Account whose Learner row was never created (its sign-up's Account or Session insert failed, after which the user signed in and saved work) loses that saved progress when the 0.60.0 migration runs. The Account itself is repaired at the next start and keeps working. Each Multi-user start also repairs Accounts and Learners that drifted apart, and logs `Multi-user startup repair: N missing Learner(s) created, M orphan Learner(s) removed.` only when it changed something: it created a Learner for an Account that had none, and removed Learners no Account references, with their progress. The same start also removes sessions that can no longer be used, and logs `Multi-user startup repair: N unusable session(s) removed.` only when it removed any. If the repair itself fails, the server stops rather than serve with Accounts and Learners out of step (fail-closed).
