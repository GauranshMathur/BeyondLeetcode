# BeyondLeetcode

Learn DSA the way senior engineers actually use it — not isolated leetcode puzzles, but the reasoning behind why a heap, trie, or graph algorithm becomes the right call inside real system design tradeoffs.

## What it is

- **A map of DSA topics** that unlock in order, from the fundamentals up.
- **Chapters inside each topic**, each one about a real system and the data structure decision it had to make.
- **Problems built on each chapter**, solved in the browser against real tests.
- **Self-hosted and free.** Run it for yourself (single-user, no login) or for a group (accounts, invites).

## Status

Local Mode and Multi-user Mode both work. A released image is published at `ghcr.io/gauranshmathur/beyondleetcode`.

- **Design:** [BeyondLeetcode — UI](https://claude.ai/artifact/WRJr84ccDYXAd3Yg1Xvp1d), a canvas with every screen in light and dark, organised by area.
- **Roadmap:** [project board](https://github.com/users/GauranshMathur/projects/1), with every piece of planned work as a card.

## Install (Local Mode)

You need Docker with Compose. `init` writes `compose.yaml` and `.env` into the folder you mount; `--origin` is the URL you will open the app at.

```sh
mkdir beyondleetcode && cd beyondleetcode
docker run --rm -v "$PWD":/out ghcr.io/gauranshmathur/beyondleetcode init --origin http://localhost:3000
docker compose up -d
```

Open the `--origin` URL. **Open Setup straight after the first start:** on a fresh Instance the first visitor to Setup chooses the mode. Choose Local for one Learner and no sign-in.

- **Local Mode has no login.** Anyone who can reach the Instance can read its progress, reset it, or switch it to Multi-user and become the admin. Keep it on your own machine or a trusted network. A web page in a browser on your LAN can also reach it through DNS rebinding, so do not run a Local Instance on a network where you open untrusted pages.
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

It prints a one-time password once and signs the admin out everywhere. Sign in with it and you are asked to choose a new one. It changes nothing if there is no Account. If there are no Accounts at all on a Multi-user Instance, it clears the stored mode instead and asks you to restart `web` and open Setup. **Never run it while someone is setting up or switching to Multi-user:** it can undo their step.

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
- **Open registration has a small budget, and emails are not verified.** With registration Open, one address can create 20 Accounts per 10 minutes, and one client can spend that budget for everyone behind the same NAT, LAN `/64` or proxy (when `ADDRESS_HEADER` is not set). Emails are never verified, so anyone can sign up with someone else's email address. Use Invite only if that matters.

## Upgrading

Pull a new image and recreate: `docker compose pull && docker compose up -d`. Migrations run when `web` starts. `init` never touches existing files, so for settings added later, edit your `compose.yaml` and `.env` as described above.

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

**Upgrading from a version before 0.60.0 on a Multi-user Instance:** an Account whose Learner row was never created (its sign-up's Account or Session insert failed, after which the user signed in and saved work) loses that saved progress when the 0.60.0 migration runs. The Account itself is repaired at the next start and keeps working. Each Multi-user start also repairs Accounts and Learners that drifted apart, and logs `Multi-user startup repair: N missing Learner(s) created, M orphan Learner(s) removed.` only when it changed something: it created a Learner for an Account that had none, and removed Learners no Account references, with their progress. If the repair itself fails, the server stops rather than serve with Accounts and Learners out of step (fail-closed).

## Contributing

Content requests (a new chapter, problem or topic) and bugs go in [Issues](https://github.com/GauranshMathur/BeyondLeetcode/issues).

Everything a learner reads or solves must meet the [content standards](docs/content-standards.md): every claim about a real system cites a primary source, and a human has checked it.

## License

[MIT](LICENSE)

