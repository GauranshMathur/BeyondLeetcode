Both commands walk the table with `i = 0` and `tokens = 0`. While `i < n`: let `L = values[i]`. If `L < 3`, add a token and add 1 to `i`. Otherwise, for `lazy` only, run `while i + 1 < n and values[i + 1] > L: tokens += 1; i += 1; L = values[i]`. Then add a token and add `L` to `i`. At the end print `tokens`.

`greedy` is the same loop with the inner `while` left out.

**Neither rule is always the better one.** On the example table `3 8 0 0 0 0 0 0 0` waiting wins, 2 tokens against 7. On `5 6 0 0 0 5 0 0 0 0` it loses: `greedy` takes the 5 at position 0 and the 5 at position 5, 2 tokens; `lazy` sees the 6 at position 1, writes a literal and takes the 6 (positions 1 to 6), and then has three positions with no match, 1 + 1 + 3 = 5 tokens. A rule that looks at only one position cannot see the match at position 5 that the longer one throws away. That is why a greedy choice here is a guess and not a proof; the next Problem is a case where a different greedy choice is provably the best.

**Cost.** Each loop step moves `i` forward by at least 1, and every position is the left edge of a token at most once, so O(n) in the **worst case** for both rules, with O(1) extra space.
