#!/usr/bin/env bash
# An on-demand instrument for the app image's Prisma path. It records what the image holds, runs a stress of the
# image's own Prisma path that prints every error in full, and repeats the image smoke flow on fresh Instances, then
# writes one record, <out-dir>/summary.md. It finds nothing and fixes nothing: it shows what an error was.
#
# Usage: .github/smoke-repeat.sh <image> <runs> <out-dir>   (from the repo root)
#   STRESS_ROUNDS   rounds of the stress inside the image (default 200)
#   PLAYWRIGHT_IMAGE, and a `bun` that sends `run test:smoke` into it (the shim of ci.yml's docker job), are what the
#   browser flow needs, as for .github/smoke.sh.
#
# The record never holds the .env that `init` writes or `docker compose config`'s output. Anything the image or web
# prints may hold a secret, so the record is written only after every value the run generated (the Runner token and
# the auth secret of each Instance) has been replaced in it and shown to be gone; otherwise no record is written.
# Nothing here starts a container with the Docker socket except the Runner of the composed Instance (ADR 0002).
#
# The file is a set of functions, so a test can source it and run the classifier and the record writer against
# stubs; main runs only when the file is run, not when it is sourced.
set -u
set -o pipefail

PORT=3000
ORIGIN_URL="http://localhost:$PORT"
COMPOSE_PROJECT_NAME=smokerepeat
export COMPOSE_PROJECT_NAME
WORK_DIR=""
INSTANCE=""
# Values this run generated and must never publish, besides those of any .env the record writer finds.
SECRETS=()

die() {
  echo "smoke-repeat: $*" >&2
  exit 1
}

# ---------------------------------------------------------------------------------------------------------------
# Classifying one browser-flow run

# classify_run <web-log> <runner-log> <flow-exit> [flow-log]
# Line 1 is the class: query-engine, other or passed. Then the lines that make it so, and a note line when the web
# log holds Prisma's libssl/openssl warning (noted once, never an error).
classify_run() {
  local web="$1" runner="$2" flow="$3" flowlog="${4:-}"
  local engine_lines warn_count reason
  engine_lines="$(grep -E '\[5[0-9][0-9]\] [A-Z]+ [^ ]+ PrismaClient[A-Za-z0-9_]*' "$web" 2>/dev/null || true)"
  warn_count="$(grep -cE 'prisma:warn.*(libssl|openssl)' "$web" 2>/dev/null || true)"
  if [ -n "$engine_lines" ]; then
    echo query-engine
    printf '%s\n' "$engine_lines"
  elif [ "$flow" != 0 ]; then
    echo other
    reason="$(first_match 'toomanyrequests' "$runner" "$web" "$flowlog")"
    if [ -z "$reason" ]; then reason="$(first_match 'RunnerNotReady' "$web")"; fi
    if [ -z "$reason" ] && [ -n "$flowlog" ] && [ -f "$flowlog" ]; then
      reason="$(sed -E $'s/\x1b\\[[0-9;]*m//g' "$flowlog" | grep -m1 -E '^[[:space:]]*Error:' | cut -c1-300 || true)"
    fi
    if [ -z "$reason" ]; then reason="the browser flow exited with $flow and printed no Error: line"; fi
    printf '%s\n' "$reason"
  else
    echo passed
  fi
  if [ "${warn_count:-0}" -gt 0 ]; then
    echo "note: prisma:warn libssl/openssl lines seen in the web log (${warn_count}), not an error"
  fi
}

# first_match <pattern> <file>...: the first line of the first file that has the pattern, cut to 300 characters.
first_match() {
  local pattern="$1" file line
  shift
  for file in "$@"; do
    [ -n "$file" ] && [ -f "$file" ] || continue
    line="$(grep -m1 -i -- "$pattern" "$file" | cut -c1-300 || true)"
    if [ -n "$line" ]; then
      printf '%s\n' "$line"
      return 0
    fi
  done
  return 0
}

# ---------------------------------------------------------------------------------------------------------------
# The record

# secret_values <file>: the values of RUNNER_TOKEN and BETTER_AUTH_SECRET in a .env, one per line.
secret_values() {
  local line value
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      RUNNER_TOKEN=* | BETTER_AUTH_SECRET=*)
        value="${line#*=}"
        value="${value%$'\r'}"
        value="${value#\"}"
        value="${value%\"}"
        value="${value#\'}"
        value="${value%\'}"
        if [ -n "$value" ]; then printf '%s\n' "$value"; fi
        ;;
    esac
  done <"$1"
}

# stress_section <title> <output-file> <status-file>: the summary line and every error block of one stress.
stress_section() {
  local title="$1" file="$2" statusfile="$3" status
  echo "## $title"
  echo
  if [ ! -f "$file" ]; then
    echo "Not run."
    echo
    return 0
  fi
  status="$(cat "$statusfile" 2>/dev/null || echo unknown)"
  echo "Exit status: $status"
  echo
  local summary
  summary="$(grep -E '^prisma-stress rounds=' "$file" | tail -n 1 || true)"
  if [ -n "$summary" ]; then
    echo '```'
    echo "$summary"
    grep -E '^learning-core refusals' "$file" || true
    echo '```'
  else
    echo "No summary line: the stress did not finish. Its last lines:"
    echo
    echo '~~~~'
    tail -n 40 "$file"
    echo '~~~~'
  fi
  echo
  local blocks
  blocks="$(awk '/^--- error:/ { on = 1 } on { print } /^--- end of error/ { on = 0; print "" }' "$file")"
  if [ -n "$blocks" ]; then
    echo "Every error it printed:"
    echo
    echo '~~~~'
    printf '%s\n' "$blocks"
    echo '~~~~'
  else
    echo "It printed no error."
  fi
  echo
}

# One run folder's row of the table: number, class, lines or reason, whether web answered afterwards.
run_row() {
  local dir="$1" n class details alive
  n="${dir##*/}"
  class="$(head -n 1 "$dir/class.txt" 2>/dev/null || true)"
  details="$(tail -n +2 "$dir/class.txt" 2>/dev/null | sed -e 's/|/\\|/g' | awk 'NR > 1 { printf "<br>" } { printf "%s", $0 }' || true)"
  alive="$(head -n 1 "$dir/alive.txt" 2>/dev/null || true)"
  printf '| %s | %s | %s | %s |\n' "$n" "${class:-unknown}" "${details:--}" "${alive:-n/a}"
}

# emit_record <out-dir> <image>: the text of summary.md, before it is cleaned.
emit_record() {
  local out="$1" image="$2" dir runs=0 passed=0 engine=0 other=0 class
  echo "# smoke-repeat"
  echo
  echo "- Image: $image"
  if [ -f "$out/image-digest.txt" ]; then
    echo "- Digest: $(head -n 1 "$out/image-digest.txt")"
  fi
  echo
  echo "## Image facts"
  echo
  if [ -f "$out/facts.txt" ]; then
    echo '~~~~'
    cat "$out/facts.txt"
    echo '~~~~'
  else
    echo "Not recorded."
  fi
  echo
  echo "## Prisma in the image, as docker-entrypoint.sh runs it (default network, then --network none)"
  echo
  if [ -f "$out/prisma-commands.txt" ]; then
    echo '~~~~'
    cat "$out/prisma-commands.txt"
    echo '~~~~'
  else
    echo "Not recorded."
  fi
  echo
  stress_section "Stress in the image" "$out/stress-image.txt" "$out/stress-image.status"
  stress_section "Stress from the checkout" "$out/stress-checkout.txt" "$out/stress-checkout.status"
  if [ -f "$out/instance-notes.txt" ]; then
    echo "## The composed Instance"
    echo
    echo '~~~~'
    cat "$out/instance-notes.txt"
    echo '~~~~'
    echo
  fi
  echo "## Browser-flow runs"
  echo
  echo "| Run | Class | Query-engine lines or other reason | web answered GET / afterwards |"
  echo "| --- | --- | --- | --- |"
  while IFS= read -r dir; do
    [ -d "$dir" ] || continue
    run_row "$dir"
    class="$(head -n 1 "$dir/class.txt" 2>/dev/null || true)"
    runs=$((runs + 1))
    case "$class" in
      passed) passed=$((passed + 1)) ;;
      query-engine) engine=$((engine + 1)) ;;
      *) other=$((other + 1)) ;;
    esac
  done < <(find "$out/runs" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -V)
  echo
  echo "Totals: runs=$runs passed=$passed query-engine=$engine other=$other"
}

# write_summary <out-dir> <image>
# Returns 0 when it wrote the record and nothing saw a query-engine error, 1 when it wrote the record and a run or a
# stress did, and 2 when it could not show the record clean, in which case it writes none.
write_summary() {
  local out="$1" image="$2" content env_file value
  local values=() has_runs=0
  rm -f "$out/summary.md"
  if [ -d "$out/runs" ] && [ -n "$(find "$out/runs" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | head -n 1)" ]; then
    has_runs=1
  fi
  while IFS= read -r -d '' env_file; do
    while IFS= read -r value; do values+=("$value"); done < <(secret_values "$env_file")
  done < <(find "$out" -name .env -type f -print0 2>/dev/null)
  for value in ${SECRETS[@]+"${SECRETS[@]}"}; do
    if [ -n "$value" ]; then values+=("$value"); fi
  done
  if [ "$has_runs" = 1 ] && [ "${#values[@]}" -eq 0 ]; then
    echo "smoke-repeat: no generated secret is known, so the record cannot be shown clean; none is written" >&2
    return 2
  fi
  content="$(emit_record "$out" "$image")" || return 2
  for value in ${values[@]+"${values[@]}"}; do
    content="${content//"$value"/[redacted]}"
  done
  for value in ${values[@]+"${values[@]}"}; do
    case "$content" in
      *"$value"*)
        echo "smoke-repeat: a secret is still in the record after redaction; none is written" >&2
        return 2
        ;;
    esac
  done
  printf '%s\n' "$content" >"$out/summary.md" || return 2
  verdict "$out"
}

# verdict <out-dir>: 1 when a run or a stress saw a query-engine error (or a stress failed), else 0.
verdict() {
  local out="$1" dir class status
  while IFS= read -r dir; do
    class="$(head -n 1 "$dir/class.txt" 2>/dev/null || true)"
    if [ "$class" = query-engine ]; then return 1; fi
  done < <(find "$out/runs" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -V)
  for status in "$out/stress-image.status" "$out/stress-checkout.status"; do
    [ -f "$status" ] || continue
    if [ "$(head -n 1 "$status")" != 0 ]; then return 1; fi
  done
  return 0
}

# ---------------------------------------------------------------------------------------------------------------
# Running it (needs Docker, curl, Bun and the Playwright shim; never run on the maintainer's host)

# The image facts, read with nothing started: no socket, no volume, no network except where named.
FACTS_SCRIPT='
echo "== /etc/os-release"; cat /etc/os-release
echo "== bun --version"; bun --version
echo "== openssl on the PATH"
if command -v openssl; then openssl version; else echo "none"; fi
echo "== libssl.so* and libcrypto.so*"
find / -xdev \( -name "libssl.so*" -o -name "libcrypto.so*" \) 2>/dev/null | sort
echo "== engine files and native addons under /app/node_modules (size path)"
find /app/node_modules -type f \( -iname "*engine*" -o -iname "*query_compiler*" -o -name "*.node" \) 2>/dev/null | sort > /tmp/engine-files
while IFS= read -r f; do echo "$(stat -c %s "$f") $f"; done < /tmp/engine-files
echo "== ldd of each ELF file among them (not found lines only)"
while IFS= read -r f; do
  if [ "$(head -c 4 "$f" | od -An -tx1 | tr -d " \n")" = "7f454c46" ]; then
    echo "ELF $f"
    ldd "$f" 2>&1 | grep "not found" || echo "  no not-found line"
  fi
done < /tmp/engine-files
echo "== the generated client in /app/prisma/generated"
ls -la /app/prisma/generated
grep -rIoE ".{0,50}(engineType|query_compiler|\"library\").{0,50}" /app/prisma/generated 2>/dev/null | head -n 40
'

# image_facts <out-dir> <image>
image_facts() {
  local out="$1" image="$2"
  {
    docker run --rm --entrypoint sh "$image" -c "$FACTS_SCRIPT" 2>&1
  } >"$out/facts.txt" || echo "(the facts container exited with $?)" >>"$out/facts.txt"
  {
    docker image inspect --format '{{.Id}} {{json .RepoDigests}}' "$image" 2>&1
  } >"$out/image-digest.txt" || true
}

# prisma_commands <out-dir> <image>: as docker-entrypoint.sh runs them, as the bun user, on a throwaway database.
prisma_commands() {
  local out="$1" image="$2" net
  : >"$out/prisma-commands.txt"
  for net in default none; do
    local args=(--rm --user bun --entrypoint sh -e HOME=/home/bun -e DATABASE_URL=file:/tmp/facts.db)
    if [ "$net" = none ]; then args+=(--network none); fi
    {
      echo "== network: $net"
      docker run "${args[@]}" "$image" -c 'bunx prisma -v; echo "exit=$?"; bunx prisma migrate deploy; echo "exit=$?"' 2>&1
      echo
    } >>"$out/prisma-commands.txt" || true
  done
}

# stress_in_image <out-dir> <image> <rounds> <stress-file>
stress_in_image() {
  local out="$1" image="$2" rounds="$3" file="$4" status
  docker run --rm --user bun --entrypoint sh \
    -e HOME=/home/bun -e DATABASE_URL=file:/tmp/stress.db -e CONTENT_DIR=/app/content -e "STRESS_ROUNDS=$rounds" \
    -v "$file:/app/src/lib/server/prisma-stress.bun-check.ts:ro" \
    "$image" -c 'bunx prisma migrate deploy && bun src/lib/server/prisma-stress.bun-check.ts' \
    >"$out/stress-image.txt" 2>&1
  status=$?
  echo "$status" >"$out/stress-image.status"
}

compose() { (cd "$INSTANCE" && docker compose "$@"); }

# wait_for_200 <url> <seconds>: polls until the URL answers 200 or the deadline passes.
wait_for_200() {
  local url="$1" deadline=$((SECONDS + $2))
  while [ "$SECONDS" -lt "$deadline" ]; do
    [ "$(curl -s -m 5 -o /dev/null -w '%{http_code}' "$url" || true)" = 200 ] && return 0
    sleep 2
  done
  return 1
}

runner_health() {
  compose exec -T runner bun -e 'const r = await fetch("http://127.0.0.1:8787/health", { headers: { Authorization: `Bearer ${process.env.RUNNER_TOKEN}` } }); process.exit(r.status === 200 ? 0 : 1)' >/dev/null 2>&1
}

wait_for_runner() {
  local deadline=$((SECONDS + ${1:-900}))
  while [ "$SECONDS" -lt "$deadline" ]; do
    runner_health && return 0
    sleep 3
  done
  return 1
}

# compose_up <out-dir> <image>: one Instance as `init` writes it, its Runner ready, the sockets as ADR 0002 has them.
compose_up() {
  local out="$1" image="$2" notes="$1/instance-notes.txt" env_file value
  INSTANCE="$WORK_DIR/instance"
  mkdir -p "$INSTANCE" || return 1
  docker run --rm -v "$INSTANCE":/out -e BEYONDLEETCODE_IMAGE="$image" "$image" init --origin "$ORIGIN_URL" >/dev/null 2>&1 || {
    echo "init failed" >>"$notes"
    return 1
  }
  env_file="$INSTANCE/.env"
  while IFS= read -r value; do
    SECRETS+=("$value")
    echo "::add-mask::$value"
  done < <(secret_values "$env_file")
  [ "${#SECRETS[@]}" -gt 0 ] || { echo "init wrote no secret to redact" >>"$notes"; return 1; }
  compose up -d >/dev/null 2>&1 || { echo "docker compose up failed" >>"$notes"; return 1; }
  wait_for_200 "$ORIGIN_URL/setup" 180 || { echo "/setup never answered" >>"$notes"; return 1; }
  wait_for_runner 900 || { echo "the Runner's /health never answered" >>"$notes"; return 1; }
  if compose exec -T web test -e /var/run/docker.sock; then
    echo "web has the Docker socket" >>"$notes"
    return 1
  fi
  compose exec -T runner test -S /var/run/docker.sock || { echo "runner has no Docker socket" >>"$notes"; return 1; }
  echo "web has no Docker socket and runner has one" >>"$notes"
  return 0
}

# fresh_web: replaces web and its data volume with fresh ones and waits for /setup.
fresh_web() {
  compose rm -sf web >/dev/null 2>&1 || return 1
  docker volume rm -f "${COMPOSE_PROJECT_NAME}_data" >/dev/null 2>&1 || return 1
  compose up -d web >/dev/null 2>&1 || return 1
  wait_for_200 "$ORIGIN_URL/setup" 180
}

# one_run <out-dir> <n>
one_run() {
  local out="$1" n="$2" dir="$1/runs/$2" since flow answered
  mkdir -p "$dir"
  since="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  if ! fresh_web; then
    compose logs --no-color --no-log-prefix web >"$dir/web.log" 2>&1 || true
    printf 'other\nweb did not answer /setup after being replaced\n' >"$dir/class.txt"
    return 0
  fi
  SMOKE_BASE_URL="$ORIGIN_URL" timeout 1800 bun run test:smoke >"$dir/flow.log" 2>&1
  flow=$?
  compose logs --no-color --no-log-prefix web >"$dir/web.log" 2>&1 || true
  compose logs --no-color --no-log-prefix --since "$since" runner >"$dir/runner.log" 2>&1 || true
  classify_run "$dir/web.log" "$dir/runner.log" "$flow" "$dir/flow.log" >"$dir/class.txt"
  if [ "$(head -n 1 "$dir/class.txt")" = query-engine ]; then
    answered="$(curl -s -m 10 -o /dev/null -w '%{http_code}' "$ORIGIN_URL/" || true)"
    case "$answered" in
      [1-5][0-9][0-9]) echo "yes (HTTP $answered)" >"$dir/alive.txt" ;;
      *) echo "no (no answer within 10 s)" >"$dir/alive.txt" ;;
    esac
  fi
  echo "run $n: $(head -n 1 "$dir/class.txt")"
  # The flow's own words are for the job log only; they never reach the record except through classify_run.
  if [ "$flow" != 0 ]; then tail -n 20 "$dir/flow.log"; fi
  return 0
}

cleanup() {
  local status=$?
  set +e
  if [ -n "$INSTANCE" ] && [ -f "$INSTANCE/compose.yaml" ]; then
    (cd "$INSTANCE" && docker compose down -v >/dev/null 2>&1)
  fi
  if [ -n "$WORK_DIR" ]; then rm -rf "$WORK_DIR"; fi
  exit "$status"
}

main() {
  local image="${1:?usage: smoke-repeat.sh <image> <runs> <out-dir>}"
  local runs="${2:?usage: smoke-repeat.sh <image> <runs> <out-dir>}"
  local out="${3:?usage: smoke-repeat.sh <image> <runs> <out-dir>}"
  local rounds="${STRESS_ROUNDS:-200}" stress_file n status
  case "$runs" in '' | *[!0-9]*) die "runs must be a whole number, got '$runs'" ;; esac
  case "$rounds" in '' | *[!0-9]* | 0) die "STRESS_ROUNDS must be a whole number of at least 1, got '$rounds'" ;; esac
  stress_file="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/src/lib/server/prisma-stress.bun-check.ts"
  [ -f "$stress_file" ] || die "$stress_file is missing"
  mkdir -p "$out/runs" || die "cannot make $out"
  WORK_DIR="$(mktemp -d)" || die "cannot make a temporary folder"
  trap cleanup EXIT

  echo "== image facts"
  image_facts "$out" "$image"
  echo "== prisma -v and migrate deploy, as the entrypoint runs them"
  prisma_commands "$out" "$image"
  echo "== the stress, inside the image ($rounds rounds)"
  stress_in_image "$out" "$image" "$rounds" "$stress_file"
  tail -n 3 "$out/stress-image.txt" | grep -E '^prisma-stress ' || true

  echo "== the composed Instance"
  if compose_up "$out" "$image"; then
    for n in $(seq 1 "$runs"); do
      echo "== browser flow, run $n of $runs"
      one_run "$out" "$n"
    done
  else
    echo "the Instance did not come up: see the record"
  fi

  write_summary "$out" "$image"
  status=$?
  if [ "$status" = 2 ]; then
    echo "smoke-repeat: no record was written" >&2
    return 1
  fi
  if [ ! -d "$out/runs" ] || [ -z "$(find "$out/runs" -mindepth 1 -maxdepth 1 -type d | head -n 1)" ]; then
    # The Instance never came up: that is a failure of the run, not a finding.
    return 1
  fi
  return "$status"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
