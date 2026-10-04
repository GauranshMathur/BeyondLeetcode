#!/usr/bin/env bash
# Tests published.sh with a fake `docker` on PATH. Run: .github/published.test.sh
set -u
here="$(cd "$(dirname "$0")" && pwd)"
bin="$(mktemp -d)"
trap 'rm -rf "$bin"' EXIT
ref="ghcr.io/o/img:1"
fail=0

# check <name> <fake exit code> <fake output> <expected stdout> <expected exit>
check() {
  printf '#!/bin/sh\nprintf "%%s\\n" "$FAKE_OUT"\nexit $FAKE_CODE\n' >"$bin/docker"
  chmod +x "$bin/docker"
  got="$(FAKE_CODE="$2" FAKE_OUT="$3" PATH="$bin:$PATH" "$here/published.sh" "$ref" 2>/dev/null)"
  code=$?
  if [ "$got" != "$4" ] || [ "$code" != "$5" ]; then
    echo "FAIL $1: got '$got' exit $code"
    fail=1
  else
    echo "ok   $1"
  fi
}

check "exists" 0 "Name: $ref" "published=true" 0
check "exact not found" 1 "ERROR: $ref: not found" "published=false" 0
check "manifest unknown" 1 "ERROR: manifest unknown" "published=false" 0
check "child manifest not found" 1 "ERROR: ghcr.io/o/img@sha256:abc: not found" "" 1
check "child manifest unknown" 1 "ERROR: ghcr.io/o/img@sha256:abc: manifest unknown" "" 1
check "other ref not found" 1 "ERROR: ghcr.io/o/other:1: not found" "" 1
check "multi-line with not found line" 1 "$(printf 'warn\nERROR: %s: not found\nERROR: x@sha256:a: not found' "$ref")" "" 1
check "auth error" 1 "ERROR: denied: permission_denied" "" 1
check "credential helper missing" 1 'error: exec: "docker-credential-x": executable file not found in $PATH' "" 1
exit $fail
