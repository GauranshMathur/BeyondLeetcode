#!/usr/bin/env bash
# Tests ci-gate.sh with a fake `gh` on PATH. Run: .github/ci-gate.test.sh
# Job lists mirror `gh run view --json jobs` (only the fields the gate reads). "release 1.4.0" is
# the shape of its ci run 40359423454: every test job green, publish-edge cancelled.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir "$work/bin"
cat >"$work/bin/gh" <<'FAKE'
#!/usr/bin/env bash
# gh run list ...  -> prints $FAKE_RUN_ID (empty = no run yet)
# gh run view ...  -> prints the next $FAKE_DIR/view.N file, repeating the last one
# FAKE_SLEEP makes the call slow; exec so a timeout kills the sleep itself, as it would real gh.
[ -n "${FAKE_SLEEP-}" ] && [ "$2" = "${FAKE_SLEEP_ON:-list}" ] && exec sleep "$FAKE_SLEEP"
if [ "$2" = list ]; then printf '%s' "${FAKE_RUN_ID-}"; exit 0; fi
n="$(cat "$FAKE_DIR/n" 2>/dev/null || echo 1)"
[ -f "$FAKE_DIR/view.$n" ] || n=$((n - 1))
echo $((n + 1)) >"$FAKE_DIR/n"
[ "$(cat "$FAKE_DIR/view.$n")" = EXIT1 ] && exit 1
cat "$FAKE_DIR/view.$n"
FAKE
chmod +x "$work/bin/gh"
fail=0

# jobs <name:status:conclusion>... -> the JSON of one poll
jobs() {
  local spec out=
  for spec in "$@"; do
    IFS=: read -r n s c <<<"$spec"
    out="$out{\"name\":\"$n\",\"status\":\"$s\",\"conclusion\":\"$c\"},"
  done
  printf '{"jobs":[%s]}' "${out%,}"
}
all_ok="typecheck:completed:success lint:completed:success unit:completed:success build:completed:success e2e:completed:success sandbox:completed:success docker:completed:success"
publish="publish-sandbox-node:completed:success publish-sandbox-go:completed:success"

# run <name> <expected exit> <run id> <poll JSON>...   (polls are served in order)
run() {
  local name="$1" want="$2" runid="$3" i=1 got code t0=$SECONDS
  shift 3
  rm -rf "$work/d"; mkdir "$work/d"
  for p in "$@"; do printf '%s' "$p" >"$work/d/view.$i"; i=$((i + 1)); done
  got="$(FAKE_DIR="$work/d" FAKE_RUN_ID="$runid" PATH="$work/bin:$PATH" GITHUB_REPOSITORY=o/r \
    FAKE_SLEEP=${FAKE_SLEEP-} FAKE_SLEEP_ON=${FAKE_SLEEP_ON-} CI_GATE_FIND_BUDGET=${FIND_BUDGET:-20} CI_GATE_FIND_SLEEP=${FIND_SLEEP:-0.1} CI_GATE_POLL=${POLL:-0.1} CI_GATE_TIMEOUT=${TIMEOUT:-20} \
    "$here/ci-gate.sh" abc 2>&1)"
  code=$?
  took=$((SECONDS - t0))
  if [ "$code" != "$want" ]; then
    echo "FAIL $name: exit $code, want $want"; echo "$got"; fail=1
  elif [ -n "${MAXSECS-}" ] && [ "$took" -gt "$MAXSECS" ]; then
    echo "FAIL $name: took ${took}s, more than ${MAXSECS}s"; fail=1
  else
    echo "ok   $name"
  fi
}

# The gate counts whole seconds ($SECONDS), so a budget of 1 s can run out after a few
# milliseconds when the clock ticks between its start and its first check. Cases that expect a
# result therefore get a generous default budget (20 s), and only the cases that expect a time-out
# set a short TIMEOUT or FIND_BUDGET of their own.
# shellcheck disable=SC2046,SC2086
{
  run "all tests green" 0 7 "$(jobs $all_ok $publish publish-edge:completed:success)"
  run "release 1.4.0: publish-edge cancelled" 0 7 "$(jobs $all_ok $publish publish-edge:completed:cancelled)"
  run "publish-edge still pending" 0 7 "$(jobs $all_ok publish-edge:queued:)"
  run "publish job failed" 0 7 "$(jobs $all_ok publish-sandbox-go:completed:failure publish-edge:completed:skipped)"
  run "unit failed" 1 7 "$(jobs ${all_ok/unit:completed:success/unit:completed:failure} publish-edge:completed:cancelled)"
  run "e2e cancelled" 1 7 "$(jobs ${all_ok/e2e:completed:success/e2e:completed:cancelled})"
  run "docker skipped" 1 7 "$(jobs ${all_ok/docker:completed:success/docker:completed:skipped})"
  run "failed while others still run" 1 7 "$(jobs lint:completed:failure unit:in_progress: typecheck:queued:)"
  run "job missing (renamed)" 1 7 "$(jobs ${all_ok/sandbox:completed:success/sandbox-v2:completed:success})"
  run "pending, then green" 0 7 "$(jobs ${all_ok/docker:completed:success/docker:in_progress:} typecheck:completed:success)" "$(jobs $all_ok)"
  run "pending, then failed" 1 7 "$(jobs ${all_ok/docker:completed:success/docker:queued:})" "$(jobs ${all_ok/docker:completed:success/docker:completed:failure})"
  TIMEOUT=3 run "never finishes (times out)" 1 7 "$(jobs ${all_ok/docker:completed:success/docker:in_progress:})"
  run "re-run: second poll shows the new attempt" 0 7 "$(jobs ${all_ok/e2e:completed:success/e2e:in_progress:})" "$(jobs $all_ok)"
  run "no jobs listed yet, then green" 0 7 '{"jobs":[]}' "$(jobs $all_ok)"
  run "poll error, then green" 0 7 "" "$(jobs $all_ok)"
  FIND_BUDGET=1 run "no ci run within the discovery budget" 1 "" ""
  # Same-name entries (a re-run or a matrix): every one must succeed.
  run "duplicate unit: success then failed" 1 7 "$(jobs $all_ok unit:completed:failure)"
  run "duplicate unit: failed then success" 1 7 "$(jobs unit:completed:failure $all_ok)"
  run "duplicate unit: success then cancelled" 1 7 "$(jobs $all_ok unit:completed:cancelled)"
  TIMEOUT=3 run "duplicate unit: success then running (waits, times out)" 1 7 "$(jobs $all_ok unit:in_progress:)"
  run "duplicate unit: success then running, then both green" 0 7 "$(jobs $all_ok unit:in_progress:)" "$(jobs $all_ok unit:completed:success)"
  run "unexpected conclusion text" 1 7 "$(jobs $all_ok | sed 's/"unit","status":"completed","conclusion":"success"/"unit","status":"completed","conclusion":"failure success"/')"
  run "unknown conclusion" 1 7 "$(jobs ${all_ok/unit:completed:success/unit:completed:neutral})"
  run "empty conclusion on a completed job" 1 7 "$(jobs ${all_ok/unit:completed:success/unit:completed:})"
  run "malformed JSON, then green" 0 7 "not json {" "$(jobs $all_ok)"
  run "{} , then green" 0 7 "{}" "$(jobs $all_ok)"
  run "jobs not an array, then green" 0 7 '{"jobs":"x"}' "$(jobs $all_ok)"
  run "gh exits nonzero, then green" 0 7 EXIT1 "$(jobs $all_ok)"
  TIMEOUT=3 run "gh keeps failing (deadline)" 1 7 EXIT1
  # Elapsed time: the fake gh sleeps 20 s per call; a gate that honours its bounds is back in a
  # few seconds (whole-second clock, so allow 1-2 s of slack on a loaded runner).
  FAKE_SLEEP=20 FIND_BUDGET=2 TIMEOUT=30 MAXSECS=5 run "slow run list: gives up within the discovery budget" 1 7 "$(jobs $all_ok)"
  FAKE_SLEEP=20 FIND_BUDGET=30 TIMEOUT=3 MAXSECS=6 run "slow run list: bounded by the overall timeout" 1 7 "$(jobs $all_ok)"
  FAKE_SLEEP=20 FAKE_SLEEP_ON=view TIMEOUT=3 MAXSECS=6 run "slow run view: exits within the overall timeout" 1 7 "$(jobs $all_ok)"
  POLL=30 TIMEOUT=2 MAXSECS=5 run "poll interval longer than the time left: sleep cut short" 1 7 "$(jobs ${all_ok/docker:completed:success/docker:queued:})"
  FIND_SLEEP=30 FIND_BUDGET=2 MAXSECS=5 run "discovery sleep longer than the budget: cut short" 1 "" ""
  FIND_BUDGET=0 MAXSECS=1 run "zero discovery budget exits at once" 1 7 "$(jobs $all_ok)"
  TIMEOUT=1 run "deadline expires while a job is pending" 1 7 "$(jobs ${all_ok/docker:completed:success/docker:queued:})"
}
# The test jobs are listed twice: publish-edge's `needs` in ci.yml (what gates `edge`) and the gate's
# default JOBS (what gates a release). A job added to one list alone would be waited for by one and
# ignored by the other, so the two lists must name the same jobs. CI_YML points the check at a copy.
ci_yml="${CI_YML:-$here/workflows/ci.yml}"
edge_needs="$(awk '
  /^  [A-Za-z0-9_-]+:[[:space:]]*$/ { in_job = ($1 == "publish-edge:") }
  in_job && /^    needs:/ { print; exit }' "$ci_yml")"
gate_jobs="$(sed -n 's/^JOBS="${CI_GATE_JOBS:-\(.*\)}"$/\1/p' "$here/ci-gate.sh")"
if ! [[ "$edge_needs" =~ ^[[:space:]]*needs:[[:space:]]*\[([^]]*)\][[:space:]]*$ ]]; then
  echo "FAIL job lists: publish-edge's needs in ci.yml is not a one-line [a, b] list: '$edge_needs'"; fail=1
elif [ -z "$gate_jobs" ]; then
  echo "FAIL job lists: no default JOBS line found in ci-gate.sh"; fail=1
else
  edge_sorted="$(tr ',' '\n' <<<"${BASH_REMATCH[1]}" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' | grep . | sort)"
  gate_sorted="$(tr ' ' '\n' <<<"$gate_jobs" | grep . | sort)"
  if [ "$edge_sorted" = "$gate_sorted" ]; then
    echo "ok   ci-gate.sh JOBS match publish-edge's needs in ci.yml"
  else
    echo "FAIL job lists differ: ci-gate.sh JOBS and publish-edge's needs in ci.yml must name the same jobs"
    echo "  in publish-edge needs only (the release gate would not wait for them): $(comm -23 <(echo "$edge_sorted") <(echo "$gate_sorted") | tr '\n' ' ')"
    echo "  in ci-gate.sh JOBS only (publish-edge would not wait for them): $(comm -13 <(echo "$edge_sorted") <(echo "$gate_sorted") | tr '\n' ' ')"
    fail=1
  fi
fi
exit $fail
