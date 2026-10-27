Add the stack of pending runs that CPython 3.13.0's `list.sort` keeps. The runs and the list are never stored: you only need the length of each run.

A **run** is a stretch of the list, written as its length. Runs arrive in list order and sit side by side. The program keeps a stack of runs that have not been merged yet, oldest at the bottom. Each entry holds a **length** and a **power**.

| Command | What it does | Prints |
|---|---|---|
| `sort N` | Starts a new sort of a list of `N` elements, with an empty stack. | nothing |
| `run L` | A new run of length `L` has been found (below). | one line `merge A B` for each merge, in order |
| `end` | There are no more runs: merge everything that is left (below). | one line `merge A B` for each merge, in order |
| `pending` | Reads the stack. | the lengths from bottom to top, separated by spaces, or `empty` |

The runs of one sort add up to at most `N`, each `L` is at least 1, and `N` is at most 1,000,000.

**Merging** the entry at position `i` with the one above it replaces the two with one entry whose length is the sum and whose power is the power of the lower one. The merge prints `merge A B`, where `A` and `B` are the lengths of the lower and upper entries before the merge.

**`run L`.** If the stack is empty, push `(L, 0)` and stop. Otherwise let `n1` be the length of the top entry and `s1` the number of list elements before it (the sum of all the lengths below it, which is the start of that run). Compute `p = power(s1, n1, L, N)` as below. Then, while the stack has at least two entries and the power of the second from the top is more than `p`, merge the top two entries. Then set the power of the top entry to `p`, and push `(L, 0)`.

**`power(s1, n1, n2, n)`.** All numbers are integers. Start with `result = 0`, `a = 2 * s1 + n1` and `b = a + n1 + n2`. Then repeat:

1. Add 1 to `result`.
2. If `a >= n`: subtract `n` from both `a` and `b`.
3. Otherwise, if `b >= n`: stop and return `result`.
4. Double both `a` and `b`, and go back to step 1.

**`end`.** While the stack has at least two entries, let `i` be the position of the second entry from the top, counting from the bottom starting at 0. If `i > 0` and the length of the entry at `i - 1` is less than the length of the entry at `i + 1`, use `i - 1` instead. Merge the entry at `i` with the one above it.

## Example

Input:

```
sort 16
run 4
run 4
pending
run 4
pending
run 4
pending
end
pending
```

Output:

```
4 4
merge 4 4
8 4
8 4 4
merge 4 4
merge 8 8
16
```

When the second run arrives the first gets power 2, so the stack holds `(4, 2)` and `(4, 0)`. When the third arrives, the power for the second is 1. The entry under it has power 2, which is more, so the first two merge before the third goes on. At `end`, the two 4s on top merge first, because the 8 below them is not shorter than the top run, and then the 8s.
