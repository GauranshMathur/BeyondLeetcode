#!/usr/bin/env bash
# Tests lane-files.sh in a throwaway git repository. Run: .claude/hooks/lane-files.test.sh
set -u
here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
fail=0

git init -q "$work/lane" && git init -q "$work/free"
mkdir -p "$work/lane/src/routes/users" "$work/lane/.github" "$work/lane/docs/agents" "$work/lane/.claude"
printf '%s\n' '# the lane of card C1' 'src/routes/users/+page.svelte' '' 'src/lib/new/   # a new folder' >"$work/lane/.lane-files"

# check <want exit> <what> <path>
check() {
  local want="$1" what="$2" path="$3" got
  printf '{"tool_input":{"file_path":"%s"}}' "$path" | "$here/lane-files.sh" >/dev/null 2>&1
  got=$?
  if [ "$got" = "$want" ]; then echo "ok   $what"; else echo "FAIL $what: exit $got, want $want"; fail=1; fi
}

check 0 "a listed file passes" "$work/lane/src/routes/users/+page.svelte"
check 2 "a file beside a listed one is blocked" "$work/lane/src/routes/users/+page.server.ts"
check 0 "a new file under a listed folder passes" "$work/lane/src/lib/new/thing.ts"
check 2 "a new file in a new unlisted folder is blocked" "$work/lane/src/lib/other/thing.ts"
check 2 ".github is blocked unless listed" "$work/lane/.github/workflows/ci.yml"
check 2 "docs/agents is blocked unless listed" "$work/lane/docs/agents/board.md"
check 2 ".claude is blocked unless listed" "$work/lane/.claude/settings.json"
check 2 "the list itself is blocked" "$work/lane/.lane-files"
check 2 "a path that climbs out and back in is still judged" "$work/lane/src/../.github/x.yml"
check 0 "a file outside the worktree is not judged" "$work/elsewhere/notes.md"
check 0 "a worktree with no list is not restricted" "$work/free/anything.ts"
check 2 ".env is blocked everywhere" "$work/free/.env"
check 2 ".env.local is blocked everywhere" "$work/lane/.env.local"
check 2 "a key file is blocked everywhere" "$work/free/server.key"
check 0 ".env.example passes with no list" "$work/free/.env.example"
check 2 ".env.example is still held to the lane's list" "$work/lane/.env.example"

printf '{"tool_input":{}}' | "$here/lane-files.sh" >/dev/null 2>&1 && echo "ok   a call with no file path passes" || { echo "FAIL a call with no file path"; fail=1; }
exit "$fail"
