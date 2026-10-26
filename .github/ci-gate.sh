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
# left. No call or sleep is started or run past a limit. A success from a call that started before
# the deadline but returned just after it is still accepted, on purpose: a good release is not
# failed over seconds.
set -u
sha="${1:?usage: ci-gate.sh <sha>}"
JOBS="${CI_GATE_JOBS:-typecheck lint unit build e2e sandbox docker}"
find_budget="${CI_GATE_FIND_BUDGET:-300}"
poll="${CI_GATE_POLL:-15}"
find_sleep="${CI_GATE_FIND_SLEEP:-10}"
total="${CI_GATE_TIMEOUT:-2400}"
start=$SECONDS
deadline=$((start + total))

# gh_call <cap> <args>: gh with a timeout of min(60, cap, seconds left overall); the caller has
# already checked that time is left.
gh_call() {
  local cap="$1" left=$((deadline - SECONDS))
  shift
  [ "$left" -gt "$cap" ] && left=$cap
  [ "$left" -gt 60 ] && left=60
  timeout "$left" gh "$@"
}

# nap <seconds> <cap>: sleep, but never past cap or the overall deadline.
nap() {
  local n="$1" cap="$2" left=$((deadline - SECONDS))
  [ "$left" -lt "$cap" ] && cap=$left
  awk -v n="$n" -v c="$cap" 'BEGIN { exit !(c > 0) }' || return 0
  sleep "$(awk -v n="$n" -v c="$cap" 'BEGIN { print (n < c ? n : c) }')"
}

id=
while :; do
  dleft=$((find_budget - (SECONDS - start)))
  if [ "$dleft" -le 0 ] || [ "$SECONDS" -ge "$deadline" ]; then
    echo "No ci run found for $sha"; exit 1
  fi
  id="$(gh_call "$dleft" run list --repo "$GITHUB_REPOSITORY" --workflow ci.yml --commit "$sha" \
    --event push --json databaseId --jq '.[0].databaseId // empty')" || id=
  [ -n "$id" ] && break
  nap "$find_sleep" $((find_budget - (SECONDS - start)))
done
echo "Waiting for the test jobs ($JOBS) of ci run $id"

want=0
for _ in $JOBS; do want=$((want + 1)); done

while :; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "Gave up waiting for ci run $id"; exit 1
  fi
  # `gh run view` lists the latest attempt's jobs, so a re-run is judged by its own results.
  verdicts=
  if json="$(gh_call 60 run view "$id" --repo "$GITHUB_REPOSITORY" --json jobs)"; then
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
  nap "$poll" "$total"
done
