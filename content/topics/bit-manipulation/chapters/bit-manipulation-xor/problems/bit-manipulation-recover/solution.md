Start `parity` at 0 and XOR each word into it. XOR is its own inverse and does not depend on order, so every value that appears twice cancels, and what remains is the XOR of the values that appear an odd number of times. For a stripe, the XOR of all its blocks, the lost one included, is 0 (arithmetic, from the same cancelling), so the lost block is the XOR of the others.

One pass, so time is O(n) in the worst case, and space is O(1): one word.

**Language notes.** The result is printed as unsigned. TypeScript's `^` gives a signed number, so use `>>> 0`. Python's integers are already non-negative here, because the words are kept as unsigned.

**Edges.** An empty sequence prints `0`. A word loaded as `-1` is `4294967295`, so `load -1` then `recover` prints `4294967295`. Two equal words give `0`.
