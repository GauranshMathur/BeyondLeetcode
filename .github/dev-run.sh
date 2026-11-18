#!/usr/bin/env bash
# An on-demand check of dev mode against the real thing: it follows "From a clone" in docs/self-hosting.md step by
# step, with "Over the tailnet", on the machine it runs on (the dev-run workflow's hosted runner), with the real
# Runner and the real content/ folder, and drives the screens with a Playwright walk (src/routes/dev-run.walk.ts).
# It records every step in <out-dir>/summary.md as passed, failed (with its last error line) or not reached, and
# fails at the end if any step failed. A step that fails does not stop the script.
#
# It starts a web server, a Runner and Docker containers, and edits content/ (the walk puts every edit back), so it
# never runs on the maintainer's host. Needs Bun, Docker, curl, jq, openssl and the Bun dependencies installed.
# Usage: .github/dev-run.sh <out-dir>   (from the repo root; PLAYWRIGHT_IMAGE names the image the walk runs in)
#
# The file is a set of functions, so a test can source it and run the step helper against stubs; main runs only
# when the file is run, not when it is sourced.
set -u
set -o pipefail

PORT=3000
RUNNER_PORT=8787
WEB_PID=""
RUNNER_PID=""
LAUNCHED_PID=""
TOKEN=""
ADDR=""
DBDIR=""
ORIGIN=""
OUT=""
WORK=""
SUMMARY=""
FAILED=0
RECORD_BROKEN=0
STEP_N=0
STEP_NOTE=""
STEP_RESULT=""
ROUTE="From a clone"
declare -A BROKEN=()

die() {
  echo "dev-run: $*" >&2
  exit 1
}

# Appends text to the summary. A write that fails is remembered, and makes the run fail.
emit() {
  printf '%s\n' "$1" >>"$SUMMARY" || {
    RECORD_BROKEN=1
    echo "dev-run: cannot write $SUMMARY" >&2
  }
}

# One line of text with no line break and no table bar, at most 300 characters.
one_line() {
  printf '%s' "$1" | tr '\n\r|' '   ' | cut -c1-300
}

# record <route> <step> <passed|failed|not reached> [detail]: one row of the summary.
record() {
  local detail=""
  if [ -n "${4:-}" ]; then detail=" ($(one_line "$4"))"; fi
  printf '| %s | %s | %s%s |\n' "$1" "$(one_line "$2")" "$3" "$detail" >>"$SUMMARY" || {
    RECORD_BROKEN=1
    echo "dev-run: cannot write $SUMMARY" >&2
  }
  if [ "$3" = failed ]; then FAILED=1; fi
  echo "== $1: $2: $3${detail}"
}

# The last non-empty line of a file, without colour codes. Only a hint for the summary, so no status is checked.
last_error_line() {
  grep -v '^[[:space:]]*$' "$1" | tail -n 1 | sed 's/\x1b\[[0-9;]*[A-Za-z]//g' | cut -c1-300
}

# The log of a step, with the Runner token blanked. The token is hex, so it is safe in a sed pattern.
redact() {
  if [ -n "$TOKEN" ]; then sed "s/$TOKEN/***/g"; else cat; fi
}

# step [-s] [-a] <phase> <label> <command...>: runs one step and records it.
#   phase   base, dev or off. A step is not reached when its phase, or base, already had a failing step.
#   -s      soft: a failure is recorded but does not stop the later steps of the phase
#   -a      always: runs even when the phase is broken (the steps that stop processes)
# The command runs in this shell (a function can set STEP_NOTE, the detail of a passing step), its output goes to
# a log under the out-dir, and the last line of that output is the detail of a failing one.
step() {
  local soft=0 always=0
  while true; do
    case "$1" in
    -s) soft=1 ;;
    -a) always=1 ;;
    *) break ;;
    esac
    shift
  done
  local phase="$1" label="$2"
  shift 2
  STEP_NOTE=""
  if [ "$always" -eq 0 ] && { [ -n "${BROKEN[base]:-}" ] || [ -n "${BROKEN[$phase]:-}" ]; }; then
    STEP_RESULT=notreached
    record "$ROUTE" "$label" "not reached" "needs: ${BROKEN[base]:-${BROKEN[$phase]}}"
    return 1
  fi
  STEP_N=$((STEP_N + 1))
  local name
  printf -v name '%02d' "$STEP_N"
  local log="$WORK/step-$name.log" started=$SECONDS code
  "$@" >"$log" 2>&1
  code=$?
  if [ -n "$OUT" ]; then
    redact <"$log" >"$OUT/steps/$name.log" || RECORD_BROKEN=1
  fi
  if [ "$code" -eq 0 ]; then
    STEP_RESULT=passed
    record "$ROUTE" "$label" passed "${STEP_NOTE:-$((SECONDS - started)) s}"
    return 0
  fi
  STEP_RESULT=failed
  record "$ROUTE" "$label" failed "$(last_error_line "$log")"
  tail -n 40 "$log"
  if [ "$soft" -eq 0 ]; then BROKEN[$phase]="$label"; fi
  return 1
}

# The runner's own non-loopback IPv4 address: the source address of its route to the Internet.
own_address() {
  local line addr
  line="$(ip -4 route get 1.1.1.1)" || return 1
  addr="$(printf '%s\n' "$line" | awk '{for (i = 1; i < NF; i++) if ($i == "src") { print $(i + 1); exit }}')" || return 1
  [[ "$addr" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || return 1
  [[ "$addr" != 127.* ]] || return 1
  printf '%s\n' "$addr"
}

# set_env <key> <value>: sets KEY="value" in .env, replacing the line the example has or adding one.
set_env() {
  local key="$1" value="$2" tmp
  [[ "$key" =~ ^[A-Z_]+$ ]] || return 1
  [[ "$value" =~ ^[A-Za-z0-9_./:@=-]+$ ]] || return 1
  tmp="$(mktemp "$WORK/env.XXXXXX")" || return 1
  awk -v k="$key" -v v="$value" '
    index($0, k "=") == 1 { print k "=\"" v "\""; seen = 1; next }
    { print }
    END { if (!seen) print k "=\"" v "\"" }' .env >"$tmp" || return 1
  cat "$tmp" >.env || return 1
  rm -f "$tmp"
}

# Runs a command with .env loaded into its environment, as the guide's "set -a; . ./.env; set +a" does.
with_env() {
  (
    set -a
    . ./.env
    set +a
    "$@"
  )
}

# launch <log> <dev: 0|1> <command...>: starts a command in the background, in a session of its own so that
# stopping it stops what it started, with .env loaded and DEV_MODE=1 when asked. Sets LAUNCHED_PID.
launch() {
  local log="$1" dev="$2"
  shift 2
  setsid bash -c 'set -a; . ./.env; set +a; if [ "$1" = 1 ]; then export DEV_MODE=1; fi; shift; exec "$@"' _ "$dev" "$@" >>"$log" 2>&1 &
  LAUNCHED_PID=$!
}

# stop_proc <pid>: stops the process and everything it started, and waits for it.
stop_proc() {
  local pid="$1" i
  [ -n "$pid" ] || return 0
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
  for i in $(seq 1 20); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 1
  done
  if kill -0 "$pid" 2>/dev/null; then kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null; fi
  wait "$pid" 2>/dev/null
  return 0
}

# wait_for_200 <url> <seconds> <pid to watch>: polls until the URL answers 200, or the process is gone.
wait_for_200() {
  local url="$1" limit=$((SECONDS + $2)) pid="$3" code=none
  while [ "$SECONDS" -lt "$limit" ]; do
    kill -0 "$pid" 2>/dev/null || {
      echo "the process exited before $url answered 200"
      return 1
    }
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url")" || code=000
    [ "$code" = 200 ] && return 0
    sleep 2
  done
  echo "$url did not answer 200 within $2 s (last status $code)"
  return 1
}

# The Runner's /health, with the bearer token, lists the three Languages.
wait_for_runner() {
  local limit=$((SECONDS + 600)) body
  while [ "$SECONDS" -lt "$limit" ]; do
    kill -0 "$RUNNER_PID" 2>/dev/null || {
      echo "the Runner exited"
      return 1
    }
    if body="$(curl -s --max-time 10 -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:$RUNNER_PORT/health")" &&
      printf '%s' "$body" | jq -e '(.languages // []) as $l | ($l | index("python")) != null and ($l | index("typescript")) != null and ($l | index("go")) != null' >/dev/null; then
      echo "Runner ready: $body"
      return 0
    fi
    sleep 5
  done
  echo "the Runner's /health did not list python, typescript and go within 600 s (last answer: ${body:-none})"
  return 1
}

check_env_setup() {
  cp .env.example .env || return 1
  set_env CONTENT_DIR content || return 1
  set_env DATABASE_URL "file:$DBDIR/dev.db" || return 1
  set_env RUNNER_TOKEN "$TOKEN" || return 1
  set_env ORIGIN "$ORIGIN" || return 1
  set_env HOST "$ADDR" || return 1
  STEP_NOTE="CONTENT_DIR, DATABASE_URL, RUNNER_TOKEN, ORIGIN=$ORIGIN, HOST=$ADDR"
}

bun_version_step() {
  local v
  v="$(bun --version)" || return 1
  STEP_NOTE="Bun $v (the workflow ran bun install)"
}

migrate_step() {
  with_env bunx prisma migrate deploy
}

build_step() {
  with_env bun run build || return 1
  [ -f build/index.js ] || {
    echo "bun run build exited 0 but wrote no build/index.js"
    return 1
  }
}

runner_step() {
  launch "$OUT/clone-runner.log" 0 bun run runner
  RUNNER_PID="$LAUNCHED_PID"
  wait_for_runner
}

# start_web <dev: 0|1> <wait for>: starts the built server on the address only, waits for a 200 on that path.
start_web() {
  launch "$OUT/clone-web.log" "$1" bun ./src/lib/server/web-entry.ts
  WEB_PID="$LAUNCHED_PID"
  wait_for_200 "$ORIGIN$2" 120 "$WEB_PID"
}

stop_web() {
  stop_proc "$WEB_PID"
  WEB_PID=""
}

stop_all() {
  stop_web
  stop_proc "$RUNNER_PID"
  RUNNER_PID=""
}

# "Over the tailnet": the server listens on HOST only, so loopback must refuse the connection (curl status 7).
loopback_refused() {
  local code
  curl -s -o /dev/null --max-time 5 "http://127.0.0.1:$PORT/"
  code=$?
  [ "$code" -eq 7 ] || {
    echo "http://127.0.0.1:$PORT/ was not refused (curl status $code)"
    return 1
  }
}

# "What it does": the log holds the one 500 line for the route and no line with the broken file's path.
web_log_check() {
  local path
  path="$(jq -er .problemJson "$OUT/chosen.json")" || {
    echo "the walk wrote no chosen.json"
    return 1
  }
  grep -Eq '\[500\] GET /problems/\[problemId\] ContentError' "$OUT/clone-web.log" || {
    echo "no [500] GET /problems/[problemId] ContentError line in the web log"
    return 1
  }
  if grep -Fq -- "$path" "$OUT/clone-web.log"; then
    echo "a line of the web log holds the broken file's path: $path"
    return 1
  fi
}

# run_walk <tag> <report name>: one group of the walk, in the Playwright image as ci runs its e2e step.
run_walk() {
  local bun_bin
  bun_bin="$(readlink -f "$(command -v bun)")" || return 1
  docker run --rm --init --ipc=host --network host -e CI \
    -v "$PWD:$PWD" -w "$PWD" -v "$OUT:$OUT" \
    -v "$bun_bin:/usr/local/bin/bun:ro" -v "$bun_bin:/usr/local/bin/bunx:ro" \
    -e DEV_RUN_BASE_URL="$ORIGIN" -e DEV_RUN_OUT="$OUT" -e "DEV_RUN_CONTENT=$PWD/content" \
    -e "DEV_RUN_REPORT=$OUT/report-$2.json" \
    "$PLAYWRIGHT_IMAGE" bunx playwright test -c playwright.dev-run.config.ts --grep "$1"
}

# record_walk <label> <report name>: one summary row for each test of the group, from the JSON report.
record_walk() {
  local label="$1" report="$OUT/report-$2.json" rows status duration title error result
  if [ ! -s "$report" ]; then
    record "$ROUTE · walk $label" "(no report)" "not reached" "no JSON report was written"
    return 0
  fi
  rows="$(jq -r '[.. | objects | select(has("specs")) | .specs[]] | .[]
    | [(.tests[0].status // "skipped"), ((.tests[0].results[-1].duration // 0) | floor | tostring), .title,
       ((.tests[0].results[-1].error.message // "") | split("\n") | map(select(length > 0)) | (.[0] // ""))]
    | @tsv' "$report")" || {
    record "$ROUTE · walk $label" "(report)" failed "cannot read $report"
    return 0
  }
  while IFS=$'\t' read -r status duration title error; do
    [ -n "$title" ] || continue
    case "$status" in
    expected) result=passed ;;
    skipped) result="not reached" ;;
    *) result=failed ;;
    esac
    error="$(printf '%s' "$error" | sed 's/\x1b\[[0-9;]*[A-Za-z]//g')"
    if [ "$result" = passed ]; then error="$((duration / 1000)) s"; fi
    record "$ROUTE · walk $label" "$title" "$result" "$error"
  done <<<"$rows"
}

# group <phase> <label> <tag> <report name> [-s]: runs one group of the walk, then lists its tests.
group() {
  local phase="$1" label="$2" tag="$3" report="$4" flag="${5:-}"
  local flags=()
  if [ -n "$flag" ]; then flags=("$flag"); fi
  step "${flags[@]}" "$phase" "$label (walk, $tag)" run_walk "$tag" "$report"
  if [ "$STEP_RESULT" = notreached ]; then
    record "$ROUTE · walk $tag" "all tests" "not reached"
  else
    record_walk "$tag" "$report"
  fi
}

# stats <file> <key>: n, median, p95 (nearest rank) and max of a set of milliseconds, in seconds.
stats() {
  jq -r --arg k "$2" '(.[$k] // []) | sort | length as $n
    | if $n == 0 then "no samples"
      else (if $n % 2 == 1 then .[($n - 1) / 2] else (.[$n / 2 - 1] + .[$n / 2]) / 2 end) as $m
        | "n=\($n), median \(($m | round) / 1000) s, p95 \((.[(($n * 0.95) | ceil) - 1] | round) / 1000) s, max \((.[-1] | round) / 1000) s"
      end' "$1"
}

write_head() {
  local mem
  mem="$(awk '/MemTotal/ { printf "%.1f GB", $2 / 1048576 }' /proc/meminfo)" || mem=unknown
  emit "# dev-run: dev mode, followed from \"From a clone\" (docs/self-hosting.md)"
  emit ""
  emit "- The runner's own address, $ADDR, stands in for the tailnet address (\"Over the tailnet\")."
  emit "- Host: $(nproc) CPUs, $mem memory, kernel $(uname -r), $(docker --version), ${ImageOS:-unknown} ${ImageVersion:-unknown}"
  emit "- Bun $(bun --version), commit $(git rev-parse HEAD), $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  emit "- Files in content/: $(find content -type f | wc -l) (the guide says 3,428)"
  emit ""
  emit "| Route | Step | Result |"
  emit "| --- | --- | --- |"
}

write_tail() {
  emit ""
  emit "## Timings (the guide: about 0.35 to 0.45 s per read on the full content/ folder)"
  emit ""
  local file
  for file in "$OUT"/timings-*.json; do
    [ -f "$file" ] || continue
    emit "- ${file##*/timings-}: reads of a Problem: $(stats "$file" reads || echo unreadable)"
    if jq -e 'has("autosaves")' "$file" >/dev/null 2>&1; then
      emit "- ${file##*/timings-}: autosaves: $(stats "$file" autosaves || echo unreadable)"
    fi
  done
  emit ""
  emit "## Screenshots"
  emit ""
  local shot count=0
  for shot in "$OUT"/*.png; do
    [ -f "$shot" ] || continue
    emit "- ${shot##*/}"
    count=$((count + 1))
  done
  emit ""
  emit "$count screenshots (twelve expected)."
}

# On every exit: stops the processes, checks that the walk left content/ as it was and only then puts it back,
# removes the Sandbox containers, writes the end of the summary and sets the exit status.
cleanup() {
  local status=$? dirty gst
  trap - EXIT
  set +e
  if [ -n "$SUMMARY" ]; then
    stop_all
    dirty="$(git status --porcelain -- content/)"
    gst=$?
    if [ "$gst" -ne 0 ]; then
      record "$ROUTE" "clean-up: content/ is as the walk found it" failed "git status failed"
    elif [ -n "$dirty" ]; then
      record "$ROUTE" "clean-up: content/ is as the walk found it" failed "$(printf '%s' "$dirty" | head -n 3)"
    else
      record "$ROUTE" "clean-up: content/ is as the walk found it" passed
    fi
    git checkout -- content/
    docker ps -aq --filter label=beyondleetcode.runner | xargs -r docker rm -f >/dev/null 2>&1
    rm -f .env
    write_tail
    if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
      cat "$SUMMARY" >>"$GITHUB_STEP_SUMMARY" || RECORD_BROKEN=1
    fi
  fi
  if [ -n "$WORK" ]; then rm -rf "$WORK"; fi
  if [ "$status" -ne 0 ]; then exit "$status"; fi
  if [ "$FAILED" -ne 0 ] || [ "$RECORD_BROKEN" -ne 0 ]; then exit 1; fi
  exit 0
}

main() {
  [ "$#" -eq 1 ] && [ -n "$1" ] || die "usage: .github/dev-run.sh <out-dir>"
  [ -f .env.example ] && [ -f content/content.json ] || die "run it from the repo root"
  [ -n "${PLAYWRIGHT_IMAGE:-}" ] || die "PLAYWRIGHT_IMAGE is not set"
  local tool
  for tool in bun docker curl jq openssl setsid ip; do
    command -v "$tool" >/dev/null || die "$tool is not installed"
  done
  mkdir -p "$1/steps" || die "cannot make $1"
  OUT="$(cd "$1" && pwd)" || die "cannot enter $1"
  WORK="$(mktemp -d)" || die "cannot make a scratch folder"
  DBDIR="${RUNNER_TEMP:-$WORK}/dev-run-db"
  [[ "$DBDIR" == /* ]] || die "the database folder is not an absolute path"
  mkdir -p "$DBDIR" || die "cannot make $DBDIR"
  SUMMARY="$OUT/summary.md"
  : >"$SUMMARY" || die "cannot write $SUMMARY"
  trap cleanup EXIT

  ADDR="$(own_address)" || die "no non-loopback IPv4 address for this runner"
  ORIGIN="http://$ADDR:$PORT"
  TOKEN="$(openssl rand -hex 24)" || die "openssl rand failed"
  [[ "$TOKEN" =~ ^[0-9a-f]{48}$ ]] || die "the Runner token is not 48 hex characters"
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::add-mask::$TOKEN"; fi
  write_head

  step base "1. bun install (the workflow ran it): Bun's version" bun_version_step
  step base "2. cp .env.example .env, then set CONTENT_DIR, DATABASE_URL, RUNNER_TOKEN, ORIGIN, and HOST" check_env_setup
  step base "3. set -a; . ./.env; set +a, then bunx prisma migrate deploy" migrate_step
  step base "3. bun run build" build_step
  # A Runner that never gets ready fails its step but leaves the rest to run: the walk then shows what each
  # screen does without it.
  step -s base "4. bun run runner, until /health lists python, typescript and go" runner_step
  step base "5. bun ./src/lib/server/web-entry.ts, until /setup answers 200" start_web 0 /setup
  group base "5. Open ORIGIN and choose Local at Setup" @setup setup
  step -a base "5. Stop the web process" stop_web

  step dev "6. DEV_MODE=1 bun ./src/lib/server/web-entry.ts, until / answers 200" start_web 1 /
  step -s dev "6. http://127.0.0.1:$PORT/ does not connect (HOST is the address only)" loopback_refused
  group dev "6. Dev mode on" @dev-on dev-on -s
  step -s dev "What it does: the web log holds the [500] ContentError line and no path" web_log_check
  step -a dev "6. Stop the web process" stop_web

  step off "The switch: restart without DEV_MODE, until / answers 200" start_web 0 /
  group off "The switch: dev mode off" @dev-off dev-off -s
  step -a off "Stop the web process and the Runner" stop_all
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
