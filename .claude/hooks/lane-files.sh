#!/usr/bin/env bash
# PreToolUse hook for Edit and Write. Reads the tool call as JSON on stdin; exit 2 blocks it.
# It fails closed: with no `jq`, or a stdin that is not JSON with a `tool_input`, it blocks. (settings.json
# also blocks when this script is missing, not executable or crashes.) A call with valid JSON and no
# `file_path` passes.
#
# 1. A file_path that holds a control character (newline, carriage return, tab, NUL) or ends in
#    whitespace is blocked first: such a name defeats exact matching.
# 2. Secret files are templates: .env, .env.*, *.pem and *.key are blocked everywhere (the name as
#    supplied and the name after symlinks are resolved); .env.example passes.
# 3. Any path with a `.git` component is blocked, everywhere: the main clone's .git/config and
#    .git/hooks, or a worktree's git directory, are not for a builder to edit.
# 4. In a builder's worktree, only the lane's files may be edited. A worktree holds a file
#    `.lane-files` at its root, written by the orchestrator whenever it creates or recreates the
#    worktree: one bare path per line relative to the worktree root, a folder ends in `/` and allows
#    everything under it, `#` starts a comment, blank lines are ignored. With the file present, an Edit
#    or Write to any other path is blocked, and so is one to `.lane-files` itself, and so is a path
#    inside the worktree whose symlinks lead outside it. `.claude/`, `docs/agents/` and `.github/` need
#    no rule of their own: they are blocked unless the card's Files, and so `.lane-files`, name them.
# 5. A worktree with no `.lane-files` is not restricted by rule 4. The file is git-ignored, so a
#    recreated worktree has none until the orchestrator writes it again.
#
# What this does not guard: a target outside the lane's own worktree (the main clone, another checkout,
# a scratch file) is not judged, because the hook cannot know which agent is calling. The lane rule
# guards the lane's worktree against a wrong file; the main clone is not guarded by it, and builders are
# told never to edit there. A shell command can still write any file. The card-reviewer checks the
# diff's files against the card, and the review gate labels the PR by path.
set -u

block() {
  echo "Blocked: $1" >&2
  exit 2
}

command -v jq >/dev/null 2>&1 || block "the lane-files hook needs jq and cannot find it."
input="$(cat)"
printf '%s' "$input" | jq -e 'type == "object" and (.tool_input | type == "object")' >/dev/null 2>&1 ||
  block "the lane-files hook could not read the tool call (not JSON with a tool_input)."

verdict="$(printf '%s' "$input" | jq -r '
  (.tool_input.file_path // "") as $p
  | if ($p | type) != "string" then "bad"
    elif ($p | test("[\\x00-\\x1f\\x7f]|[[:space:]]$")) then "bad"
    else "ok" end' 2>/dev/null)" || block "the lane-files hook could not read the file path."
[ "$verdict" = ok ] || block "a file path with a control character (newline, tab, NUL) or trailing whitespace is not allowed."

f="$(printf '%s' "$input" | jq -j '.tool_input.file_path // ""' 2>/dev/null)" || block "the lane-files hook could not read the file path."
[ -n "$f" ] || exit 0

resolved="$(realpath -m -- "$f")" || block "the lane-files hook could not resolve $f."
lexical="$(realpath -m -s -- "$f")" || block "the lane-files hook could not resolve $f."

for b in "$(basename -- "$f")" "$(basename -- "$resolved")"; do
  case "$b" in
    .env.example) ;;
    .env | .env.* | *.pem | *.key)
      block "$b holds secrets. Edit .env.example (the template) instead; real values are applied locally, then reverted."
      ;;
  esac
done

for p in "$f" "$resolved" "$lexical"; do
  case "/$p/" in
    */.git/*) block "$f is inside a .git directory; builders do not edit git's own files." ;;
  esac
done

# The worktree this path is lexically inside: the nearest ancestor holding a .lane-files.
root=""
d="$(dirname -- "$lexical")"
while :; do
  if [ -f "$d/.lane-files" ]; then
    root="$d"
    break
  fi
  [ "$d" = / ] && break
  d="$(dirname -- "$d")"
done
[ -n "$root" ] || exit 0
list="$root/.lane-files"

rootreal="$(realpath -- "$root")" || block "the lane-files hook could not resolve the worktree."
case "$resolved" in
  "$rootreal"/*) rel="${resolved#"$rootreal"/}" ;;
  *) block "$f leads outside this worktree through a symlink." ;;
esac

if [ "$rel" = .lane-files ]; then
  block ".lane-files is written by the orchestrator. If the card needs another file, report the card Blocked and name the file."
fi

while IFS= read -r line || [ -n "$line" ]; do
  line="${line%%#*}"
  line="$(printf '%s' "$line" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
  [ -n "$line" ] || continue
  case "$line" in
    */) case "$rel" in "$line"*) exit 0 ;; esac ;;
    *) [ "$rel" = "$line" ] && exit 0 ;;
  esac
done <"$list"

block "$rel is not on this lane's Files (.lane-files). Edit only the files your cards name. If the card needs this file, report the card Blocked and name the file."
