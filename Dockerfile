# One image, two roles (ADR 0004): `docker run <image> web|runner`. See docker-entrypoint.sh.
ARG BUN_VERSION=1.2.19
# The build stage only. SvelteKit 3 forks workers that end with process.exit(), and on Bun before 1.3.13 that ends the
# whole process: `bun run build` exits 0 after "Analysing routes" without writing build/ (tested through 1.3.12). The
# built app is identical and runs on BUN_VERSION below, which stays the production runtime.
ARG BUILD_BUN_VERSION=1.4.3

FROM oven/bun:${BUILD_BUN_VERSION} AS build
WORKDIR /app
# prisma files first: `bun install` runs `prepare`, which runs `prisma generate`.
COPY package.json bun.lock prisma.config.ts ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile
COPY . .
# A silent early exit (see BUILD_BUN_VERSION) must fail here, not at the COPY below.
RUN bun run build && test -f build/index.js && test -f build/handler.js

FROM oven/bun:${BUN_VERSION} AS deps
WORKDIR /app
COPY package.json bun.lock prisma.config.ts ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile --production

FROM oven/bun:${BUN_VERSION}
# The reference `init` writes into .env; the publish workflow passes the tag it builds.
ARG IMAGE_REF=ghcr.io/gauranshmathur/beyondleetcode:latest
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json prisma.config.ts ./
COPY prisma ./prisma
COPY src/lib/server/runner ./src/lib/server/runner
# The shared list of Languages (src/lib/languages.ts) is read by the Runner.
COPY src/lib/languages.ts ./src/lib/languages.ts
COPY src/lib/server/init ./src/lib/server/init
# `reset-admin-password` runs from source: it imports db.ts, instance.ts, identity/auth.ts, accounts.ts and origin.ts, and through
# auth.ts logging.ts, identity/invites.ts, identity/secret.ts and identity/session-binding.ts (their other imports are types, which Bun drops) and the generated Prisma client, which only the build stage has.
COPY src/lib/server/db.ts src/lib/server/instance.ts src/lib/server/logging.ts ./src/lib/server/
COPY src/lib/server/identity/auth.ts src/lib/server/identity/accounts.ts src/lib/server/identity/origin.ts src/lib/server/identity/invites.ts src/lib/server/identity/secret.ts src/lib/server/identity/session-binding.ts ./src/lib/server/identity/
# The web role starts this entry, which pins the request origin to ORIGIN and then runs the build (adapter-node 6 no longer reads ORIGIN).
COPY src/lib/server/web-entry.ts src/lib/server/origin-pin.ts ./src/lib/server/
COPY --from=build /app/prisma/generated ./prisma/generated
COPY content /app/content
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=file:/data/beyondleetcode.db \
    CONTENT_DIR=/app/content \
    RUNNER_PORT=8787 \
    BEYONDLEETCODE_IMAGE=${IMAGE_REF}
RUN mkdir -p /data && chown bun:bun /data
VOLUME /data
EXPOSE 3000 8787
# Starts as root: `web` drops to the bun user, `runner` stays root for the engine socket.
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["web"]
