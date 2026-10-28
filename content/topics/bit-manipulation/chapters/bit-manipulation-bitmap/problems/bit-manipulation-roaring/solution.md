Walk the words in steps of 2048, one block at a time. Add up the weight of the words of the block (stopping at the end of the sequence), and if the total is above 0, write `key:total:kind`. The kind is `array` for a total of 4096 or less and `bitset` above it. The threshold is where the two storage costs meet: an array container costs 2 bytes a number, so 4096 numbers cost 8192 bytes, the size of a bitmap of 65,536 bits.

Each word is counted once, so time is O(n) in the worst case for n words, and extra space is O(1) besides the output.

**Edges.** Exactly 4096 flags on is still an `array`; 4097 is a `bitset`. A block whose only flag was cleared is skipped, even though its words are still in the sequence. A flag set far away, such as flag 200000, is in block 3 and leaves blocks 1 and 2 out of the output.
