#!/usr/bin/env bash
# Is this image ref already in the registry? Fails closed: only the registry's definite answer
# about the ref itself means "not published"; any other error fails, so a published tag is never
# overwritten. Output naming a digest (@sha256:) is never "not published": it can be one missing
# child manifest of an index that exists.
# Usage: .github/published.sh <ref>   Prints published=true|false (append it to $GITHUB_OUTPUT).
set -u
ref="${1:?usage: published.sh <image-ref>}"

if output="$(docker buildx imagetools inspect "$ref" 2>&1)"; then
  echo "published=true"
elif [[ "$output" != *@sha256:* ]] &&
  { grep -qxF "ERROR: $ref: not found" <<<"$output" || grep -qiF 'manifest unknown' <<<"$output"; }; then
  echo "published=false"
else
  echo "Could not tell whether $ref is published:" >&2
  echo "$output" >&2
  exit 1
fi
