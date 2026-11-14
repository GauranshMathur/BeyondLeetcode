#!/usr/bin/env bash
# The review gate: fails a pull request that lacks the labels its changed files need
# (docs/agents/board.md, Review tiers and the gate).
#
#   Review tier 1  docs or tests only                          CI only
#   Review tier 2  anything else                               label "reviewed"
#   Review tier 3  src/lib/server/runner/, Dockerfile.sandbox-*,
#                  src/lib/server/identity/, .github/          labels "reviewed" and "security-reviewed"
#   Review tier 4  content/                                    label "human-verified", applied by the maintainer
#
# A pull request needs every label any of its files needs. The maintainer's spec names `src/` for
# tier 2; a file it does not name (package.json, the Dockerfile, prisma/, .claude/) is held to
# tier 2 as well, so nothing outside docs and tests merges unreviewed.
#
# A release-please pull request passes as tier 1: its branch is release-please's and it changes
# only the release files. A release pull request that changes anything else is judged by its files.
#
# Usage: .github/review-gate.sh <pull request number>
# Needs GH_TOKEN and GITHUB_REPOSITORY. HUMAN_LOGIN is the account that may apply "human-verified"
# (default: the repository's owner). Exit 0 when every needed label is present, 1 when one is
# missing or a GitHub call fails: the gate fails closed.
set -u
pr="${1:?usage: review-gate.sh <pull request number>}"
repo="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is not set}"
human="${HUMAN_LOGIN:-${repo%%/*}}"

files="$(gh api --paginate "repos/$repo/pulls/$pr/files" --jq '.[] | .filename, (.previous_filename // empty)')" || {
  echo "review-gate: could not list the pull request's files" >&2
  exit 1
}
labels="$(gh api --paginate "repos/$repo/issues/$pr/labels" --jq '.[].name')" || {
  echo "review-gate: could not read the pull request's labels" >&2
  exit 1
}
ref="$(gh api "repos/$repo/pulls/$pr" --jq '.head.ref')" || {
  echo "review-gate: could not read the pull request's branch" >&2
  exit 1
}
if [ -z "$files" ]; then
  echo "review-gate: the pull request lists no files" >&2
  exit 1
fi

has_label() { printf '%s\n' "$labels" | grep -Fxq -- "$1"; }

# tier_of <path>: the review tier one file needs.
tier_of() {
  case "$1" in
    content/*) echo 4 ;;
    src/lib/server/runner/* | Dockerfile.sandbox-* | src/lib/server/identity/* | .github/*) echo 3 ;;
    *.md | docs/*) echo 1 ;;
    *.test.ts | *.test.js | *.e2e.ts | *.testutil.ts | *.bun-check.ts | *.test.py | *.test.sh) echo 1 ;;
    *) echo 2 ;;
  esac
}

release_only=1
case "$ref" in release-please--*) ;; *) release_only=0 ;; esac
need_reviewed=0 need_security=0 need_human=0 top=1
while IFS= read -r f; do
  [ -n "$f" ] || continue
  case "$f" in CHANGELOG.md | package.json | .release-please-manifest.json) ;; *) release_only=0 ;; esac
  t="$(tier_of "$f")"
  [ "$t" -gt "$top" ] && top=$t
  case "$t" in
    2) need_reviewed=1 ;;
    3) need_reviewed=1 need_security=1 ;;
    4) need_human=1 ;;
  esac
  echo "tier $t  $f"
done <<<"$files"

if [ "$release_only" = 1 ]; then
  echo "review-gate: a release-please pull request that changes only the release files: tier 1, CI only"
  exit 0
fi

missing=0
if [ "$need_reviewed" = 1 ] && ! has_label reviewed; then
  echo "review-gate: needs the label \"reviewed\" (set by the orchestrator after a card-reviewer pass)" >&2
  missing=1
fi
if [ "$need_security" = 1 ] && ! has_label security-reviewed; then
  echo "review-gate: needs the label \"security-reviewed\" (set after a security pass)" >&2
  missing=1
fi
if [ "$need_human" = 1 ]; then
  if ! has_label human-verified; then
    echo "review-gate: needs the label \"human-verified\". No agent sets it; only the maintainer does." >&2
    missing=1
  else
    who="$(gh api --paginate "repos/$repo/issues/$pr/events" \
      --jq '[.[] | select(.event == "labeled" and .label.name == "human-verified")] | last | .actor.login // empty' | grep -v '^$' | tail -n 1)" || who=
    if [ "$who" != "$human" ]; then
      echo "review-gate: \"human-verified\" was applied by \"${who:-nobody the gate can find}\", not by $human" >&2
      missing=1
    fi
  fi
fi

if [ "$missing" = 1 ]; then
  echo "review-gate: review tier $top, labels missing" >&2
  exit 1
fi
echo "review-gate: review tier $top, every needed label is present"
