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

# An alias that reaches into the lane's worktree from outside is judged like the path itself.
mkdir -p "$work/alias"
ln -s "$L/src/lib/other" "$work/alias/unlisted"
ln -s "$L/src/routes/users" "$work/alias/listed"
ln -s "$L/.lane-files" "$work/alias/list"
ln -s "$L" "$work/alias/root"
raw 2 "an alias to an unlisted folder is blocked" "{\"tool_input\":{\"file_path\":\"$work/alias/unlisted/thing.ts\"}}" "not on this lane's Files"
raw 0 "an alias to a listed file's folder is allowed" "{\"tool_input\":{\"file_path\":\"$work/alias/listed/+page.svelte\"}}"
raw 2 "an alias to .lane-files is blocked" "{\"tool_input\":{\"file_path\":\"$work/alias/list\"}}" ".lane-files is written by the orchestrator"
raw 2 "an alias to the worktree root and an unlisted file is blocked" "{\"tool_input\":{\"file_path\":\"$work/alias/root/src/lib/other/x.ts\"}}" "not on this lane's Files"
raw 2 "an alias to the worktree's .env is blocked" "{\"tool_input\":{\"file_path\":\"$work/alias/root/.env\"}}" ".env holds secrets"
raw 2 "a /proc/self/root alias to an unlisted file is blocked" "{\"tool_input\":{\"file_path\":\"/proc/self/root$L/src/lib/other/x.ts\"}}" "not on this lane's Files"
raw 0 "a /proc/self/root alias to a listed file is allowed" "{\"tool_input\":{\"file_path\":\"/proc/self/root$L/src/routes/users/+page.svelte\"}}"
raw 2 "a /proc/self/root alias to .lane-files is blocked" "{\"tool_input\":{\"file_path\":\"/proc/self/root$L/.lane-files\"}}" ".lane-files is written by the orchestrator"

# A secret check does not depend on external commands such as basename.
raw 2 "a secret file with a trailing slash is blocked" "{\"tool_input\":{\"file_path\":\"$work/free/.env/\"}}" ".env holds secrets"
nobase="$work/nobase"
mkdir -p "$nobase"
for t in bash cat jq realpath; do ln -sf "$(command -v "$t")" "$nobase/$t"; done
printf '#!/bin/sh\nexit 1\n' >"$nobase/basename"
chmod +x "$nobase/basename"
err="$(printf '{"tool_input":{"file_path":"%s/.env"}}' "$work/free" | PATH="$nobase" "$(command -v bash)" "$here/lane-files.sh" 2>&1 >/dev/null)"
got=$?
if [ "$got" = 2 ] && [[ "$err" == *"holds secrets"* ]]; then echo "ok   a failing basename does not let .env through"; else echo "FAIL a failing basename: exit $got: $err"; fail=1; fi
printf '#!/bin/sh\nexit 1\n' >"$nobase/dirname"
chmod +x "$nobase/dirname"
err="$(printf '{"tool_input":{"file_path":"%s/src/lib/other/x.ts"}}' "$L" | PATH="$nobase" "$(command -v bash)" "$here/lane-files.sh" 2>&1 >/dev/null)"
got=$?
if [ "$got" = 2 ]; then echo "ok   a failing dirname does not let an unlisted file through"; else echo "FAIL a failing dirname: exit $got"; fail=1; fi
rm -f "$nobase/realpath"
printf '#!/bin/sh\nexit 1\n' >"$nobase/realpath"
chmod +x "$nobase/realpath"
err="$(printf '{"tool_input":{"file_path":"%s/.env"}}' "$work/free" | PATH="$nobase" "$(command -v bash)" "$here/lane-files.sh" 2>&1 >/dev/null)"
got=$?
if [ "$got" = 2 ]; then echo "ok   a failing realpath blocks"; else echo "FAIL a failing realpath: exit $got"; fail=1; fi

# settings.json asks Claude Code to block when the hook fails or times out.
if [ "$(jq -r '.hooks.PreToolUse[0].hooks[0].onFailure' "$here/../settings.json")" = block ]; then echo "ok   the hook blocks when it fails or times out"; else echo "FAIL onFailure is not block"; fail=1; fi

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
