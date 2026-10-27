Use a scratch cell `S` as the first tail. With cursors `a` (the first node of `A`) and `b` (the first of `B`):

- while both are non-zero: if `key(a) <= key(b)`, write `a` into the tail cell, set the tail to `a`, and set `a` to `a`'s next. Otherwise do the same with `b`;
- afterwards write whichever cursor is non-zero into the tail cell. The rest of that list is already sorted and its tail already ends in 0.

The merged first node is whatever `S` holds. Write it into `A`'s head cell and write 0 into `B`'s.

**Stability.** The test is `<=`, not `<`, so on equal keys `a` goes first, the node that came first in the input. This is the rule in the kernel's `merge`: "if equal, take 'a' -- important for sort stability".

**Cost.** Each step moves one node: at most `len(A) + len(B)` steps, so O(n) comparisons and links in the worst case with n the total length, and O(1) extra space: no node is copied.
