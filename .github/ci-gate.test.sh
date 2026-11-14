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
# ignored by the other, so the two lists must name the same jobs.
#
# Reading YAML line by line cannot be made complete, so ci.yml is held to a restricted syntax and
# anything else fails closed, as .github/check-pins.sh does for `uses`:
#   - a line where `needs` appears as a word (not followed by `.`, as in a ${{ needs.x }} expression,
#     and not on a full-line comment) must be exactly `    needs: [a, b]` or `    needs: a`, four
#     spaces, optional trailing `# comment`, and sit under a plain two-space job header `  id:`
#     inside `jobs:`, the nearest line above it with two or fewer spaces of indent;
#   - inside `jobs:` an indent of one or three spaces, a tab, an anchor or alias, a `? ` complex key
#     and a quoted key at job or job-field level fail;
#   - a job header other than the plain form fails;
#   - exactly one publish-edge job, with exactly one `needs`.
# A line the check cannot read is reported, so odd YAML can never make it pass by accident.

# check_job_lists <ci.yml> <label>: prints one "ok" or "FAIL" line (and sets fail) for the label.
check_job_lists() {
  local yml="$1" label="$2" scan edge_needs n_edge n_needs bad gate_jobs edge_sorted gate_sorted value
  scan="$(awk '
    function bad(why) { print "BAD " why ": " $0 }
    /^[ ]*$/ { next }
    /^[ ]*#/ { next }
    {
      match($0, /^[ ]*/); indent = RLENGTH
      if ($0 ~ /\t/) { bad("tab"); next }
      if (indent == 0) {
        in_jobs = ($0 ~ /^jobs:[ ]*(#.*)?$/)
        last_job = ""
        next
      }
      if (indent <= 2) {
        last_job = ""
        if (in_jobs && indent == 2) {
          if ($0 ~ /^  [A-Za-z0-9_-]+:[ ]*(#.*)?$/) {
            last_job = $0; sub(/^  /, "", last_job); sub(/:.*$/, "", last_job)
            if (last_job == "publish-edge") print "EDGE"
          } else { bad("job header is not the plain form"); next }
        }
      }
      if (in_jobs) {
        if (indent == 1 || indent == 3) bad("odd indent in jobs")
        if (indent <= 4) {
          if ($0 ~ /^[ ]*(- +)?["\047]/ || $0 ~ /^[ ]*\? / || $0 ~ /(^|[ :\[{,])&[A-Za-z0-9_-]/ || $0 ~ /(: |- )\*[A-Za-z0-9_-]/) bad("quoted key, complex key, anchor or alias")
        }
      }
      if ($0 ~ /(^|[^A-Za-z0-9_.-])needs([^A-Za-z0-9_.-]|$)/) {
        if (in_jobs && last_job != "" && $0 ~ /^    needs: +(\[[A-Za-z0-9_, -]*\]|[A-Za-z0-9_-]+)( +#.*)?$/) print "NEEDS " last_job " " $0
        else bad("needs is not the plain four-space form under a plain job header")
      }
    }' "$yml")"
  bad="$(grep '^BAD ' <<<"$scan" | head -1)"
  n_edge="$(grep -c '^EDGE$' <<<"$scan")"
  edge_needs="$(grep '^NEEDS publish-edge ' <<<"$scan" | sed 's/^NEEDS publish-edge //')"
  n_needs="$(grep -c '^NEEDS publish-edge ' <<<"$scan")"
  gate_jobs="$(sed -n 's/^JOBS="${CI_GATE_JOBS:-\(.*\)}"$/\1/p' "$here/ci-gate.sh")"
  if [ -n "$bad" ]; then
    echo "FAIL $label: ci.yml has a line outside the syntax this check can read: ${bad#BAD }"; fail=1
  elif [ "$n_edge" != 1 ]; then
    echo "FAIL $label: ci.yml has $n_edge publish-edge jobs, want exactly 1"; fail=1
  elif [ "$n_needs" != 1 ]; then
    echo "FAIL $label: publish-edge has $n_needs needs lines, want exactly 1"; fail=1
  elif [ -z "$gate_jobs" ]; then
    echo "FAIL $label: no default JOBS line found in ci-gate.sh"; fail=1
  else
    value="$(sed -E 's/^ *needs: +//; s/ +#.*$//; s/^\[//; s/\]$//' <<<"$edge_needs")"
    edge_sorted="$(tr ',' '\n' <<<"$value" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' | grep . | sort)"
    gate_sorted="$(tr ' ' '\n' <<<"$gate_jobs" | grep . | sort)"
    if [ "$edge_sorted" = "$gate_sorted" ]; then
      echo "ok   $label"
    else
      echo "FAIL $label: ci-gate.sh JOBS and publish-edge's needs in ci.yml must name the same jobs"
      echo "  in publish-edge needs only (the release gate would not wait for them): $(comm -23 <(echo "$edge_sorted") <(echo "$gate_sorted") | tr '\n' ' ')"
      echo "  in ci-gate.sh JOBS only (publish-edge would not wait for them): $(comm -13 <(echo "$edge_sorted") <(echo "$gate_sorted") | tr '\n' ' ')"
      fail=1
    fi
  fi
}

# expect_fail_lists <name> <ci.yml>: the check must report a FAIL for this copy; its own failure is
# not counted against the run.
expect_fail_lists() {
  local out saved=$fail
  out="$(check_job_lists "$2" "$1")"
  fail=$saved
  if grep -q "^FAIL $1" <<<"$out"; then echo "ok   $1 (fails as it should)"
  else echo "FAIL $1: the check did not fail on this copy"; echo "$out"; fail=1; fi
}

# CI_YML points the real check at a copy when a person runs the test by hand; under CI it is
# ignored, so a run there always checks the repository's own workflow.
ci_yml="$here/workflows/ci.yml"
if [ -z "${GITHUB_ACTIONS-}${CI-}" ]; then ci_yml="${CI_YML:-$ci_yml}"; fi
check_job_lists "$ci_yml" "ci-gate.sh JOBS match publish-edge's needs in ci.yml"

# Regression copies, each a ci.yml that an earlier or looser reading would take as matching. The job
# list comes from the gate's own JOBS line.
gate_default="$(sed -n 's/^JOBS="${CI_GATE_JOBS:-\(.*\)}"$/\1/p' "$here/ci-gate.sh")"
list="    needs: [${gate_default// /, }]"
head='jobs:
  first:
    runs-on: x
  publish-edge:
    if: true'
mkdir "$work/yml"
mk() { printf '%s\n' "$2" >"$work/yml/$1.yml"; }
mk real "$head
$list"
mk comment-header "$head
  later-job: # x
$list"
mk quoted-header "$head
  \"later-job\":
$list"
mk two-needs "$head
$list
    needs: [first]"
mk no-needs "$head"
mk two-jobs "$head
$list
  publish-edge:
$list"
mk toplevel-after "$head
run-name: |
$list"
mk three-space-fields "jobs:
  publish-edge:
   needs: [lint]
   name: |
$list"
mk quoted-needs "$head
$list
    \"needs\": [first]"
mk spaced-needs "$head
$list
    needs : [first]"
mk one-space-indent "$head
$list
 x: 1"
mk anchor "$head
    env: &a 1
$list"
mk tab "$head
$list
	x: 1"
mk needs-in-text "jobs:
  # this job needs the build
  first:
    runs-on: x
    name: \${{ needs.other.outputs.v }}
  publish-edge:
    if: true
$list # the test jobs"
check_job_lists "$work/yml/real.yml" "scratch copy shaped like ci.yml passes"
check_job_lists "$work/yml/needs-in-text.yml" "the word needs in a full-line comment or a needs.x expression is not a needs key"
expect_fail_lists "publish-edge without needs, a later job with a comment on its header" "$work/yml/comment-header.yml"
expect_fail_lists "publish-edge without needs, a later job with a quoted header" "$work/yml/quoted-header.yml"
expect_fail_lists "publish-edge with two needs lines" "$work/yml/two-needs.yml"
expect_fail_lists "publish-edge with no needs line" "$work/yml/no-needs.yml"
expect_fail_lists "two publish-edge jobs" "$work/yml/two-jobs.yml"
expect_fail_lists "a needs line inside a top-level block scalar after jobs" "$work/yml/toplevel-after.yml"
expect_fail_lists "publish-edge fields indented three spaces" "$work/yml/three-space-fields.yml"
expect_fail_lists "a quoted needs key beside the plain one" "$work/yml/quoted-needs.yml"
expect_fail_lists "a needs key with a space before the colon" "$work/yml/spaced-needs.yml"
expect_fail_lists "a one-space indent inside jobs" "$work/yml/one-space-indent.yml"
expect_fail_lists "an anchor at job-field level" "$work/yml/anchor.yml"
expect_fail_lists "a tab" "$work/yml/tab.yml"
exit $fail
