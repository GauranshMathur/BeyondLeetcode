# zlib: the two lightest nodes first

The last Chapter's rule, the biggest block that fits, was safe because of how blocks nest. This Chapter reads a greedy rule with a different shape: build a code by repeatedly joining the two rarest symbols. It is the way a real compressor builds the codes that DEFLATE needs. The format is [RFC 1951](https://www.rfc-editor.org/rfc/rfc1951.html) (Deutsch, May 1996), and the program is zlib 1.3.1, whose file [`trees.c`](https://github.com/madler/zlib/blob/51b7f2abdade71cd9bb0e7a373ef2610ec6f9daf/trees.c#L618-L619) builds the codes. Links to code point at the commit that the tag v1.3.1 names (`51b7f2abdade71cd9bb0e7a373ef2610ec6f9daf`).

## The code a compressor must build

DEFLATE writes the symbols of a block with prefix codes, in which no code is the start of another. The specification says: "Each type of value (literals, distances, and lengths) in the compressed data is represented using a Huffman code, using one code tree for literals and lengths and a separate code tree for distances." ([RFC 1951, section 2](https://www.rfc-editor.org/rfc/rfc1951.html#section-2)) It also says what a Huffman code is: "Given an alphabet with known symbol frequencies, the Huffman algorithm allows the construction of an optimal prefix code (one which represents strings with those symbol frequencies using the fewest bits of any possible prefix codes for that alphabet)." ([RFC 1951, section 3.2.1](https://www.rfc-editor.org/rfc/rfc1951.html#section-3)) A prefix code is a binary tree with a symbol at each leaf, and the code of a symbol is the path to it. A symbol that occurs `f` times at depth `d` costs `f x d` bits, and the best code is the tree with the lowest total.

## The greedy loop in zlib

The comment above zlib's function says what it does: "Construct one Huffman tree and assigns the code bit strings and lengths." ([trees.c, line 618](https://github.com/madler/zlib/blob/51b7f2abdade71cd9bb0e7a373ef2610ec6f9daf/trees.c#L618)) It keeps the nodes in a binary heap stored in an array: "Construct the initial heap, with least frequent element in heap[SMALLEST]. The sons of heap[n] are heap[2*n] and heap[2*n + 1]." ([trees.c, lines 633 to 634](https://github.com/madler/zlib/blob/51b7f2abdade71cd9bb0e7a373ef2610ec6f9daf/trees.c#L633-L634)) Then comes the greedy step. Its comment: "Construct the Huffman tree by repeatedly combining the least two frequent nodes." ([trees.c, lines 667 to 668](https://github.com/madler/zlib/blob/51b7f2abdade71cd9bb0e7a373ef2610ec6f9daf/trees.c#L667-L668)) And its code:

```c
    do {
        pqremove(s, tree, n);  /* n = node of least frequency */
        m = s->heap[SMALLEST]; /* m = node of next least frequency */

        s->heap[--(s->heap_max)] = n; /* keep the nodes sorted by frequency */
        s->heap[--(s->heap_max)] = m;

        /* Create a new node father of n and m */
        tree[node].Freq = tree[n].Freq + tree[m].Freq;
```

([trees.c, lines 671 to 679](https://github.com/madler/zlib/blob/51b7f2abdade71cd9bb0e7a373ef2610ec6f9daf/trees.c#L671-L679).) The new node is then put back in the heap, "and insert the new node in the heap" is the comment on that line, and the loop runs `while (s->heap_len >= 2)` ([trees.c, lines 689 to 693](https://github.com/madler/zlib/blob/51b7f2abdade71cd9bb0e7a373ef2610ec6f9daf/trees.c#L689-L693)). Each pass takes out the two nodes of least frequency and puts back one whose frequency is their sum, until one node, the root, is left. The tree is never rebuilt and no choice is revisited.

## Why the two lightest are safe

This is the Chapter's argument, not zlib's. Take a best tree in which no inner node has a single child (such a node can be cut out, which only shortens codes). Let `a` and `b` be the two rarest symbols. A deepest leaf has a sibling that is also a leaf, since otherwise the sibling's subtree would hold a deeper leaf. Call those two leaves `x` and `y`. If `a` is shallower than `x`, swap them: `a` moves down by some `d`, `x` moves up by `d`, and the cost changes by `d x (freq(a) - freq(x))`, which is not positive because `a` is no more frequent than `x`. Do the same for `b` and `y`. Now `a` and `b` are siblings at the greatest depth in a tree that costs no more. That is the exchange argument again: some best tree has the greedy choice in it. What is left is the problem for a smaller alphabet, with `a` and `b` replaced by one symbol of frequency `freq(a) + freq(b)`. Their parent sits one level above them, so the real tree costs the smaller tree's cost plus `freq(a) + freq(b)`. The cost of the whole code is the sum of every frequency written into the line `tree[node].Freq = tree[n].Freq + tree[m].Freq`.

## Three details the code handles

**Ties.** More than one tree can be best. zlib's macro for the heap order says: "Compares to subtrees, using the tree depth as tie breaker when the subtrees have equal frequency. This minimizes the worst case length." ([trees.c, lines 494 to 495](https://github.com/madler/zlib/blob/51b7f2abdade71cd9bb0e7a373ef2610ec6f9daf/trees.c#L494-L495); the typo "to" is in the source.) Which of the tied trees is built changes the shape of the code but not its total cost, and the Problem asks only for the cost.

**One symbol.** The comment before the loop says: "The pkzip format requires that at least one distance code exists, and that at least one bit should be sent even if there is only one possible code. So to avoid special checks later on we force at least two codes of non zero frequency." ([trees.c, lines 648 to 651](https://github.com/madler/zlib/blob/51b7f2abdade71cd9bb0e7a373ef2610ec6f9daf/trees.c#L648-L651)) So a text with a single kind of symbol still pays one bit for each. The Problem uses the same rule.

**A limit on the length.** DEFLATE codes are at most 15 bits long: the specification lists code lengths "0 - 15" ([RFC 1951, section 3.2.7](https://www.rfc-editor.org/rfc/rfc1951.html#section-3)), and zlib has "All codes must not exceed MAX_BITS bits" ([deflate.h, lines 52 to 53](https://github.com/madler/zlib/blob/51b7f2abdade71cd9bb0e7a373ef2610ec6f9daf/deflate.h#L52-L53)). Huffman's choice is the best code when lengths are free. zlib's comment calls the lengths from the first pass "the optimal bit lengths (which may overflow in the case of the bit length tree)" ([trees.c, lines 554 to 555](https://github.com/madler/zlib/blob/51b7f2abdade71cd9bb0e7a373ef2610ec6f9daf/trees.c#L554-L555)), and when one is over the limit it cuts it to the limit and then moves leaves down until the lengths fit again ([trees.c, lines 562 to 611](https://github.com/madler/zlib/blob/51b7f2abdade71cd9bb0e7a373ef2610ec6f9daf/trees.c#L562-L611)). With a limit, the exchange argument no longer applies, and the comment does not call the repaired lengths optimal. The Problem has no limit.

## The cost

Each pass is one `pqremove` and one heap fix-up, which cost O(log n) in the **worst case** each for `n` symbols, and there are `n - 1` passes, so building the tree is O(n log n) in the **worst case**. A heap is the right tool because each pass needs the minimum and then an insert, and a sorted array would pay O(n) in the **worst case** for the insert.

## What the Problem builds

`load` and `show` give the Build its sequence, and `huffman` prints the cost of the best prefix code for the frequencies in it. Python's `heapq`, Go's `container/heap` and a small heap you write in TypeScript (which has no built-in one) all fit. The Problem sums the merged weights, the same sum zlib's `Freq` line makes.
