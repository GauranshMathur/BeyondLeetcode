#!/usr/bin/env bash
# Builds every Sandbox image listed under the exact name:tag src/lib/server/runner/config.ts uses, so the
# Runner finds them locally and never pulls a tag that is only published once the change reaches main.
# The one copy of these build lines: ci's sandbox and docker jobs (through smoke.sh) call it.
# Usage: .github/build-sandbox-images.sh   (from the repo root)
set -euo pipefail

config=src/lib/server/runner/config.ts

# Every image ref in config.ts; a Language added there is built without touching this file.
refs="$(grep -o "ghcr.io/[a-z/-]*sandbox-[a-z]*:[0-9]*" "$config")"
[ -n "$refs" ] || { echo "No sandbox image found in $config" >&2; exit 1; }

for ref in $refs; do
  name="${ref##*sandbox-}"
  name="${name%%:*}"
  docker build -f "Dockerfile.sandbox-$name" -t "$ref" .
done
