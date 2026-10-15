# BeyondLeetcode

Learn DSA the way senior engineers actually use it — not isolated leetcode puzzles, but the reasoning behind why a heap, trie, or graph algorithm becomes the right call inside real system design tradeoffs.

## What it is

- **A map of DSA topics** that unlock in order, from the fundamentals up.
- **Chapters inside each topic**, each one about a real system and the data structure decision it had to make.
- **Problems built on each chapter**, solved in the browser against real tests.
- **Self-hosted and free.** Run it for yourself (single-user, no login) or for a group (accounts, invites).

## Status

**Design phase.** There is no code to run yet. MVP1 is being designed first, then built.

- **Design:** [BeyondLeetcode — UI](https://claude.ai/artifact/WRJr84ccDYXAd3Yg1Xvp1d), a canvas with every screen in light and dark, organised by area.
- **Roadmap:** [project board](https://github.com/users/GauranshMathur/projects/1), with every piece of planned work as a card.

## Before you turn on Multi-user

Multi-user Mode (accounts, each keeping its own progress) arrives in the next update. Setup says so until then. Set these up first, so your Instance is ready when it does. They go in the `.env` next to `compose.yaml`.

- **`BETTER_AUTH_SECRET` is required.** It signs sessions. Use at least 32 characters, and not the example value from `.env.example`. `init` writes a random one for you. `openssl rand -hex 24` makes another.
- **`ORIGIN` is required.** It is the public URL of your Instance, for example `https://learn.example.com`. Setup does not offer Multi-user without it, and a Multi-user Instance will not start without it. `PROTOCOL_HEADER` and `HOST_HEADER` do not replace it.
- **Behind a reverse proxy, set `ORIGIN` plus `ADDRESS_HEADER` and `XFF_DEPTH`.** `ADDRESS_HEADER` is the header your proxy fills in with the client's address, such as `X-Forwarded-For`. `XFF_DEPTH` is how many trusted proxies sit in front of the app, as the [SvelteKit `adapter-node` docs](https://svelte.dev/docs/kit/adapter-node#Environment-variables-ADDRESS_HEADER-and-XFF_DEPTH) describe. Without them every client looks like the proxy, and they all share one sign-in rate limit. Set them only if every request comes through the proxy. They reach the app through `compose.yaml`. If an older `init` wrote yours, add `ADDRESS_HEADER: ${ADDRESS_HEADER:-}` and `XFF_DEPTH: ${XFF_DEPTH:-1}` under `web`'s `environment`.
- **Open Setup straight after the first start.** The first visitor to Setup becomes the admin.
- **Use https if the Instance is reachable beyond your own machine.** Over plain http, passwords and session cookies cross the network unencrypted.
- **Never set** `BETTER_AUTH_SECRETS`, `BETTER_AUTH_URL`, `PUBLIC_BETTER_AUTH_URL`, `BASE_URL`, `BETTER_AUTH_TRUSTED_ORIGINS`, `BETTER_AUTH_TELEMETRY` or `BETTER_AUTH_TELEMETRY_ENDPOINT`. Better Auth, the sign-in library, reads each from the environment on its own. [`BETTER_AUTH_SECRETS`](https://github.com/better-auth/better-auth/blob/db02f233918ad1233bf0753e437e1c0da353273d/packages/better-auth/src/context/create-context.ts#L174) replaces the session secret. [`BETTER_AUTH_TRUSTED_ORIGINS`](https://github.com/better-auth/better-auth/blob/db02f233918ad1233bf0753e437e1c0da353273d/packages/better-auth/src/context/helpers.ts#L155) adds origins it accepts. The app refuses to start while either is set. [The URL variables](https://github.com/better-auth/better-auth/blob/db02f233918ad1233bf0753e437e1c0da353273d/packages/better-auth/src/utils/url.ts#L153-L160) name another base URL, and [the telemetry pair](https://github.com/better-auth/better-auth/blob/db02f233918ad1233bf0753e437e1c0da353273d/packages/telemetry/src/index.ts#L26) sends Better Auth's telemetry to the endpoint you give. Keep those five unset too.

## Contributing

Content requests (a new chapter, problem or topic) and bugs go in [Issues](https://github.com/GauranshMathur/BeyondLeetcode/issues).

Everything a learner reads or solves must meet the [content standards](docs/content-standards.md): every claim about a real system cites a primary source, and a human has checked it.

## License

[MIT](LICENSE)

