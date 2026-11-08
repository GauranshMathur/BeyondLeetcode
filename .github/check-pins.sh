#!/usr/bin/env bash
# Fails when a workflow step or job names an action outside actions/* without a full commit SHA.
# Usage: .github/check-pins.sh [workflow files]   (default: every .yml/.yaml under .github/workflows)
#
# A restricted syntax, so no spelling of `uses` can slip past a regex: a `uses` key passes only as
#   [- ]uses: <value>[ # comment]
# with <value> exactly one of
#   actions/<name>[/<path>]@<ref>                       (actions/* stay on tags, as C84 chose)
#   ./<path>                                            (a local action)
#   <owner>/<repo>[/<path>]@<40 lowercase hex>          (everything else)
# Any other line where `uses` appears as a word (quoted, flow-style, escaped, spaced, value on the next
# line, trailing text) fails, and so do the YAML forms that can hide a key: quoted keys, `? ` complex
# keys and anchors. It fails closed, so a line it cannot read is reported.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
if [ "$#" -gt 0 ]; then
  files=("$@")
else
  files=()
  while IFS= read -r f; do files+=("$f"); done < <(find "$here/workflows" -type f \( -name '*.yml' -o -name '*.yaml' \) | sort)
fi
[ "${#files[@]}" -gt 0 ] || { echo "check-pins: no workflow files found" >&2; exit 1; }

bad="$(awk '
  function pinned(v,   n, path, ref) {
    if (v ~ /\.\./) return 0
    if (v ~ /^\.\/[A-Za-z0-9_.\/-]+$/) return 1
    n = index(v, "@")
    if (n == 0) return 0
    path = substr(v, 1, n - 1)
    ref = substr(v, n + 1)
    if (path !~ /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.\/-]+)?$/) return 0
    if (path ~ /^actions\//) return ref ~ /^[A-Za-z0-9_.\/-]+$/
    return length(ref) == 40 && ref ~ /^[0-9a-f]+$/
  }
  /^[ ]*#/ { next }
  {
    ok = 0
    if ($0 ~ /^[ ]*(- +)?uses: +[A-Za-z0-9_.\/@-]+( +#.*)? *$/) {
      v = $0
      sub(/^[ ]*(- +)?uses: +/, "", v)
      sub(/[ #].*$/, "", v)
      ok = pinned(v)
    } else if ($0 !~ /(^|[^A-Za-z0-9_])uses([^A-Za-z0-9_]|$)/ \
               && $0 !~ /^[ ]*(- +)?["\047][^"\047]*["\047] *:/ \
               && $0 !~ /[{,] *["\047][^"\047]*["\047] *:/ \
               && $0 !~ /^[ ]*(- +)?\? / \
               && $0 !~ /(^|[ :\[{,])&[A-Za-z0-9_-]/) {
      ok = 1
    }
    if (!ok) print FILENAME ":" FNR ": " $0
  }' "${files[@]}")"

if [ -n "$bad" ]; then
  echo "These lines are not an action pinned by a full 40-hex commit SHA (or an actions/* ref, or a ./ path) in the canonical 'uses: <ref>' form:" >&2
  echo "$bad" >&2
  exit 1
fi
