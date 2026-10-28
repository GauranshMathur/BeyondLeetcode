Count `full = N / 32` whole words, but no more than the sequence has. If `N % 32` is not 0 and the sequence has a word at index `full`, add the weight of that word with its high bits masked off, `word & ((1 << rest) - 1)`. Words and bits past the end are off, so they add nothing.

For one word, the kernel's `hweight32` needs no loop: `w -= (w >> 1) & 0x55555555`, then `w = (w & 0x33333333) + ((w >> 2) & 0x33333333)`, then `w = (w + (w >> 4)) & 0x0f0f0f0f`, and the multiplication `(w * 0x01010101) >> 24` adds the four byte counts into the top byte. Any correct way of counting a word's bits passes; this one is O(1) per word.

The command is O(min(N, 32 n) / 32) in the worst case for n words, with O(1) extra space.

**Language notes.** In TypeScript the multiplication needs `Math.imul` and a final `>>> 24`, because a plain `*` loses low bits above 2^53 and `>>` is signed. In Go, `uint32` arithmetic wraps as the code expects. In Python, mask the product to 32 bits before shifting.

**Edges.** `N` exactly a multiple of 32 has no partial word, and `N` = 31 or 33 sits on either side of a word boundary. `count 0` prints `0` even on an empty sequence.
