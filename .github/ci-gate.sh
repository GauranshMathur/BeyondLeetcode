#!/usr/bin/env bash
# The release gate's wait: ci.yml's test jobs on a commit must all conclude success. The run's own
# conclusion is ignored on purpose: publish-edge sits in a concurrency group, so a newer push
# cancels it while pending and the run ends `cancelled` though every test passed. The publish-*
# jobs test nothing.
# Usage: .github/ci-gate.sh <sha>   Needs GH_TOKEN and GITHUB_REPOSITORY. Exit 0 only when every
# job in JOBS concluded success. A job still queued or running is waited for; a missing job fails.
set -u
sha="${1:?usage: ci-gate.sh <sha>}"
JOBS="${CI_GATE_JOBS:-typecheck lint unit build e2e sandbox docker}"
find_tries="${CI_GATE_FIND_TRIES:-30}" # x 10 s: about 5 minutes for the ci run to appear
poll="${CI_GATE_POLL:-15}"
find_sleep="${CI_GATE_FIND_SLEEP:-10}"
deadline=$((SECONDS + ${CI_GATE_TIMEOUT:-2400})) # a normal run takes well under 15 minutes

id=
for ((i = 0; i < find_tries; i++)); do
  id="$(timeout 60 gh run list --repo "$GITHUB_REPOSITORY" --workflow ci.yml --commit "$sha" \
    --event push --json databaseId --jq '.[0].databaseId // empty')"
  [ -n "$id" ] && break
  sleep "$find_sleep"
done
[ -n "$id" ] || { echo "No ci run found for $sha"; exit 1; }
echo "Waiting for the test jobs ($JOBS) of ci run $id"

while :; do
  # `gh run view` lists the latest attempt's jobs, so a re-run is judged by its own results.
  json="$(timeout 60 gh run view "$id" --repo "$GITHUB_REPOSITORY" --json jobs)" || json=
  if [ -n "$json" ]; then
    # One verdict per wanted job: success | failed:<conclusion> | pending | missing.
    verdicts="$(jq -r --arg wanted "$JOBS" '
      .jobs as $jobs
      | ($wanted | split(" ")[]) as $n
      | ([$jobs[] | select(.name == $n)][0]) as $j
      | "\($n) " + (
          if $j == null then (if ($jobs | length) == 0 then "pending" else "missing" end)
          elif $j.status != "completed" then "pending"
          elif $j.conclusion == "success" then "success"
          else "failed:\($j.conclusion)" end)' <<<"$json")" || verdicts=
    if [ -n "$verdicts" ]; then
      # Pure bash, no grep: a tool error must not read as "nothing failed". Only a line for every
      # wanted job, each ending in success, passes.
      bad='' pending='' ok=0 want=0
      for _ in $JOBS; do want=$((want + 1)); done
      while IFS= read -r line; do
        case "$line" in
          *" success") ok=$((ok + 1)) ;;
          *" pending") pending=1 ;;
          *) bad=1 ;;
        esac
      done <<<"$verdicts"
      if [ -n "$bad" ]; then
        echo "ci run $id did not pass its test jobs:"; echo "$verdicts"; exit 1
      fi
      if [ -z "$pending" ] && [ "$ok" = "$want" ]; then
        echo "Every test job succeeded in ci run $id"; exit 0
      fi
    fi
  fi
  [ "$SECONDS" -lt "$deadline" ] || { echo "Gave up waiting for ci run $id"; echo "${verdicts:-}"; exit 1; }
  sleep "$poll"
done
