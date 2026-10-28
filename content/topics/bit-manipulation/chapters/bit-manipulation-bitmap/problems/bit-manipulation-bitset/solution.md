The word is `I >> 5` (or `I / 32`) and the bit is `I & 31` (or `I % 32`). The mask is `1 << (I & 31)`. `set` is `word |= mask`, `clear` is `word &= ~mask`, `flip` is `word ^= mask`, and `test` is `(word >> bit) & 1`. These are the kernel's `*p |= mask`, `*p &= ~mask` and `*p ^= mask`.

For `set` and `flip`, append zero words until the sequence has `I / 32 + 1` of them. For `clear` and `test`, a flag past the end needs no work: `clear` has nothing to turn off and `test` prints `0`. Never shrink the sequence.

Each operation touches one word, so it is O(1) in the worst case. A `set` or `flip` past the end also appends words, which costs time in proportion to the number it appends, so a single operation is O(I / 32) in the worst case.

**Language notes.** In TypeScript, `1 << 31` is negative, so after an OR or XOR convert back with `>>> 0` to keep the word an unsigned number. In Go, use `uint32` and the AND-NOT operator `&^`. In Python, mask the complement: `~mask & 0xFFFFFFFF`.

**Edges.** Flag 31 is the top bit of word 0, so `show` prints a negative number and `ushow` prints 2147483648. Flag 32 is bit 0 of word 1. `clear 1000` on a short sequence does not make it longer.
