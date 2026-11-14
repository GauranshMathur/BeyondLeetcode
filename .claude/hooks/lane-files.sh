#!/usr/bin/env bash
# PreToolUse hook for Edit and Write. Reads the tool call as JSON on stdin; exit 2 blocks it.
#
# 1. Secret files are templates: .env, .env.*, *.pem and *.key are blocked everywhere; .env.example passes.
# 2. In a builder's worktree, only the lane's files may be edited. A builder's worktree holds a file
#    `.lane-files` at its root, written by the orchestrator at dispatch: one path per line, relative to
#    the worktree root, `#` comments and blank lines ignored. A path that ends in `/` allows everything
#    under that folder. With the file present, an Edit or Write to any other path is blocked, and so is
#    one to `.lane-files` itself. `.claude/`, `docs/agents/` and `.github/` need no rule of their own:
#    they are blocked unless the card's Files, and so `.lane-files`, name them.
# 3. A worktree with no `.lane-files` (the orchestrator's own clone) is not restricted by rule 2.
#
# This stops a mistake, not a determined builder: a shell command can still write any file. The
# card-reviewer checks the diff's files against the card, and the review gate labels the PR by path.
set -u
f="$(jq -r '.tool_input.file_path // empty' 2>/dev/null)"
[ -n "$f" ] || exit 0

b="$(basename "$f")"
case "$b" in
  .env.example) ;;
  .env | .env.* | *.pem | *.key)
    echo "Blocked: $b holds secrets. Edit .env.example (the template) instead; real values are applied locally, then reverted." >&2
    exit 2
    ;;
esac

# The folder to ask git about: the file's own folder, or its nearest existing parent for a new file.
d="$(dirname "$f")"
while [ ! -d "$d" ] && [ "$d" != / ] && [ "$d" != . ]; do d="$(dirname "$d")"; done
root="$(git -C "$d" rev-parse --show-toplevel 2>/dev/null)" || exit 0
list="$root/.lane-files"
[ -f "$list" ] || exit 0

abs="$(realpath -m -- "$f")"
case "$abs" in
  "$root"/*) rel="${abs#"$root"/}" ;;
  *) exit 0 ;; # outside this worktree: not this lane's business (a scratch file, for example)
esac

if [ "$rel" = .lane-files ]; then
  echo "Blocked: .lane-files is written by the orchestrator. If the card needs another file, report the card Blocked and name the file." >&2
  exit 2
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

echo "Blocked: $rel is not on this lane's Files (.lane-files). Edit only the files your cards name. If the card needs this file, report the card Blocked and name the file." >&2
exit 2
