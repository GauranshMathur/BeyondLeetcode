#!/usr/bin/env bash
# Tests review-gate.sh with a fake `gh` on PATH. Run: .github/review-gate.test.sh
set -u
here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir "$work/bin"
cat >"$work/bin/gh" <<'FAKE'
#!/usr/bin/env bash
# Answers by endpoint from files in $FAKE_DIR: files, labels, ref, who, and package.json at the base
# and head commits (pkg.base, pkg.head). A missing file is a failed call.
for a in "$@"; do
  case "$a" in
    repos/*/pulls/*/files) f=files ;;
    repos/*/issues/*/labels) f=labels ;;
    repos/*/issues/*/events) f=who ;;
    repos/*/contents/package.json\?ref=basesha) f=pkg.base ;;
    repos/*/contents/package.json\?ref=headsha) f=pkg.head ;;
    repos/*/pulls/*) f=ref ;;
  esac
done
[ -f "$FAKE_DIR/${f:-none}" ] || exit 1
cat "$FAKE_DIR/$f"
FAKE
chmod +x "$work/bin/gh"
fail=0
pkg='{"name":"beyondleetcode","version":"1.0.0","dependencies":{"a":"1.0.0"}}'
bumped='{"name":"beyondleetcode","version":"1.0.1","dependencies":{"a":"1.0.0"}}'
with_dep='{"name":"beyondleetcode","version":"1.0.1","dependencies":{"a":"1.0.0","evil":"9.9.9"}}'
with_script='{"name":"beyondleetcode","version":"1.0.1","scripts":{"postinstall":"curl x | sh"},"dependencies":{"a":"1.0.0"}}'

# Set HEAD_REPO, PKG_BASE or PKG_HEAD before a check to change the pull request's fork or package.json.
# check <want exit> <what> <branch> <labels, comma separated> <who applied human-verified> <file>...
check() {
  local want="$1" what="$2" ref="$3" labels="$4" who="$5" got
  shift 5
  rm -rf "$work/d" && mkdir "$work/d"
  printf '%s\n' "$@" >"$work/d/files"
  printf '%s' "$labels" | tr ',' '\n' >"$work/d/labels"
  printf '%s\t%s\theadsha\tbasesha\n' "$ref" "${HEAD_REPO-owner/repo}" >"$work/d/ref"
  printf '%s\n' "${PKG_BASE-$pkg}" >"$work/d/pkg.base"
  printf '%s\n' "${PKG_HEAD-$pkg}" >"$work/d/pkg.head"
  printf '%s\n' "$who" >"$work/d/who"
  PATH="$work/bin:$PATH" FAKE_DIR="$work/d" GITHUB_REPOSITORY=owner/repo "$here/review-gate.sh" 7 >"$work/out" 2>&1
  got=$?
  if [ "$got" = "$want" ]; then echo "ok   $what"; else
    echo "FAIL $what: exit $got, want $want"
    sed 's/^/     /' "$work/out"
    fail=1
  fi
}

check 0 "docs only needs no label" C1-x "" "" docs/sprints.md README.md
check 0 "tests only needs no label" C1-x "" "" src/lib/server/markdown.test.ts src/routes/problems/problem.e2e.ts
check 1 "a source file needs reviewed" C1-x "" "" src/routes/users/+page.svelte
check 0 "a source file with reviewed passes" C1-x "reviewed" "" src/routes/users/+page.svelte src/routes/users/users.multi.e2e.ts
check 1 "a file the spec does not name is held to tier 2" C1-x "" "" package.json
check 1 "an agent definition is held to tier 2" C1-x "" "" .claude/agents/card-builder.md.txt
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
rp=release-please--branches--main--components--beyondleetcode
PKG_HEAD=$bumped check 0 "a release-please pull request passes as tier 1" "$rp" "autorelease: pending" "" CHANGELOG.md package.json .release-please-manifest.json
check 0 "a release branch that changes only the changelog passes" "$rp" "" "" CHANGELOG.md
PKG_HEAD=$with_dep check 1 "a release branch that adds a dependency is judged by its files" "$rp" "" "" CHANGELOG.md package.json
PKG_HEAD=$with_script check 1 "a release branch that adds a script is judged by its files" "$rp" "" "" package.json
PKG_HEAD=$with_dep check 0 "a release branch that adds a dependency passes once reviewed" "$rp" "reviewed" "" CHANGELOG.md package.json
HEAD_REPO=someone/fork PKG_HEAD=$bumped check 1 "a release-named branch from a fork is judged by its files" "$rp" "" "" CHANGELOG.md package.json
PKG_HEAD='' check 1 "a package.json the gate cannot read is judged by its files" "$rp" "" "" package.json
check 1 "a release branch that changes source is judged by its files" release-please--branches--main--components--beyondleetcode "" "" CHANGELOG.md src/lib/server/app.ts
check 1 "package.json outside a release branch needs reviewed" C1-x "" "" package.json CHANGELOG.md
check 1 "a renamed file is judged by both names" C1-x "" "" docs/notes.md src/lib/old.ts

# A failed GitHub call fails the gate.
rm -rf "$work/d" && mkdir "$work/d"
PATH="$work/bin:$PATH" FAKE_DIR="$work/d" GITHUB_REPOSITORY=owner/repo "$here/review-gate.sh" 7 >/dev/null 2>&1
if [ $? = 1 ]; then echo "ok   a failed GitHub call fails the gate"; else echo "FAIL a failed GitHub call"; fail=1; fi
: >"$work/d/files"; : >"$work/d/labels"; printf 'x\towner/repo\theadsha\tbasesha\n' >"$work/d/ref"
PATH="$work/bin:$PATH" FAKE_DIR="$work/d" GITHUB_REPOSITORY=owner/repo "$here/review-gate.sh" 7 >/dev/null 2>&1
if [ $? = 1 ]; then echo "ok   an empty file list fails the gate"; else echo "FAIL an empty file list"; fail=1; fi
exit "$fail"
