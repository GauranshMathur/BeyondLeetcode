#!/usr/bin/env bash
# The load job's script (load.yml): starts a fresh Runner from the image, plays scripts/load/run.sh against
# it, checks that no labelled container is left, and reports how long each container lived. Run it only on a
# GitHub-hosted runner: the sustained scenario fills every Runner slot and queue place at once.
# Needs Docker, jq, openssl, curl, timeout, pgrep, and the Bun dependencies (bun install). The Sandbox images must
# already be built under the names config.ts uses (.github/build-sandbox-images.sh).
# Usage: .github/load.sh <image> <out-dir>   e.g. .github/load.sh beyondleetcode:load "$RUNNER_TEMP/load"
#
# The functions can be sourced and run against stubs; main runs only when the file is executed.
set -uo pipefail

runner_name=bl-load-runner
runner_label=beyondleetcode.runner
runner_url=http://127.0.0.1:8787
languages=(python typescript go)
# Waits, in seconds. Variables so a test that sources this file can shorten them.
health_wait=300
settle_wait=120
poll_every=2
cleanup_wait=60

failed=0
runner_started=0
k6_pid=
events_pid=
events_file=
settle_text=n/a
missing_languages=
last_health_code=none

fail() { echo "::error::$*" >&2; failed=1; }

# Stops the event capture; its status says nothing, the check that it was alive comes before.
stop_capture() {
  if [ -n "$events_pid" ]; then
    kill "$events_pid" 2>/dev/null
    wait "$events_pid" 2>/dev/null
    events_pid=
  fi
}

# Ends a process and everything it started, children first: killing run.sh alone would leave its
# `docker run` (and the k6 container behind it) going.
kill_tree() {
  local child
  for child in $(pgrep -P "$1" 2>/dev/null); do kill_tree "$child"; done
  kill "$1" 2>/dev/null
}

# Runs on every exit, including a cancelled job's INT and TERM. Any failure here is kept as the run's failure.
cleanup() {
  status=$?
  trap - EXIT INT TERM
  set +e
  local bad=0 ids
  stop_capture
  if [ -n "$k6_pid" ]; then
    kill_tree "$k6_pid"
    wait "$k6_pid" 2>/dev/null
  fi
  [ -n "$events_file" ] && rm -f "$events_file"
  # The Runner's lines hold nothing from a request, so they are printed only when the script fails.
  if [ "$status" -ne 0 ] || [ "$failed" -ne 0 ]; then
    if [ "$runner_started" -eq 1 ]; then timeout "$cleanup_wait" docker logs "$runner_name" 2>&1; fi
  fi
  if [ "$runner_started" -eq 1 ]; then
    timeout "$cleanup_wait" docker rm -f "$runner_name" >/dev/null 2>&1 || { echo "::error::Removing the Runner container failed" >&2; bad=1; }
  fi
  # Last of all, and only after the leak check has looked: whatever is still labelled goes.
  if ids="$(timeout "$cleanup_wait" docker ps -aq --filter "label=$runner_label" 2>/dev/null)"; then
    if [ -n "$ids" ]; then
      # $ids holds container ids, one per line; word splitting is the point.
      # shellcheck disable=SC2086
      timeout "$cleanup_wait" docker rm -f $ids >/dev/null 2>&1 || { echo "::error::Removing the labelled containers failed" >&2; bad=1; }
    fi
  else
    echo "::error::Listing the labelled containers in clean-up failed" >&2
    bad=1
  fi
  if ids="$(timeout "$cleanup_wait" docker ps -aq --filter "label=$runner_label" 2>/dev/null)"; then
    if [ -n "$ids" ]; then echo "::error::A container of this run is still there after clean-up" >&2; bad=1; fi
  else
    echo "::error::Listing the labelled containers after clean-up failed" >&2
    bad=1
  fi
  if [ "$status" -eq 0 ] && { [ "$failed" -ne 0 ] || [ "$bad" -ne 0 ]; }; then status=1; fi
  exit "$status"
}

# Reads the token's authorization header from stdin, so the token is on no command line.
health_status() {
  printf 'header = "Authorization: Bearer %s"\n' "$RUNNER_TOKEN" |
    curl -s --max-time "$2" -o "$1" -w '%{http_code}' --config - "$runner_url/health"
}

# Waits for /health to answer 200 listing every Language the load plays. Each request is bounded by what
# is left of the deadline, and by 10 s.
wait_ready() {
  local body deadline code left lang
  body="$(mktemp)" || { fail "mktemp failed"; return 1; }
  deadline=$((SECONDS + health_wait))
  last_health_code=none
  missing_languages=
  while [ "$SECONDS" -lt "$deadline" ]; do
    left=$((deadline - SECONDS))
    [ "$left" -gt 10 ] && left=10
    code="$(health_status "$body" "$left" 2>/dev/null || true)"
    last_health_code="${code:-none}"
    if [ "$code" = 200 ]; then
      missing_languages=
      for lang in "${languages[@]}"; do
        if ! jq -e --arg l "$lang" '.languages | index($l) != null' "$body" >/dev/null 2>&1; then
          missing_languages="${missing_languages:+$missing_languages, }$lang"
        fi
      done
      if [ -z "$missing_languages" ]; then
        rm -f "$body"
        return 0
      fi
    fi
    sleep "$poll_every"
  done
  rm -f "$body"
  if [ -n "$missing_languages" ]; then
    fail "The Runner was not ready within $((health_wait / 60)) minutes: /health answered 200 but lists no $missing_languages"
  else
    fail "The Runner was not ready within $((health_wait / 60)) minutes: /health last answered $last_health_code"
  fi
  return 1
}

start_runner() {
  runner_started=1
  docker run -d --name "$runner_name" -p 127.0.0.1:8787:8787 -e RUNNER_TOKEN \
    -v /var/run/docker.sock:/var/run/docker.sock "$1" runner >/dev/null || { fail "The Runner container did not start"; return 1; }
}

# Plays the load; its exit status is the run's.
run_k6() {
  local repo="$1" out="$2" slots
  slots="$(nproc)" || return 1
  LOAD_SLOTS="$slots" LOAD_OUT="$out" "$repo/scripts/load/run.sh" "$runner_url"
}

# Starts a capture of the labelled containers' events into $events_file. Docker keeps only its last 256
# events, so a read after the load would describe only its end; the capture runs from before k6 starts.
start_capture() {
  local since="$1"
  events_file="$(mktemp)" || { fail "mktemp failed"; return 1; }
  docker events --since "$since" --filter type=container --filter "label=$runner_label" \
    --format '{{json .}}' >"$events_file" &
  events_pid=$!
}

# Polls until no labelled container is left; sets settle_text. Fails when one remains.
leak_check() {
  local start="$SECONDS" ids deadline
  deadline=$((SECONDS + settle_wait))
  while :; do
    if ! ids="$(docker ps -aq --filter "label=$runner_label")"; then
      settle_text="unknown"
      fail "Listing the Runner's containers failed"
      return 1
    fi
    if [ -z "$ids" ]; then
      settle_text="$((SECONDS - start))s"
      return 0
    fi
    [ "$SECONDS" -ge "$deadline" ] && break
    sleep "$poll_every"
  done
  settle_text="not gone after ${settle_wait}s"
  echo "Still labelled $runner_label after ${settle_wait}s:" >&2
  docker ps -a --filter "label=$runner_label" --format '{{.Names}} {{.State}}' >&2
  fail "A Runner container was left after the load"
  return 1
}

# Ends the capture after checking that it was alive and caught something.
finish_capture() {
  if [ -n "$events_pid" ] && ! kill -0 "$events_pid" 2>/dev/null; then
    fail "The container event capture stopped before the load ended"
  fi
  sleep "$poll_every"
  stop_capture
  [ -s "$events_file" ] || fail "No container event was captured though the load started containers"
}

# Prints "count p50 p95 max" (seconds) of create-to-destroy times for the containers in the events file $1.
container_lifetimes() {
  jq -rs '
    [ .[] | select(.Action == "create" or .Action == "destroy") ]
    | group_by(.Actor.ID)
    | map(select(any(.Action == "create") and any(.Action == "destroy"))
        | ((map(select(.Action == "destroy"))[0].timeNano) - (map(select(.Action == "create"))[0].timeNano)) / 1e9)
    | sort
    | if length == 0 then "0 - - -"
      else . as $t | length as $n
        | def at($p): $t[((($p * $n) | ceil) - 1)];
          "\($n) \(at(0.5) | . * 1000 | round / 1000) \(at(0.95) | . * 1000 | round / 1000) \($t[-1] | . * 1000 | round / 1000)"
      end' "$1"
}

# A number of seconds gets its unit; a placeholder stays bare.
secs() {
  case "$1" in
    -|n/a|unknown) printf '%s' "$1" ;;
    *) printf '%ss' "$1" ;;
  esac
}

# After a clean exit, both summary files must be there, non-empty, and summary.json must parse: k6 logs a
# summary error without changing its exit status.
check_summaries() {
  local out="$1" f ok=0
  for f in summary.md summary.json; do
    if [ ! -s "$out/$f" ]; then fail "$f is missing or empty"; ok=1; fi
  done
  if [ -s "$out/summary.json" ] && ! jq -e . "$out/summary.json" >/dev/null 2>&1; then
    fail "summary.json is not valid JSON"
    ok=1
  fi
  return "$ok"
}

# Every part is made by a command whose status is checked; one failure fails the whole text.
summary_text() {
  local commit="$1" lifetimes="$2" cpus mem kernel docker_version date_ count p50 p95 max
  cpus="$(nproc)" || return 1
  mem="$(awk '/^MemTotal:/ { printf "%.1f GiB", $2 / 1048576 }' /proc/meminfo)" || return 1
  kernel="$(uname -r)" || return 1
  docker_version="$(docker version --format '{{.Server.Version}}')" || return 1
  date_="$(date -u +%Y-%m-%dT%H:%M:%SZ)" || return 1
  read -r count p50 p95 max <<<"$lifetimes" || return 1
  printf '\n## Host\n\n- CPUs: %s\n- Memory: %s\n- Kernel: %s\n- Docker server: %s\n- Image: %s %s\n' \
    "$cpus" "$mem" "$kernel" "$docker_version" "${ImageOS:-unknown}" "${ImageVersion:-unknown}" || return 1
  printf -- '- k6 ran on this host beside the Runner and its Sandboxes, so every time includes that contention.\n' || return 1
  printf '\n## Run\n\n- Commit: %s\n- Date: %s\n' "$commit" "$date_" || return 1
  printf -- '- Time for the labelled containers to be gone after the load: %s\n' "$settle_text" || return 1
  printf -- '- Containers created and destroyed: %s\n- Container lifetime, create to destroy: p50 %s, p95 %s, max %s\n' \
    "$count" "$(secs "$p50")" "$(secs "$p95")" "$(secs "$max")" || return 1
}

# Appends the host, the commit, the settle time and the lifetimes to summary.md.
write_summary() {
  local summary="$1" text
  text="$(summary_text "$2" "$3")" || { fail "Making the summary text failed"; return 1; }
  printf '%s\n' "$text" >>"$summary" || { fail "Writing $summary failed"; return 1; }
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    cat "$summary" >>"$GITHUB_STEP_SUMMARY" || { fail "Writing the job summary failed"; return 1; }
  fi
}

main() {
  if [ "$#" -ne 2 ] || [ -z "$1" ] || [ -z "$2" ]; then
    echo "Usage: $0 <image> <out-dir>" >&2
    return 2
  fi
  local image="$1" out="$2" repo commit since k6_status=0 lifetimes="0 - - -"
  repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" || return 1
  mkdir -p "$out" || { fail "Could not make $out"; return 1; }
  out="$(cd "$out" && pwd)" || { fail "Could not enter $out"; return 1; }
  trap cleanup EXIT
  trap 'failed=1; exit 130' INT
  trap 'failed=1; exit 143' TERM

  RUNNER_TOKEN="$(openssl rand -hex 24)" || { fail "Could not make the token"; return 1; }
  [ -n "$RUNNER_TOKEN" ] || { fail "The token is empty"; return 1; }
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::add-mask::$RUNNER_TOKEN"; fi
  export RUNNER_TOKEN

  commit="${GITHUB_SHA:-$(git -C "$repo" rev-parse HEAD)}" || { fail "Could not read the commit"; return 1; }

  echo "== Runner starts and answers its health check"
  start_runner "$image" || return 1
  if wait_ready; then
    echo "== load"
    since="$(date +%s)" || { fail "Could not read the time"; return 1; }
    start_capture "$since" || return 1
    # In the background so a TERM reaches the trap at once instead of after k6.
    run_k6 "$repo" "$out" &
    k6_pid=$!
    wait "$k6_pid"
    k6_status=$?
    k6_pid=
    if [ "$k6_status" -ne 0 ]; then
      fail "The load run failed (exit $k6_status)"
    else
      check_summaries "$out" || true
    fi
    leak_check || true
    finish_capture
    if [ -s "$events_file" ]; then
      if lifetimes_out="$(container_lifetimes "$events_file")" && [ -n "$lifetimes_out" ]; then
        lifetimes="$lifetimes_out"
      else
        fail "Reading the captured container events failed"
      fi
    fi
  fi

  write_summary "$out/summary.md" "$commit" "$lifetimes"
  [ "$failed" -eq 0 ] && [ "$k6_status" -eq 0 ]
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
