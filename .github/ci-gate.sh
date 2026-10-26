#!/usr/bin/env bash
# The release gate's wait: ci.yml's test jobs on a commit must all conclude success. The run's own
# conclusion is ignored on purpose: publish-edge sits in a concurrency group, so a newer push
# cancels it while pending and the run ends `cancelled` though every test passed. The publish-*
# jobs test nothing.
# Usage: .github/ci-gate.sh <sha>   Needs GH_TOKEN and GITHUB_REPOSITORY. Exit 0 only when every
# job in JOBS has at least one entry and every entry with that name concluded success. A job still
# queued or running is waited for; a missing job, or any other conclusion, fails.
# Bounds (seconds, by the clock): the ci run must appear within CI_GATE_FIND_BUDGET (300), the
# whole gate gives up after CI_GATE_TIMEOUT (2400), and each gh call is capped at 60 or the time
# left. A success that arrives just after the deadline is still accepted.
set -u
sha="${1:?usage: ci-gate.sh <sha>}"
JOBS="${CI_GATE_JOBS:-typecheck lint unit build e2e sandbox docker}"
find_budget="${CI_GATE_FIND_BUDGET:-300}"
poll="${CI_GATE_POLL:-15}"
find_sleep="${CI_GATE_FIND_SLEEP:-10}"
total="${CI_GATE_TIMEOUT:-2400}"
start=$SECONDS
deadline=$((start + total))

# gh_call <args>: gh with a timeout of min(60, seconds left, at least 1).
gh_call() {
  local left=$((deadline - SECONDS))
  [ "$left" -gt 60 ] && left=60
  [ "$left" -lt 1 ] && left=1
  timeout "$left" gh "$@"
}

id=
while :; do
  id="$(gh_call run list --repo "$GITHUB_REPOSITORY" --workflow ci.yml --commit "$sha" \
    --event push --json databaseId --jq '.[0].databaseId // empty')" || id=
  [ -n "$id" ] && break
  if [ $((SECONDS - start)) -ge "$find_budget" ] || [ "$SECONDS" -ge "$deadline" ]; then
    echo "No ci run found for $sha"; exit 1
  fi
  sleep "$find_sleep"
done
echo "Waiting for the test jobs ($JOBS) of ci run $id"

want=0
for _ in $JOBS; do want=$((want + 1)); done

while :; do
  # `gh run view` lists the latest attempt's jobs, so a re-run is judged by its own results.
  verdicts=
  if json="$(gh_call run view "$id" --repo "$GITHUB_REPOSITORY" --json jobs)"; then
    # One line per wanted job: "<name> <token>", token one of success | pending | failed | missing,
    # worst over every job entry of that name. Anything unexpected (conclusion text, shape) is
    # failed or pending, never success.
    verdicts="$(jq -r --arg wanted "$JOBS" '
      (.jobs | if type == "array" then . else [] end) as $jobs
      | ($wanted | split(" ")[]) as $n
      | [$jobs[] | select(.name == $n)] as $m
      | "\($n) " + (
          if ($m | length) == 0 then (if ($jobs | length) == 0 then "pending" else "missing" end)
          elif any($m[]; .status == "completed" and .conclusion != "success") then "failed"
          elif any($m[]; .status != "completed") then "pending"
          else "success" end)' <<<"$json")" || verdicts=
  fi
  lines=0 ok=0 bad=''
  if [ -n "$verdicts" ]; then
    while IFS= read -r line; do
      lines=$((lines + 1))
      case "${line##* }" in
        success) ok=$((ok + 1)) ;;
        pending) ;;
        *) bad=1 ;;
      esac
    done <<<"$verdicts"
    if [ -n "$bad" ]; then
      echo "ci run $id did not pass its test jobs:"; echo "$verdicts"; exit 1
    fi
    if [ "$lines" = "$want" ] && [ "$ok" = "$want" ]; then
      echo "Every test job succeeded in ci run $id"; exit 0
    fi
  fi
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "Gave up waiting for ci run $id"; echo "$verdicts"; exit 1
  fi
  sleep "$poll"
done
