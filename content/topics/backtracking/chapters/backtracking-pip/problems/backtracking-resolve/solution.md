Keep the declared versions, the requirements of each version, the `need` lines, and while searching two things: `pins`, a map from package to its version, and `wanted`, a list of ranges as `(package, lo, hi)`, which starts as a copy of the `need` lines.

The search function `go()`:

1. collect the packages named in `wanted` that are not in `pins`; if there are none, answer yes;
2. take the first of them in alphabetical order, `name`;
3. for each of its versions from the highest to the lowest: skip it unless it is in every range of `wanted` that names `name`; let `added` be the requirements of this version; skip it if any of them names a package in `pins` whose version is outside the range;
4. **choose**: set `pins[name]` to the version and append `added` to `wanted`; **explore**: if `go()` answers yes, answer yes; **undo**: remove the last `len(added)` entries of `wanted` and delete `pins[name]`;
5. when no version is left, answer no.

`resolve` prints `ok` and the pins in alphabetical order if `go()` answered yes, and `conflict` otherwise.

**Why it is right.** `wanted` is always the `need` lines plus the requirements of the versions in `pins`, because every append is matched by a removal of exactly those entries. A version is checked against all of them before it is chosen, and against the packages already chosen when its requirements are added. A package chosen later is checked against the ranges that came with the earlier ones when its turn comes. So every answer that comes out satisfies every requirement. The search tries the versions in a fixed order and returns at the first success, so the answer is the first in that order, and `conflict` is printed only after every branch has failed.

**Cost.** With n needed packages of up to v versions each there are up to v^n combinations, so the search is exponential in the **worst case**. Each allowed check scans `wanted`, which holds at most the requirements along one path. Space is O(n^2) in the **worst case** for the Reference Code: up to n calls are nested, and each keeps its own list of the packages still to decide, besides the pins and `wanted`. pip makes the opposite trade for undoing: it copies a whole state at every pin ([pip: pick the newest, go back when it conflicts](/chapters/backtracking-pip) reads how), where this search removes what it added.
