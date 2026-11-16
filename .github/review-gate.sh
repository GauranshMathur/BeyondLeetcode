#!/usr/bin/env bash
# The review gate: fails a pull request that lacks the labels its changed files need
# (docs/agents/board.md, Review tiers and the gate).
#
#   Review tier 1  docs or tests only                          CI only
#   Review tier 2  anything else (including .claude/)          label "reviewed"
#   Review tier 3  src/lib/server/runner/, Dockerfile.sandbox-*,
#                  src/lib/server/identity/, .github/          labels "reviewed" and "security-reviewed"
#   Review tier 4  content/                                    label "human-verified", applied by the maintainer
#
# A pull request needs every label any of its files needs. The maintainer's spec names `src/` for
# tier 2; a file it does not name (package.json, the Dockerfile, prisma/, .claude/) is held to
# tier 2 as well, so nothing outside docs and tests merges unreviewed.
#
# A release-please pull request passes as tier 1 only when all of these hold: its branch is
# release-please's (`release-please--*`) and lives in this repository, not a fork; it changes only
# CHANGELOG.md, package.json and .release-please-manifest.json; and package.json, compared as raw
# text with the base's, differs in exactly one line, the `"version": "..."` line, and the files API
# says package.json was modified. Anything else on such a branch is judged by its files. The branch
# name alone proves little: every agent pushes as the maintainer's account, so the content checks
# carry the rule.
#
# Usage: .github/review-gate.sh <pull request number>
# Needs GH_TOKEN and GITHUB_REPOSITORY. HUMAN_LOGIN is the account that may apply "human-verified"
# (default: the repository's owner). Exit 0 when every needed label is present, 1 when one is
# missing. The gate fails closed: every `gh` call has its output and exit status captured apart, a
# non-zero status exits 1, and what came back is validated (shape, types, shas, counts) before it is
# used. The one exception is the two package.json fetches of the release exemption: if either
# fails, the pull request is judged by its files, never exempted.
#
# What the gate does not do, so nobody reads more into a green check:
#   - A label is not tied to a commit. A push after "reviewed" is set leaves the gate green; the
#     process's answer is that the orchestrator merges pinned to the head that was reviewed.
#   - A label removed after a green run leaves a stale green check until the next run; the
#     concurrency group only cancels a run that is still in flight.
#   - The owner check on "human-verified" cannot tell an agent from the maintainer while every
#     agent uses the maintainer's account.
set -u
pr="${1:?usage: review-gate.sh <pull request number>}"
repo="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is not set}"
human="${HUMAN_LOGIN:-${repo%%/*}}"

die() {
  echo "review-gate: $1" >&2
  exit 1
}

# api <what> <gh api arguments...>: the reply goes to $out. A failed call exits 1 whatever it printed.
api() {
  local what="$1" rc
  shift
  out="$(gh api "$@")"
  rc=$?
  [ "$rc" -eq 0 ] || die "could not read $what (gh exited $rc)"
}

# jqs <what> <jq arguments...>: jq over $out into $res, as its own checked step.
jqs() {
  local what="$1" rc
  shift
  res="$(printf '%s' "$out" | jq "$@")"
  rc=$?
  [ "$rc" -eq 0 ] || die "the reply for $what was not what the gate expected"
}

# The pull request.
api "the pull request" "repos/$repo/pulls/$pr"
jqs "the pull request's branch" -er '.head.ref | select(type == "string" and length > 0)'
ref="$res"
jqs "the pull request's head repository" -er '(.head.repo.full_name // "") | select(type == "string")'
head_repo="$res"
jqs "the pull request's head commit" -er '.head.sha | select(type == "string" and test("^[0-9a-f]{40}$"))'
head_sha="$res"
jqs "the pull request's base commit" -er '.base.sha | select(type == "string" and test("^[0-9a-f]{40}$"))'
base_sha="$res"
jqs "the pull request's file count" -er '.changed_files | select(type == "number" and . >= 0 and . == floor)'
changed_files="$res"

# The files, kept as JSON until every name is known to hold no control character.
api "the pull request's files" --paginate --slurp "repos/$repo/pulls/$pr/files"
jqs "the pull request's files" -c 'if type == "array" and all(.[]; type == "array" and all(.[]; type == "object"))
  then [.[][] | {filename, previous_filename, status}] else error("shape") end'
files_json="$res"
printf '%s' "$files_json" | jq -e '[.[] | (.filename, (.previous_filename // empty)) | select(type != "string" or test("[\\x00-\\x1f\\x7f]"))] | length == 0' >/dev/null ||
  die "a file name is missing or holds a control character"
listed="$(printf '%s' "$files_json" | jq -r 'length')" || die "could not count the pull request's files"
if [ "$listed" -ge 3000 ] || [ "$listed" -ne "$changed_files" ]; then
  die "the pull request is too large for the gate to judge ($listed files listed, $changed_files changed, and the files API stops at 3000)"
fi
[ "$listed" -gt 0 ] || die "the pull request lists no files"
names="$(printf '%s' "$files_json" | jq -r '.[] | .filename, (.previous_filename // empty)')" || die "could not read the file names"

# The labels.
api "the pull request's labels" --paginate --slurp "repos/$repo/issues/$pr/labels"
jqs "the pull request's labels" -c 'if type == "array" and all(.[]; type == "array")
  then [.[][] | .name] else error("shape") end | if all(.[]; type == "string") then . else error("shape") end'
labels_json="$res"
has_label() { printf '%s' "$labels_json" | jq -e --arg n "$1" 'any(.[]; . == $n)' >/dev/null 2>&1; }

# tier_of <path>: the review tier one file needs.
tier_of() {
  case "$1" in
    content/*) echo 4 ;;
    src/lib/server/runner/* | Dockerfile.sandbox-* | src/lib/server/identity/* | .github/*) echo 3 ;;
    .claude/*) echo 2 ;;
    *.md | docs/*) echo 1 ;;
    *.test.ts | *.test.js | *.e2e.ts | *.testutil.ts | *.bun-check.ts | *.test.py | *.test.sh) echo 1 ;;
    *) echo 2 ;;
  esac
}

release_only=1
case "$ref" in release-please--*) ;; *) release_only=0 ;; esac
[ "$head_repo" = "$repo" ] || release_only=0
touches_package=0
need_reviewed=0 need_security=0 need_human=0 top=1
while IFS= read -r f; do
  [ -n "$f" ] || continue
  case "$f" in
    package.json) touches_package=1 ;;
    CHANGELOG.md | .release-please-manifest.json) ;;
    *) release_only=0 ;;
  esac
  t="$(tier_of "$f")"
  [ "$t" -gt "$top" ] && top=$t
  case "$t" in
    2) need_reviewed=1 ;;
    3) need_reviewed=1 need_security=1 ;;
    4) need_human=1 ;;
  esac
  echo "tier $t  $f"
done <<<"$names"

# package.json may differ from the base in its version line and nothing else. Any fetch failure, or
# anything but exactly that, means the pull request is judged by its files.
version_line='^[[:space:]]*"version": "[^"\\]+",?$'
package_only_version() {
  local status before after n i changed=0 line_b line_a ver_b ver_a
  status="$(printf '%s' "$files_json" | jq -r '[.[] | select(.filename == "package.json")] | if length == 1 then .[0].status else "" end')" || return 1
  [ "$status" = modified ] || return 1
  before="$(gh api -H 'Accept: application/vnd.github.raw' "repos/$repo/contents/package.json?ref=$base_sha")" || return 1
  after="$(gh api -H 'Accept: application/vnd.github.raw' "repos/$repo/contents/package.json?ref=$head_sha")" || return 1
  [ -n "$before" ] && [ -n "$after" ] || return 1
  local -a a b
  mapfile -t b <<<"$before"
  mapfile -t a <<<"$after"
  [ "${#a[@]}" -eq "${#b[@]}" ] || return 1
  n="${#a[@]}"
  for ((i = 0; i < n; i++)); do
    if [ "${a[i]}" != "${b[i]}" ]; then
      changed=$((changed + 1))
      line_b="${b[i]}" line_a="${a[i]}"
    fi
  done
  [ "$changed" -eq 1 ] || return 1
  [[ "$line_b" =~ $version_line ]] && [[ "$line_a" =~ $version_line ]] || return 1
  # The changed line must be the top-level version, not a nested key of the same name.
  ver_b="$(printf '%s' "$before" | jq -er '.version | select(type == "string")')" || return 1
  ver_a="$(printf '%s' "$after" | jq -er '.version | select(type == "string")')" || return 1
  [ "$ver_b" != "$ver_a" ]
}
if [ "$release_only" = 1 ] && [ "$touches_package" = 1 ]; then
  if ! package_only_version; then
    echo "review-gate: a release branch whose package.json changes more than its version is judged by its files" >&2
    release_only=0
  fi
fi

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
    # Every page of the history, then the last "human-verified" labeling over all of it: its actor
    # must be the owner. No such event, a null actor or a malformed reply fails.
    api "the pull request's events" --paginate --slurp "repos/$repo/issues/$pr/events"
    jqs "the pull request's events" -er 'if type == "array" and all(.[]; type == "array") then
      ([.[][] | select(.event == "labeled" and .label.name == "human-verified")] | last | .actor.login | select(type == "string" and length > 0))
      else error("shape") end'
    who="$res"
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
