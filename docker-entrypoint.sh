#!/bin/sh
# Role picker for the BeyondLeetcode image (ADR 0004).
set -e

usage() {
	cat >&2 <<'USAGE'
Usage: docker run [options] ghcr.io/gauranshmathur/beyondleetcode <role>

Roles:
  web      Migrate the database, then serve the app on PORT (default 3000).
           Needs ORIGIN (the Instance's public URL, e.g. https://learn.example.com);
           without it SvelteKit rejects form posts. Keeps data under /data
           (DATABASE_URL=file:/data/beyondleetcode.db). Runs as the non-root bun user.
  runner   Run learner code in sandboxes. Needs RUNNER_TOKEN (32+ characters) and the
           container engine socket mounted at DOCKER_SOCKET (default /var/run/docker.sock).
           Listens on RUNNER_PORT (default 8787). Runs as root because the socket needs it.
  init     Not yet: writing compose.yaml and .env arrives in card C8b.
USAGE
}

case "${1:-}" in
web)
	# /data may be a bind mount or restored backup owned by someone else.
	chown -R bun:bun /data
	export HOME=/home/bun
	setpriv --reuid=bun --regid=bun --init-groups bunx prisma migrate deploy
	exec setpriv --reuid=bun --regid=bun --init-groups bun ./build/index.js
	;;
runner)
	exec bun src/lib/server/runner/main.ts
	;;
init)
	echo "init is not available yet (card C8b)." >&2
	exit 2
	;;
*)
	usage
	exit 2
	;;
esac
