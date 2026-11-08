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
for f in "${files[@]}"; do
  [ -f "$f" ] || { echo "check-pins: $f is not a file" >&2; exit 1; }
done

out="$(mktemp)"
trap 'rm -f "$out"' EXIT
awk '
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
  FNR == 1 { block = -1; usescol = -1 }
  /^[ ]*$/ { next }
  /^[ ]*#/ { next }
  {
    line = $0
    match(line, /^[ ]*/); indent = RLENGTH
    body = substr(line, indent + 1)
    col = indent
    if (body ~ /^- +/) { match(body, /^- +/); col = indent + RLENGTH; body = substr(body, RLENGTH + 1) }

    # Inside a block scalar (run: |) the text is a script, not YAML; the uses and anchor rules still apply.
    inblock = 0
    if (block >= 0) { if (indent > block) inblock = 1; else block = -1 }

    ok = 0
    if (usescol >= 0 && indent > usescol) {
      ok = 0   # a continuation line would fold into the accepted value
    } else if (line ~ /^[ ]*(- +)?uses: +[A-Za-z0-9_.\/@-]+( +#.*)? *$/) {
      v = body
      sub(/^uses: +/, "", v)
      sub(/[ #].*$/, "", v)
      ok = pinned(v)
    } else if (line !~ /(^|[^A-Za-z0-9_])uses([^A-Za-z0-9_]|$)/ \
               && (inblock || line !~ /["\047][^"\047]*["\047] *:/) \
               && line !~ /^[ ]*(- +)?\? / \
               && (inblock || line !~ /!!|![<]/) \
               && (inblock || (body !~ /^["\047]/ && body !~ /^!/)) \
               && line !~ /(^|[ :\[{,])&[A-Za-z0-9_-]/) {
      ok = 1
    }
    usescol = -1
    if (ok && line ~ /^[ ]*(- +)?uses: /) usescol = col
    if (!ok) print FILENAME ":" FNR ": " $0
    if (!inblock && body ~ /[:-] +[|>][-+0-9]*( +#.*)?$/) block = col
  }' "${files[@]}" >"$out" || { echo "check-pins: awk failed" >&2; exit 1; }

if [ -s "$out" ]; then
  echo "These lines are not an action pinned by a full 40-hex commit SHA (or an actions/* ref, or a ./ path) in the canonical 'uses: <ref>' form:" >&2
  cat "$out" >&2
  exit 1
fi
