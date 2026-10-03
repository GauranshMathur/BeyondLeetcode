# One image, two roles (ADR 0004): `docker run <image> web|runner`. See docker-entrypoint.sh.
ARG BUN_VERSION=1.2.19

FROM oven/bun:${BUN_VERSION} AS build
WORKDIR /app
# prisma files first: `bun install` runs `prepare`, which runs `prisma generate`.
COPY package.json bun.lock prisma.config.ts ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:${BUN_VERSION} AS deps
WORKDIR /app
COPY package.json bun.lock prisma.config.ts ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile --production

FROM oven/bun:${BUN_VERSION}
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json prisma.config.ts ./
COPY prisma ./prisma
COPY src/lib/server/runner ./src/lib/server/runner
# C10b: switch this line to `COPY content /app/content` once the repo's content/ folder exists.
COPY src/lib/server/content/fixture /app/content
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=file:/data/beyondleetcode.db \
    CONTENT_DIR=/app/content \
    RUNNER_PORT=8787
RUN mkdir -p /data && chown bun:bun /data
VOLUME /data
EXPOSE 3000 8787
# Starts as root: `web` drops to the bun user, `runner` stays root for the engine socket.
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["web"]
