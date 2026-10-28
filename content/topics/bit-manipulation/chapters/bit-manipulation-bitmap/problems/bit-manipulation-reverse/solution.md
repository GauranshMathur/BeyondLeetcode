Five swaps do it, each exchanging blocks of a size and moving to half the size: the two halves of 16 bits, the bytes inside them, the nibbles, the pairs, and the neighbouring bits. Each swap is `((w >> s) & m) | ((w & m) << s)`, with `m` being the mask that picks the low blocks of that size (`0x55555555` for single bits, `0x33333333` for pairs, `0x0F0F0F0F` for nibbles, `0x00FF00FF` for bytes). The last swap, of the halves, is `(w >> 16) | (w << 16)`. The kernel's macro does the same five steps in the other order.

The other approach is a 256-entry table of reversed bytes: reverse the four bytes of the word and put them in the opposite order. A table costs memory and saves operations; the kernel keeps both and uses the swaps for constants, as the Chapter says.

Five swaps are a fixed number of operations, so a word is O(1) in the worst case and the command is O(n) for n words.

**Language notes.** In TypeScript use `>>> 0` at the end to get an unsigned number, since `<<` produces a signed one. In Python, mask to 32 bits after the left shifts.

**Edges.** `0` stays `0`. A reversal done twice returns the word, and `reverse` does not change the sequence, so `ushow` still shows the original.
