Looking forward from every run would take O(n) per run and O(n²) in total. Walk through the runs once instead, and keep a stack of the **indexes** whose answer is still unknown.

For each run `i`, while the run at the top of the stack is shorter than run `i`, pop it: run `i` is the first longer run after it, so its answer is `i - top`. Then push `i`. When the walk ends, the indexes still on the stack never met a longer run and keep the answer 0.

The stack is monotonic, as in the pending-run stack: the lengths of the runs whose index is on the stack never increase from bottom to top. Every longer-than-top run pops until the order is back, so the order is the invariant that makes the pops correct. Strictly shorter pops, so an equal run does not pop its twin, which is what "strictly longer" asks for.

Complexity. Each index is pushed once and popped at most once, so the loop does at most 2n stack operations and the whole thing is O(n) **worst case**. One run can pop many indexes, but the total is bounded by the pushes: O(1) **amortised** per run. The stack takes O(n) memory in the worst case, for a list that never increases.
