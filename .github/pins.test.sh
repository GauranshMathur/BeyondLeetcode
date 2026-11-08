#!/usr/bin/env bash
# Tests check-pins.sh on fixture workflows. Run: .github/pins.test.sh
set -u
here="$(cd "$(dirname "$0")" && pwd)"
dir="$(mktemp -d)"
trap 'rm -rf "$dir"' EXIT
sha=0123456789abcdef0123456789abcdef01234567
fail=0

# check <name> <expected exit> <workflow text, printf-escaped>
check() {
  printf "$3\n" >"$dir/w.yml"
  "$here/check-pins.sh" "$dir/w.yml" >/dev/null 2>&1
  code=$?
  if [ "$code" != "$2" ]; then
    echo "FAIL $1: exit $code, wanted $2"
    fail=1
  else
    echo "ok   $1"
  fi
}

# Valid
check "pinned with comment" 0 "      - uses: docker/login-action@$sha # v4.7.0"
check "pinned job-level reusable workflow" 0 "    uses: o/r/.github/workflows/a.yml@$sha"
check "actions tag" 0 "      - uses: actions/checkout@v7"
check "local action" 0 "      - uses: ./.github/actions/x"
check "comment line mentioning uses" 0 "      # uses: docker/login-action@v4"
check "unrelated line" 0 "      - run: echo hello"
# Unpinned or not a 40-hex ref
check "tag" 1 "      - uses: docker/login-action@v4"
check "branch" 1 "      - uses: docker/login-action@main"
check "39 hex" 1 "      - uses: docker/login-action@${sha%?}"
check "41 hex" 1 "      - uses: docker/login-action@${sha}0"
check "uppercase hex" 1 "      - uses: docker/login-action@$(echo $sha | tr a-f A-F)"
check "no ref" 1 "      - uses: docker/login-action"
check "docker image" 1 "      - uses: docker://alpine:3"
# (a) a quoted name containing ' #' in a flow mapping
check "a: flow step with # in name" 1 "      - {name: 'Login # registry', uses: docker/login-action@v4}"
check "flow step" 1 "      - {uses: docker/login-action@v4}"
# (b) a suffix after the sha
check "b: sha then ,mutable" 1 "      - uses: docker/login-action@$sha,mutable"
check "sha then text" 1 "      - uses: docker/login-action@${sha}x"
# (c) quoted and escaped keys
check "c: quoted key" 1 "      - \"uses\": docker/login-action@v4"
check "c: single-quoted key" 1 "      - 'uses': docker/login-action@v4"
check "c: escaped key" 1 "      - \"us\\\\x65s\": docker/login-action@v4"
check "c: escaped key in flow" 1 "      - {\"us\\\\x65s\": docker/login-action@v4}"
# (d) a complex key
check "d: complex key" 1 "      - ? uses\n        : docker/login-action@v4"
check "d: complex key, any name" 1 "      - ? \"u\"\n        : docker/login-action@v4"
# Found in review round 2
check "tagged escaped key" 1 "      - !!str \"us\\\\x65s\": docker/login-action@v4"
check "multiline quoted key" 1 "      - \"us\\\\\n        es\": docker/login-action@v4"
check "continuation folds into value" 1 "      - uses: docker/login-action@$sha\n          mutable"
check "next sibling key is fine" 0 "      - uses: docker/login-action@$sha\n        with:\n          x: y"
check "comment fakes a block scalar" 1 "      steps: # : |\n      - \"us\\\\x65s\": docker/login-action@v4"
check "multi-line flow mapping" 1 "      - {name: x,\n         uses: docker/login-action@v4\n        }"
check "multi-line flow mapping, pinned" 1 "      - {name: x,\n         uses: docker/login-action@$sha\n        }"
check "script with quotes and colons" 0 "        run: |\n          trap 'echo \"::warning::x\"; exit 0' ERR"
# Other spellings
check "space before colon" 1 "      - uses : docker/login-action@v4"
check "value on next line" 1 "      - uses:"
check "quoted value" 1 "      - uses: \"docker/login-action@$sha\""
check "trailing text" 1 "      - uses: docker/login-action@$sha extra"
check "tab" 1 "      - uses:\tdocker/login-action@v4"
check "anchor" 1 "      - &step uses: docker/login-action@v4"
check "uses in a run line" 1 "        run: echo uses"
"$here/check-pins.sh" "$dir/does-not-exist.yml" >/dev/null 2>&1 && { echo "FAIL missing file passed"; fail=1; } || echo "ok   missing file"
exit "$fail"
