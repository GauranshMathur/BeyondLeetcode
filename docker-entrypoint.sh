#!/bin/sh
# Role picker for the BeyondLeetcode image (ADR 0004).
set -e

usage() {
	cat >&2 <<'USAGE'
Usage: docker run [options] ghcr.io/gauranshmathur/beyondleetcode <role>

Roles:
  web      Migrate the database, then serve the app on PORT (default 3000).
           Keeps data under /data (DATABASE_URL=file:/data/beyondleetcode.db). Runs as the
           non-root bun user. ORIGIN (the Instance's public URL, e.g. https://learn.example.com)
           and BETTER_AUTH_SECRET are needed only for Multi-user; an empty ORIGIN counts as unset.
           The GITHUB_/GOOGLE_ OAuth variables are optional (Multi-user only).
  runner   Run learner code in sandboxes. Needs RUNNER_TOKEN (32+ characters) and the
           container engine socket mounted at DOCKER_SOCKET (default /var/run/docker.sock).
           Listens on RUNNER_PORT (default 8787). Runs as root because the socket needs it.
  init     Write compose.yaml and .env into /out (mount your folder there):
           docker run --rm -v "$PWD":/out <image> init --origin https://learn.example.com [--port 3000] [--force]
  reset-admin-password
           Forgot the admin password? Run in the running web container (shell access is the proof):
           docker compose exec web docker-entrypoint.sh reset-admin-password
           Prints a one-time password once and signs the admin out everywhere; sign in with it and
           choose a new one. Needs BETTER_AUTH_SECRET (already in web's environment). Changes nothing
           if there is no admin Account.
USAGE
}

case "${1:-}" in
web)
	# compose passes an empty ORIGIN when .env has none; unset means unset.
	if [ -z "${ORIGIN:-}" ]; then unset ORIGIN; fi
	# /data may be a bind mount or restored backup owned by someone else.
	chown -R bun:bun /data
	export HOME=/home/bun
	setpriv --reuid=bun --regid=bun --init-groups bunx prisma migrate deploy
	exec setpriv --reuid=bun --regid=bun --init-groups bun src/lib/server/web-entry.ts
	;;
reset-admin-password)
	shift
	# As the bun user, like web: a root-owned SQLite journal beside the database would break web.
	export HOME=/home/bun
	exec setpriv --reuid=bun --regid=bun --init-groups bun src/lib/server/init/reset-admin-password.ts "$@"
	;;
runner)
	exec bun src/lib/server/runner/main.ts
	;;
init)
	shift
	exec bun src/lib/server/init/init.ts "$@"
	;;
*)
	usage
	exit 2
	;;
esac
