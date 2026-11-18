#!/usr/bin/env bash
# The load job's script (load.yml): starts a fresh Runner from the image, plays scripts/load/run.sh against
# it, checks that no labelled container is left, and reports how long each container lived. Run it only on a
# GitHub-hosted runner: the sustained scenario fills every Runner slot and queue place at once.
# Needs Docker, jq, openssl, curl, and the Bun dependencies (bun install). The Sandbox images must already be
# built under the names config.ts uses (.github/build-sandbox-images.sh).
# Usage: .github/load.sh <image> <out-dir>   e.g. .github/load.sh beyondleetcode:load "$RUNNER_TEMP/load"
#
# The functions can be sourced and run against stubs; main runs only when the file is executed.
set -uo pipefail

runner_name=bl-load-runner
runner_label=beyondleetcode.runner
runner_url=http://127.0.0.1:8787
# Waits, in seconds. Variables so a test that sources this file can shorten them.
health_wait=300
settle_wait=120
poll_every=2

failed=0
runner_started=0

fail() { echo "::error::$*" >&2; failed=1; }

# The Runner's lines hold nothing from a request, so they are printed only when the script fails.
cleanup() {
  status=$?
  set +e
  if [ "$status" -ne 0 ] || [ "$failed" -ne 0 ]; then
    if [ "$runner_started" -eq 1 ]; then docker logs "$runner_name" 2>&1; fi
  fi
  docker rm -f "$runner_name" >/dev/null 2>&1
  # Last of all, and only after the leak check has looked: whatever is still labelled goes.
  leftovers=()
  while IFS= read -r id; do
    [ -n "$id" ] && leftovers+=("$id")
  done < <(docker ps -aq --filter "label=$runner_label" 2>/dev/null)
  if [ "${#leftovers[@]}" -gt 0 ]; then docker rm -f "${leftovers[@]}" >/dev/null 2>&1; fi
  if [ "$status" -eq 0 ] && [ "$failed" -ne 0 ]; then status=1; fi
  exit "$status"
}

# Reads the token's authorization header from stdin, so the token is on no command line.
health_status() {
  printf 'header = "Authorization: Bearer %s"\n' "$RUNNER_TOKEN" |
    curl -s -o "$1" -w '%{http_code}' --config - "$runner_url/health"
}

# Waits for /health to answer 200 listing every Language the load plays.
wait_ready() {
  local body deadline code
  body="$(mktemp)" || { fail "mktemp failed"; return 1; }
  deadline=$((SECONDS + health_wait))
  while [ "$SECONDS" -lt "$deadline" ]; do
    code="$(health_status "$body" 2>/dev/null || true)"
    if [ "$code" = 200 ] &&
      jq -e '.languages | (index("python") != null) and (index("typescript") != null) and (index("go") != null)' "$body" >/dev/null 2>&1; then
      rm -f "$body"
      return 0
    fi
    sleep "$poll_every"
  done
  rm -f "$body"
  fail "The Runner was not ready within $((health_wait / 60)) minutes"
  return 1
}

start_runner() {
  docker run -d --name "$runner_name" -p 127.0.0.1:8787:8787 -e RUNNER_TOKEN \
    -v /var/run/docker.sock:/var/run/docker.sock "$1" runner >/dev/null || { fail "The Runner container did not start"; return 1; }
  runner_started=1
}

# Plays the load and keeps k6's exit status in k6_status.
run_k6() {
  local repo="$1" out="$2" slots
  slots="$(nproc)" || return 1
  LOAD_SLOTS="$slots" LOAD_OUT="$out" "$repo/scripts/load/run.sh" "$runner_url"
}

# Polls until no labelled container is left; sets settle_seconds. Fails when one remains.
leak_check() {
  local start="$SECONDS" ids deadline
  deadline=$((SECONDS + settle_wait))
  while :; do
    if ! ids="$(docker ps -aq --filter "label=$runner_label")"; then
      fail "Listing the Runner's containers failed"
      return 1
    fi
    if [ -z "$ids" ]; then
      settle_seconds=$((SECONDS - start))
      return 0
    fi
    [ "$SECONDS" -ge "$deadline" ] && break
    sleep "$poll_every"
  done
  settle_seconds=$((SECONDS - start))
  echo "Still labelled $runner_label after ${settle_wait}s:" >&2
  docker ps -a --filter "label=$runner_label" --format '{{.Names}} {{.State}}' >&2
  fail "A Runner container was left after the load"
  return 1
}

# Prints "count p50 p95 max" (seconds) of create-to-destroy times for the labelled containers since $1.
container_lifetimes() {
  local since="$1" until_ events
  until_="$(date +%s)" || return 1
  events="$(docker events --since "$since" --until "$until_" --filter type=container \
    --filter "label=$runner_label" --format '{{json .}}')" || return 1
  printf '%s\n' "$events" | jq -rs '
    [ .[] | select(.Action == "create" or .Action == "destroy") ]
    | group_by(.Actor.ID)
    | map(select(any(.Action == "create") and any(.Action == "destroy"))
        | ((map(select(.Action == "destroy"))[0].timeNano) - (map(select(.Action == "create"))[0].timeNano)) / 1e9)
    | sort
    | if length == 0 then "0 - - -"
      else . as $t | length as $n
        | def at($p): $t[((($p * $n) | ceil) - 1)];
          "\($n) \(at(0.5) | . * 1000 | round / 1000) \(at(0.95) | . * 1000 | round / 1000) \($t[-1] | . * 1000 | round / 1000)"
      end'
}

host_block() {
  local mem kernel docker_version
  mem="$(awk '/^MemTotal:/ { printf "%.1f GiB", $2 / 1048576 }' /proc/meminfo)" || return 1
  kernel="$(uname -r)" || return 1
  docker_version="$(docker version --format '{{.Server.Version}}')" || return 1
  printf '\n## Host\n\n- CPUs: %s\n- Memory: %s\n- Kernel: %s\n- Docker server: %s\n- Image: %s %s\n' \
    "$(nproc)" "$mem" "$kernel" "$docker_version" "${ImageOS:-unknown}" "${ImageVersion:-unknown}"
  printf -- '- k6 ran on this host beside the Runner and its Sandboxes, so every time includes that contention.\n'
}

# Appends the host, the commit, the settle time and the lifetimes to summary.md.
write_summary() {
  local summary="$1" commit="$2" lifetimes="$3" host date_
  host="$(host_block)" || { fail "Reading the host failed"; return 1; }
  date_="$(date -u +%Y-%m-%dT%H:%M:%SZ)" || return 1
  {
    printf '%s\n' "$host"
    printf '\n## Run\n\n- Commit: %s\n- Date: %s\n' "$commit" "$date_"
    printf -- '- Time for the labelled containers to be gone after the load: %ss\n' "${settle_seconds:-n/a}"
    read -r count p50 p95 max <<<"$lifetimes"
    printf -- '- Containers created and destroyed: %s\n- Container lifetime, create to destroy: p50 %ss, p95 %ss, max %ss\n' \
      "$count" "$p50" "$p95" "$max"
  } >>"$summary" || { fail "Writing $summary failed"; return 1; }
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

  RUNNER_TOKEN="$(openssl rand -hex 24)" || { fail "Could not make the token"; return 1; }
  [ -n "$RUNNER_TOKEN" ] || { fail "The token is empty"; return 1; }
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::add-mask::$RUNNER_TOKEN"; fi
  export RUNNER_TOKEN

  commit="${GITHUB_SHA:-$(git -C "$repo" rev-parse HEAD)}" || commit=unknown

  echo "== Runner starts and answers its health check"
  start_runner "$image" || return 1
  if wait_ready; then
    echo "== load"
    since="$(date +%s)" || since=0
    run_k6 "$repo" "$out"
    k6_status=$?
    if [ "$k6_status" -ne 0 ]; then fail "The load run failed (exit $k6_status)"; fi
    leak_check || true
    if lifetimes_out="$(container_lifetimes "$since")" && [ -n "$lifetimes_out" ]; then
      lifetimes="$lifetimes_out"
    else
      fail "Reading the container events failed"
    fi
  fi

  write_summary "$out/summary.md" "$commit" "$lifetimes" || true
  [ "$failed" -eq 0 ] && [ "$k6_status" -eq 0 ]
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
