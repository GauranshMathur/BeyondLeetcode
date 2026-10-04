#!/usr/bin/env bash
# Is this image ref already in the registry? Fails closed: only the registry's definite answer
# ("manifest unknown", or buildx's "<ref>: not found") means "not published"; any other error
# fails, so a published tag is never overwritten.
# Usage: .github/published.sh <ref>   Prints published=true|false (append it to $GITHUB_OUTPUT).
set -u
ref="${1:?usage: published.sh <image-ref>}"

if output="$(docker buildx imagetools inspect "$ref" 2>&1)"; then
  echo "published=true"
elif grep -qiE 'manifest unknown|: not found$' <<<"$output"; then
  echo "published=false"
else
  echo "Could not tell whether $ref is published:" >&2
  echo "$output" >&2
  exit 1
fi
