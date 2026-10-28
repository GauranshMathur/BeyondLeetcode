Reuse `parse` and the search of `match`, without the `chosen` list, and add a counter. The same function serves both searches, with a flag for whether to use the memory.

`calls(steps, text, prune)`: start the counter at 0 and an empty set. The function `go(step, pos)`:

1. if `prune` is on and `(step, pos)` is in the set, answer no and stop (it is not counted);
2. if `prune` is on, add `(step, pos)` to the set;
3. add 1 to the counter;
4. if `step` is past the last step, answer whether `pos` is the end of the text;
5. for each option of the step that fits at `pos`, if `go(step + 1, pos + length of the option)` answers yes, answer yes;
6. answer no.

`cost` prints `plain` with the counter of the first run and `visited` with the counter of the second.

**Why skipping is right.** Both searches stop at the first success. A state that was entered earlier and is not on the stack now has finished, and it finished without a success, because a success would have ended the search. The steps only go forward, so a state is never entered while it is still being explored. Entering it again can only fail again, and nothing it would have found is lost: the visited search gives the same answer as the plain one.

**Cost.** The plain search can enter up to k^n states in the **worst case** for n groups of k alternatives. The visited search enters at most (S + 1) x (n + 1) states, for S steps and a text of length n, because each pair is entered once. Each entry tries at most k options, and checking one against the text costs O(m) for the longest option m, so the visited search is O(S x n x k x m) in the **worst case**, with the set operations O(1) in the **expected** case. The set takes O(S x n) space in the worst case.
