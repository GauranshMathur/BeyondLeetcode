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
pair_wait=30
cleanup_wait=60
cleanup_kill=5
# Clean-up waits for a stopped process in steps of 0.1 s, this many of them, before it sends KILL.
stop_wait_ticks=50

failed=0
runner_owned=0
k6_ran=0
k6_pid=
k6_cmd=()
summary_file=
health_body=
capture_partial=0
leak_ok=0
events_pid=
events_file=
settle_text=n/a
missing_languages=
last_health_code=none

fail() { echo "::error::$*" >&2; failed=1; }

# Waits for a process that was sent TERM to be gone, then reaps it; one that ignores TERM gets KILL after
# stop_wait_ticks. Sets reap_killed to 1 when it needed KILL.
reap() {
  local pid="$1" i=0
  reap_killed=0
  while kill -0 "$pid" 2>/dev/null && [ "$i" -lt "$stop_wait_ticks" ]; do
    sleep 0.1
    i=$((i + 1))
  done
  if kill -0 "$pid" 2>/dev/null; then
    kill -KILL "$pid" 2>/dev/null
    reap_killed=1
  fi
  wait "$pid" 2>/dev/null
}

# Stops the event capture. The Docker client may answer TERM with any exit status, so the status says
# nothing: the capture is good when it was alive for the TERM and went away without KILL. One that had
# already died, or that needed KILL, is a failed capture.
stop_capture() {
  local st=0
  [ -n "$events_pid" ] || return 0
  kill -TERM "$events_pid" 2>/dev/null || st=1
  reap "$events_pid"
  [ "$reap_killed" -eq 0 ] || st=1
  events_pid=
  return "$st"
}

# Ends the load command and everything it started. It runs in its own process group (setsid), so one signal
# reaches every descendant, run.sh's `docker run` included; but a signal can arrive before setsid has made
# the group, so the PID and the group are both signalled and both watched, and both get KILL after the bound.
stop_k6() {
  local i=0
  [ -n "$k6_pid" ] || return 0
  kill -TERM "$k6_pid" 2>/dev/null
  kill -TERM -- "-$k6_pid" 2>/dev/null
  while { kill -0 "$k6_pid" 2>/dev/null || kill -0 -- "-$k6_pid" 2>/dev/null; } && [ "$i" -lt "$stop_wait_ticks" ]; do
    sleep 0.1
    i=$((i + 1))
  done
  kill -KILL "$k6_pid" 2>/dev/null
  kill -KILL -- "-$k6_pid" 2>/dev/null
  wait "$k6_pid" 2>/dev/null
  k6_pid=
}

# Runs on every exit, including a cancelled job's INT and TERM. EXIT is cleared so it cannot run twice, and
# further INT and TERM are ignored (GitHub sends a second TERM seconds after the first); every wait in it is
# bounded. On a cancel GitHub ends the process tree after about ten seconds, which is shorter than these
# bounds, so there clean-up does what it can first and the hosted runner is discarded afterwards. Any
# failure here is kept as the run's failure.
cleanup() {
  status=$?
  trap - EXIT
  trap '' INT TERM
  set +e
  local bad=0 ids line id img runner_removed="not present" labelled_left=0 k6_found="not looked for" k6_left="not looked for" runner_ids
  local k6_ids=()
  stop_k6
  stop_capture
  [ -n "$events_file" ] && rm -f "$events_file"
  [ -n "$health_body" ] && rm -f "$health_body"
  # The Runner container carries no Sandbox label, so it is found by the name this run owns, whether or not
  # its start succeeded. Its lines hold nothing from a request, so they are printed only when the script fails.
  if [ "$runner_owned" -eq 1 ]; then
    if runner_ids="$(timeout -k "$cleanup_kill" "$cleanup_wait" docker ps -aq --filter "name=^/${runner_name}\$" 2>/dev/null)"; then
      if [ -n "$runner_ids" ]; then
        if [ "$status" -ne 0 ] || [ "$failed" -ne 0 ]; then timeout -k "$cleanup_kill" "$cleanup_wait" docker logs "$runner_name" 2>&1; fi
        if timeout -k "$cleanup_kill" "$cleanup_wait" docker rm -f "$runner_name" >/dev/null 2>&1; then
          runner_removed=yes
        else
          echo "::error::Removing the Runner container failed" >&2
          bad=1
          runner_removed=no
        fi
      fi
    else
      echo "::error::Looking for the Runner container in clean-up failed" >&2
      bad=1
      runner_removed=unknown
    fi
  fi
  # Last of all, and only after the leak check has looked: whatever is still labelled goes.
  if ids="$(timeout -k "$cleanup_kill" "$cleanup_wait" docker ps -aq --filter "label=$runner_label" 2>/dev/null)"; then
    if [ -n "$ids" ]; then
      # $ids holds container ids, one per line; word splitting is the point.
      # shellcheck disable=SC2086
      timeout -k "$cleanup_kill" "$cleanup_wait" docker rm -f $ids >/dev/null 2>&1 || { echo "::error::Removing the labelled containers failed" >&2; bad=1; }
    fi
  else
    echo "::error::Listing the labelled containers in clean-up failed" >&2
    bad=1
  fi
  if ids="$(timeout -k "$cleanup_kill" "$cleanup_wait" docker ps -aq --filter "label=$runner_label" 2>/dev/null)"; then
    if [ -n "$ids" ]; then
      echo "::error::A container of this run is still there after clean-up" >&2
      bad=1
      labelled_left=$(printf '%s\n' "$ids" | grep -c .)
    fi
  else
    echo "::error::Listing the labelled containers after clean-up failed" >&2
    bad=1
  fi
  # run.sh starts the k6 container with no name and no label, so it is found by its image.
  list_k6() {
    k6_ids=()
    local listing
    listing="$(timeout -k "$cleanup_kill" "$cleanup_wait" docker ps -a --format '{{.ID}} {{.Image}}' 2>/dev/null)" || return 1
    while read -r id img; do
      case "$img" in
        grafana/k6|grafana/k6:*|grafana/k6@*) [ -n "$id" ] && k6_ids+=("$id") ;;
      esac
    done <<<"$listing"
  }
  # Only when this run started the load: any other grafana/k6 container is not ours to touch.
  if [ "$k6_ran" -eq 0 ]; then
    :
  elif list_k6; then
    k6_found="${#k6_ids[@]}"
    if [ "$k6_found" -gt 0 ]; then
      timeout -k "$cleanup_kill" "$cleanup_wait" docker rm -f "${k6_ids[@]}" >/dev/null 2>&1 || { echo "::error::Removing the k6 container failed" >&2; bad=1; }
      if list_k6; then k6_left="${#k6_ids[@]}"; else bad=1; k6_left=unknown; fi
      [ "$k6_left" = 0 ] || bad=1
    fi
  else
    echo "::error::Listing the k6 containers in clean-up failed" >&2
    bad=1
    k6_found=unknown
    k6_left=unknown
  fi
  if [ -n "$summary_file" ]; then
    line="$(printf '\n## Clean-up\n\n- Runner container removed: %s\n- Labelled containers left after clean-up: %s\n- grafana/k6 containers found at clean-up: %s, left after removing them: %s\n' \
      "$runner_removed" "$labelled_left" "$k6_found" "$k6_left")"
    printf '%s\n' "$line" >>"$summary_file" || { echo "::error::Writing the clean-up lines failed" >&2; bad=1; }
    if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
      printf '%s\n' "$line" >>"$GITHUB_STEP_SUMMARY" || { echo "::error::Writing the clean-up lines to the job summary failed" >&2; bad=1; }
    fi
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
# is left of the deadline, and by 10 s; the clock is read once per round, so the bound is never 0 (curl
# reads --max-time 0 as no limit).
wait_ready() {
  local deadline now left code lang
  health_body="$(mktemp)" || { health_body=; fail "mktemp failed"; return 1; }
  deadline=$((SECONDS + health_wait))
  last_health_code=none
  missing_languages=
  while :; do
    now=$SECONDS
    left=$((deadline - now))
    [ "$left" -gt 0 ] || break
    [ "$left" -gt 10 ] && left=10
    code="$(health_status "$health_body" "$left" 2>/dev/null || true)"
    last_health_code="${code:-none}"
    if [ "$code" = 200 ]; then
      missing_languages=
      for lang in "${languages[@]}"; do
        if ! jq -e --arg l "$lang" '.languages | index($l) != null' "$health_body" >/dev/null 2>&1; then
          missing_languages="${missing_languages:+$missing_languages, }$lang"
        fi
      done
      if [ -z "$missing_languages" ]; then
        rm -f "$health_body"
        health_body=
        return 0
      fi
    fi
    sleep "$poll_every"
  done
  rm -f "$health_body"
  health_body=
  if [ -n "$missing_languages" ]; then
    fail "The Runner was not ready within $((health_wait / 60)) minutes: /health answered 200 but lists no $missing_languages"
  else
    fail "The Runner was not ready within $((health_wait / 60)) minutes: /health last answered $last_health_code"
  fi
  return 1
}

start_runner() {
  # From here this run owns the container name, even when the start fails half way.
  runner_owned=1
  docker run -d --name "$runner_name" -p 127.0.0.1:8787:8787 -e RUNNER_TOKEN \
    -v /var/run/docker.sock:/var/run/docker.sock "$1" runner >/dev/null || { fail "The Runner container did not start"; return 1; }
}

# Sets k6_cmd, the load command (run.sh reads LOAD_SLOTS and LOAD_OUT from the environment), and exports them.
# One slot per CPU is what the Runner takes by default.
prepare_k6() {
  LOAD_SLOTS="$(nproc)" || return 1
  LOAD_OUT="$2"
  export LOAD_SLOTS LOAD_OUT
  if [ "${#k6_cmd[@]}" -eq 0 ]; then k6_cmd=("$1/scripts/load/run.sh" "$runner_url"); fi
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

# Waits, within pair_wait, until the captured stream holds a destroy for every create: Docker drops a
# container from its list before it publishes the destroy event, so an empty list does not mean the
# events have all arrived. Returns 1 when the deadline passes or the capture is gone.
wait_pairs() {
  local deadline=$((SECONDS + pair_wait)) out
  while :; do
    if [ -s "$events_file" ] && out="$(container_lifetimes "$events_file")" && [ "${out##* }" = 0 ]; then return 0; fi
    [ "$SECONDS" -ge "$deadline" ] && return 1
    kill -0 "$events_pid" 2>/dev/null || return 1
    sleep "$poll_every"
  done
}

# Ends the capture: the liveness check and the stop come one straight after the other, and a capture that
# had died, or needed KILL, fails the run.
finish_capture() {
  if [ -n "$events_pid" ] && ! kill -0 "$events_pid" 2>/dev/null; then
    capture_partial=1
    fail "The container event capture stopped before the load ended"
  fi
  if ! stop_capture; then
    if [ "$capture_partial" -eq 0 ]; then fail "The container event capture did not end cleanly"; fi
    capture_partial=1
  fi
  [ -s "$events_file" ] || fail "No container event was captured"
}

# Prints "count p50 p95 max unpaired" (seconds) of create-to-destroy times for the containers in the events file $1.
container_lifetimes() {
  jq -rs '
    [ .[] | select(.Action == "create" or .Action == "destroy") ]
    | group_by(.Actor.ID)
    | . as $groups
    | ($groups | map(select((any(.Action == "create") and any(.Action == "destroy")) | not)) | length) as $unpaired
    | $groups
    | map(select(any(.Action == "create") and any(.Action == "destroy"))
        | ((map(select(.Action == "destroy"))[0].timeNano) - (map(select(.Action == "create"))[0].timeNano)) / 1e9)
    | sort
    | if length == 0 then "0 - - - \($unpaired)"
      else . as $t | length as $n
        | def at($p): $t[((($p * $n) | ceil) - 1)];
          "\($n) \(at(0.5) | . * 1000 | round / 1000) \(at(0.95) | . * 1000 | round / 1000) \($t[-1] | . * 1000 | round / 1000) \($unpaired)"
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
  local commit="$1" lifetimes="$2" cpus mem kernel docker_version date_ count p50 p95 max unpaired note=
  cpus="$(nproc)" || return 1
  mem="$(awk '/^MemTotal:/ { printf "%.1f GiB", $2 / 1048576 }' /proc/meminfo)" || return 1
  kernel="$(uname -r)" || return 1
  docker_version="$(docker version --format '{{.Server.Version}}')" || return 1
  date_="$(date -u +%Y-%m-%dT%H:%M:%SZ)" || return 1
  read -r count p50 p95 max unpaired <<<"$lifetimes" || return 1
  if [ "$capture_partial" -eq 1 ]; then note=" (partial: the event capture stopped early)"; fi
  printf '\n## Host\n\n- CPUs: %s\n- Memory: %s\n- Kernel: %s\n- Docker server: %s\n- Image: %s %s\n' \
    "$cpus" "$mem" "$kernel" "$docker_version" "${ImageOS:-unknown}" "${ImageVersion:-unknown}" || return 1
  if [ "$k6_ran" -eq 1 ]; then
    printf -- '- k6 ran on this host beside the Runner and its Sandboxes, so every time includes that contention.\n' || return 1
  fi
  printf '\n## Run\n\n- Commit: %s\n- Date: %s\n' "$commit" "$date_" || return 1
  printf -- '- Time for the labelled containers to be gone after the load: %s\n' "$settle_text" || return 1
  printf -- '- Containers created and destroyed: %s%s\n- Container lifetime, create to destroy: p50 %s, p95 %s, max %s%s\n' \
    "$count" "$note" "$(secs "$p50")" "$(secs "$p95")" "$(secs "$max")" "$note" || return 1
  printf -- '- Containers with a create but no destroy, or the reverse: %s\n' "$unpaired" || return 1
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
  local image="$1" out="$2" repo commit since unpaired k6_status=0 lifetimes="0 - - - 0"
  # Before anything is changed: the load fills every Runner slot and clean-up removes containers by label and
  # image, which is fine on a GitHub-hosted runner (discarded after the job) and nowhere else.
  if [ "${GITHUB_ACTIONS:-}" != true ] || [ "${RUNNER_ENVIRONMENT:-}" != github-hosted ]; then
    echo "::error::load.sh runs only on a GitHub-hosted runner (GITHUB_ACTIONS=true, RUNNER_ENVIRONMENT=github-hosted)" >&2
    return 2
  fi
  repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" || return 1
  mkdir -p "$out" || { fail "Could not make $out"; return 1; }
  out="$(cd "$out" && pwd)" || { fail "Could not enter $out"; return 1; }
  summary_file="$out/summary.md"
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
    prepare_k6 "$repo" "$out" || { fail "Could not prepare the load command"; return 1; }
    # In its own process group, in the background, so a TERM reaches the trap at once and clean-up can
    # signal the whole group.
    k6_ran=1
    setsid "${k6_cmd[@]}" &
    k6_pid=$!
    wait "$k6_pid"
    k6_status=$?
    k6_pid=
    if [ "$k6_status" -ne 0 ]; then
      fail "The load run failed (exit $k6_status)"
    else
      check_summaries "$out" || true
    fi
    leak_check && leak_ok=1
    if [ "$leak_ok" -eq 1 ]; then wait_pairs || true; fi
    finish_capture
    if [ -s "$events_file" ]; then
      if lifetimes_out="$(container_lifetimes "$events_file")" && [ -n "$lifetimes_out" ]; then
        lifetimes="$lifetimes_out"
        unpaired="${lifetimes##* }"
        if [ "$leak_ok" -eq 1 ] && [ "$unpaired" != 0 ]; then
          fail "$unpaired container(s) have a create without a destroy, or a destroy without a create, though none is left, after waiting ${pair_wait}s"
        fi
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
