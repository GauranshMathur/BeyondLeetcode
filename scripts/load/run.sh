#!/usr/bin/env bash
# Load test: plays Learners submitting at once against a running Runner, through its HTTP port,
# with k6 run from Grafana's own image. It builds the Runner requests a Submission of every
# Problem's Reference Code sends (scripts/load/submissions.ts) and runs three scenarios one after
# another: one Learner alone, a class all at once, then Learners back to back for 3 minutes.
# The sustained scenario fills every Runner slot and every queue place, so run this ONLY against
# a Runner no Learner is using. The run fails only when an answer is neither a full result nor a
# clean "busy" refusal; it reports times and counts and judges none of them.
#
# Usage:  RUNNER_TOKEN=<token> LOAD_SLOTS=<S> scripts/load/run.sh <runner-url>
#   RUNNER_TOKEN  the Runner's bearer token (read from the environment, never put on a command line)
#   LOAD_SLOTS    S, the Runner's RUNNER_MAX_CONCURRENT
#   LOAD_CLASS_SIZE  Learners in the class scenario (default 20)
#   LOAD_NETWORK  the Docker network k6 joins (default host). An Instance's <compose project>_internal
#                 network reaches the Runner at http://runner:8787.
#   LOAD_OUT      where summary.md and summary.json go (default: a new temporary folder)
#   CONTENT_DIR   the content folder the requests are built from (default content)
#
# $LOAD_OUT/submissions.json holds Reference Code and Test inputs, which are in effect the
# expected outputs: it is for k6 to read and is not something to upload or share. The summary
# files hold counts and times only.
set -euo pipefail

# The k6 image, by the multi-arch index digest, never by tag alone.
# To bump: `docker buildx imagetools inspect grafana/k6:<version>`, copy its top-level "Digest:"
# (the index, not a per-platform manifest), and change the tag and digest here together.
# runner.k6.js reads k6's legacy summary shape (data.metrics.<name>.values) and throws if it
# changes; check the new version's handleSummary data before bumping.
K6_IMAGE=grafana/k6:2.4.0@sha256:d41bb79cd8de5a7ad619b53570e3712633e8bff0937010a5c6c57a4747e7a276

if [ "$#" -ne 1 ]; then
	echo "Usage: RUNNER_TOKEN=<token> LOAD_SLOTS=<S> $0 <runner-url>" >&2
	exit 2
fi
if [ -z "${RUNNER_TOKEN:-}" ]; then
	echo "RUNNER_TOKEN is not set: pass the Runner's bearer token in the environment." >&2
	exit 2
fi
if [ -z "${LOAD_SLOTS:-}" ]; then
	echo "LOAD_SLOTS is not set: pass the Runner's RUNNER_MAX_CONCURRENT." >&2
	exit 2
fi

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export RUNNER_URL="$1"
export LOAD_SLOTS
export LOAD_CLASS_SIZE="${LOAD_CLASS_SIZE:-20}"
LOAD_NETWORK="${LOAD_NETWORK:-host}"
LOAD_OUT="${LOAD_OUT:-$(mktemp -d)}"
CONTENT_DIR="${CONTENT_DIR:-content}"
mkdir -p "$LOAD_OUT"
# docker reads a -v source without a leading / as a named volume, so the folder must be absolute.
LOAD_OUT="$(cd "$LOAD_OUT" && pwd)"

(cd "$repo" && bun scripts/load/submissions.ts "$CONTENT_DIR") >"$LOAD_OUT/submissions.json"

pulled=0
for attempt in 1 2 3; do
	if docker pull --quiet "$K6_IMAGE" >/dev/null; then
		pulled=1
		break
	fi
	echo "Pulling the k6 image failed (attempt $attempt of 3)." >&2
	sleep 5
done
if [ "$pulled" -ne 1 ]; then
	echo "Could not pull $K6_IMAGE." >&2
	exit 1
fi

echo "Load test against $RUNNER_URL, slots $LOAD_SLOTS, class $LOAD_CLASS_SIZE; output in $LOAD_OUT" >&2
status=0
docker run --rm --network "$LOAD_NETWORK" --user "$(id -u):$(id -g)" \
	-v "$repo/scripts/load:/load:ro" -v "$LOAD_OUT:/out" \
	-e RUNNER_URL -e RUNNER_TOKEN -e LOAD_SLOTS -e LOAD_CLASS_SIZE \
	-e LOAD_SUBMISSIONS=/out/submissions.json \
	"$K6_IMAGE" run /load/runner.k6.js || status=$?
exit "$status"
