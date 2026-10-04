#!/usr/bin/env bash
# Builds both Sandbox images under the exact name:tag src/lib/server/runner/config.ts uses, so the
# Runner finds them locally and never pulls a tag that is only published once the change reaches main.
# The one copy of these build lines: ci's sandbox, e2e and docker jobs (through smoke.sh) call it.
# Usage: .github/build-sandbox-images.sh   (from the repo root)
set -euo pipefail

config=src/lib/server/runner/config.ts

for lang in node go; do
  ref="$(grep -o "ghcr.io/[a-z/-]*sandbox-$lang:[0-9]*" "$config")"
  [ -n "$ref" ] || { echo "No sandbox-$lang image found in $config" >&2; exit 1; }
  docker build -f "Dockerfile.sandbox-$lang" -t "$ref" .
done
