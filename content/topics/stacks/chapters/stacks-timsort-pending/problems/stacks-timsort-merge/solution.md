Keep the stack as a list of `(length, power)` pairs. `run L` has four steps in the order the statement gives them: compute the power from the top two runs, merge while the entry under the top has a greater power, record the power, push the new run.

The start of the top run is `run_end - n1`, where `run_end` is the total length of all runs seen so far. Keep `run_end` yourself, or add up the stack: the stack is short, so either is cheap.

A merge removes the upper entry and adds its length to the lower one, which keeps the lower power. In the `while` loop the merge is always of the top two, so the merged entry is the new top, and the loop then compares the entry under it with `p`. After the loop, `p` is stored as the top's power. It may replace a power that came from a merge, which is the rule of the C code.

`end` is a different loop with a different merge order: it may merge the second and third entries from the top, not the top two, when the entry below them is shorter than the top one. This choice does not look at powers, only lengths. Test it: with runs `8 4 2` after the power rule, the first merge is `4 2`, because `8` is not shorter than `2`. With `2 4 8` the first merge is `2 4`, because `2 < 8`.

Complexity. `power` works one bit at a time, as the notes in CPython say; this Problem does not analyse it. The stack stays short: CPython's comment says it needs at most `floor(log2(n)) + 1` entries. Each `run` is O(1) **amortised** in stack work, because every pass through the `while` removes an entry that an earlier `run` pushed. One call can do many merges, O(stack size) in the **worst case**.
