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

# raw <want exit> <what> <stdin> [message fragment]: the JSON is given as is, so escapes can be tested.
raw() {
  local want="$1" what="$2" input="$3" frag="${4:-}" got err
  err="$(printf '%s' "$input" | "$here/lane-files.sh" 2>&1 >/dev/null)"
  got=$?
  if [ "$got" != "$want" ]; then echo "FAIL $what: exit $got, want $want"; fail=1
  elif [ -n "$frag" ] && [[ "$err" != *"$frag"* ]]; then echo "FAIL $what: message lacks '$frag': $err"; fail=1
  else echo "ok   $what"; fi
}

L="$work/lane"
raw 2 "a path ending in a space is blocked" "{\"tool_input\":{\"file_path\":\"$work/free/.env \"}}" "trailing whitespace"
raw 2 "a path with a newline is blocked" "{\"tool_input\":{\"file_path\":\"$work/free/a.key\\nnotes.txt\"}}" "control character"
raw 2 "a path ending in a newline is blocked" "{\"tool_input\":{\"file_path\":\"$L/src/routes/users/+page.svelte\\n\"}}" "control character"
raw 2 "a path with a carriage return is blocked" "{\"tool_input\":{\"file_path\":\"$work/free/a\\rb\"}}" "control character"
raw 2 "a path with a tab is blocked" "{\"tool_input\":{\"file_path\":\"$work/free/a\\tb\"}}" "control character"
raw 2 "a path with a NUL is blocked" "{\"tool_input\":{\"file_path\":\"$work/free/a\\u0000b\"}}" "control character"
raw 2 "a file_path that is not a string is blocked" '{"tool_input":{"file_path":5}}' "control character"

ln -s "$L/.env" "$work/free/harmless.txt"
raw 2 "a harmless-named symlink to .env is blocked" "{\"tool_input\":{\"file_path\":\"$work/free/harmless.txt\"}}" ".env holds secrets"

mkdir -p "$work/main/.git/hooks" "$work/free/.git"
raw 2 ".git/config in a clone is blocked" "{\"tool_input\":{\"file_path\":\"$work/main/.git/config\"}}" ".git directory"
raw 2 ".git/hooks in a clone is blocked" "{\"tool_input\":{\"file_path\":\"$work/main/.git/hooks/pre-commit\"}}" ".git directory"
raw 2 "a git file in a lane is blocked" "{\"tool_input\":{\"file_path\":\"$L/.git/info/exclude\"}}" ".git directory"
raw 0 ".github is not a .git component" "{\"tool_input\":{\"file_path\":\"$work/free/.github/ci.yml\"}}"

mkdir -p "$work/outside" "$L/src/lib/new"
ln -s "$work/outside" "$L/src/lib/new/out"
raw 2 "a symlink in a listed folder that leaves the worktree is blocked" "{\"tool_input\":{\"file_path\":\"$L/src/lib/new/out/x.ts\"}}" "symlink"
raw 0 "a target outside the lane's worktree is not judged" "{\"tool_input\":{\"file_path\":\"$work/outside/x.ts\"}}"

# Fails closed when it cannot read the call.
raw 2 "a stdin that is not JSON is blocked" 'not json' "could not read"
raw 2 "JSON with no tool_input is blocked" '{"other":1}' "could not read"
raw 2 "an empty stdin is blocked" '' "could not read"
fakebin="$work/nojq"
mkdir -p "$fakebin"
for t in bash cat dirname basename realpath sed git; do ln -sf "$(command -v "$t")" "$fakebin/$t"; done
err="$(printf '{"tool_input":{}}' | PATH="$fakebin" "$(command -v bash)" "$here/lane-files.sh" 2>&1 >/dev/null)"
got=$?
if [ "$got" = 2 ] && [[ "$err" == *"needs jq"* ]]; then echo "ok   no jq is blocked"; else echo "FAIL no jq: exit $got: $err"; fail=1; fi

# The settings.json command blocks when the script is missing, not executable, or crashes.
cmd="$(jq -r '.hooks.PreToolUse[0].hooks[0].command' "$here/../settings.json")"
hook_case() {
  local want="$1" what="$2" dir="$3" got
  printf '{"tool_input":{}}' | CLAUDE_PROJECT_DIR="$dir" bash -c "$cmd" >/dev/null 2>&1
  got=$?
  if [ "$got" = "$want" ]; then echo "ok   $what"; else echo "FAIL $what: exit $got, want $want"; fail=1; fi
}
mkdir -p "$work/proj/.claude/hooks"
hook_case 2 "settings command blocks when the script is missing" "$work/proj"
printf '#!/bin/sh\nexit 0\n' >"$work/proj/.claude/hooks/lane-files.sh"
hook_case 2 "settings command blocks when the script is not executable" "$work/proj"
chmod +x "$work/proj/.claude/hooks/lane-files.sh"
hook_case 0 "settings command passes when the script passes" "$work/proj"
printf '#!/bin/sh\nexit 1\n' >"$work/proj/.claude/hooks/lane-files.sh"
hook_case 2 "settings command blocks when the script crashes" "$work/proj"
printf '#!/bin/sh\nexit 2\n' >"$work/proj/.claude/hooks/lane-files.sh"
hook_case 2 "settings command keeps the script's block" "$work/proj"
hook_case 2 "settings command blocks when the project dir is unset" ""
exit "$fail"
