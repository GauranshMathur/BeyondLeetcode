#!/usr/bin/env bash
# The smoke test of the app image, shared by ci's `docker` job and release's `publish-release` job,
# so the image that is published is the image that passed it. Needs Docker, the Bun dependencies
# and Playwright's chromium installed (bun install, bunx playwright install).
# Usage: .github/smoke.sh <local-image>   e.g. beyondleetcode:ci
set -u
image="${1:?usage: smoke.sh <local-image>}"
instance="$(mktemp -d)"

cleanup() {
  status=$?
  set +e
  docker rm -f web runner >/dev/null 2>&1
  if [ -f "$instance/compose.yaml" ]; then
    if [ "$status" -ne 0 ]; then (cd "$instance" && docker compose logs); fi
    (cd "$instance" && docker compose down -v)
  fi
  docker volume rm bl-data >/dev/null 2>&1
  exit "$status"
}
trap cleanup EXIT
set -e

# Polls a URL until 200; extra args go to curl.
wait_for_200() {
  local url="$1"; shift
  for _ in $(seq 1 30); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' "$@" "$url" || true)" = 200 ] && return 0
    sleep 2
  done
  return 1
}

echo "== web role serves the Map"
docker volume create bl-data >/dev/null
docker run -d --name web -p 3000:3000 -e ORIGIN=http://localhost:3000 -e RUNNER_URL=http://runner:8787 -e RUNNER_TOKEN=ci-web-smoke-token-0123456789abcdef-0123456789 -v bl-data:/data "$image" web
wait_for_200 http://localhost:3000/ || { docker logs web; exit 1; }

# The runner pulls every Sandbox image at start-up; the tags are only published once this reaches main,
# so both are built here under the exact name:tag config.ts uses and found locally through the socket.
echo "== Sandbox images"
.github/build-sandbox-images.sh

echo "== runner role answers its health check"
token="$(openssl rand -hex 24)"
docker run -d --name runner -p 8787:8787 -e RUNNER_TOKEN="$token" -v /var/run/docker.sock:/var/run/docker.sock "$image" runner
wait_for_200 http://localhost:8787/health -H "Authorization: Bearer $token" || { docker logs runner; exit 1; }

echo "== init then compose up serves the Map"
docker rm -f web runner >/dev/null
docker volume rm bl-data >/dev/null
cd "$instance"
docker run --rm -v "$PWD":/out -e BEYONDLEETCODE_IMAGE="$image" "$image" init --origin http://localhost:3000
grep -q "^BEYONDLEETCODE_IMAGE=$image\$" .env
docker compose up -d
wait_for_200 http://localhost:3000/
# Only the runner holds the engine socket.
if docker compose exec -T web test -e /var/run/docker.sock; then
  echo "web container has the Docker socket"; exit 1
fi
docker compose exec -T runner test -S /var/run/docker.sock

echo "== runner is ready"
ready=
for _ in $(seq 1 60); do
  if docker compose exec -T runner bun -e 'const r = await fetch("http://127.0.0.1:8787/health", { headers: { Authorization: `Bearer ${process.env.RUNNER_TOKEN}` } }); process.exit(r.status === 200 ? 0 : 1)'; then ready=1; break; fi
  sleep 2
done
[ -n "$ready" ] || { echo "runner never became ready"; exit 1; }

# Seam 4: Map, Topic, Chapter, Problem, Run, Submit, Accepted, once per Language, on the composed image.
echo "== browser flow on the composed stack"
cd - >/dev/null
SMOKE_BASE_URL=http://localhost:3000 bun run test:smoke
