# Linux bitmaps: one bit per flag

When a system has to remember yes or no for a great many numbered things, one bit each is the smallest it can be. This Chapter reads how the Linux kernel (v6.6) keeps such an array of bits ([`bitmap.h`](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/bitmap.h#L17-L18)) and does the four things a program asks of it (set a bit, clear it, test it, count them), and then how Roaring, a format for sets of 32-bit integers ([format specification, line 50](https://github.com/RoaringBitmap/RoaringFormatSpec/blob/e1b736158c29d077f37bd8a969bcc78995f59377/README.md#L50-L50)), decides between two ways to store a block of them ([lines 95 to 97](https://github.com/RoaringBitmap/RoaringFormatSpec/blob/e1b736158c29d077f37bd8a969bcc78995f59377/README.md#L95-L97)). In the Problems the sequence of words from the last Chapter is the array.

## An array of bits is an array of words

The kernel's description is short: "bitmaps provide bit arrays that consume one or more unsigned longs." ([include/linux/bitmap.h, lines 17 to 18](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/bitmap.h#L17-L18); comment markers dropped.) A word holds many bits, so bit number `nr` is found in two steps, which the kernel writes as two macros:

```c
#define BIT_MASK(nr)		(UL(1) << ((nr) % BITS_PER_LONG))
#define BIT_WORD(nr)		((nr) / BITS_PER_LONG)
```

([include/linux/bits.h, lines 9 to 10](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/bits.h#L9-L10)) `BIT_WORD` is which word and `BIT_MASK` is a word with only that bit set. The words in the Build are 32 bits wide, a choice made so that the program means the same in every Language, so in the Problems bit `i` is bit `i % 32` of word `i / 32`, and bit 0 is the lowest bit. The number of words that `nr` bits need is the division rounded up: `#define BITS_TO_LONGS(nr)	__KERNEL_DIV_ROUND_UP(nr, BITS_PER_TYPE(long))`. ([include/linux/bitops.h, line 19](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/bitops.h#L19-L19))

## Setting, clearing and flipping

With the word and the mask, each change is one operation on one word. The kernel's generic version:

```c
unsigned long mask = BIT_MASK(nr);
unsigned long *p = ((unsigned long *)addr) + BIT_WORD(nr);

*p  |= mask;
```

and for clearing, the same two lines followed by `*p &= ~mask;`. ([include/asm-generic/bitops/generic-non-atomic.h, lines 27 to 43](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/asm-generic/bitops/generic-non-atomic.h#L27-L43)) Toggling is `*p ^= mask;`. ([lines 54 to 61](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/asm-generic/bitops/generic-non-atomic.h#L54-L61)) OR turns the bit on whatever it was, AND with the inverted mask turns it off and leaves the others alone, and XOR swaps it. Testing is the reverse: shift the word right by `nr % 32` and look at the lowest bit.

These are the double-underscore versions, and their comment says what that costs: "Unlike set_bit(), this function is non-atomic and may be reordered." ([lines 23 to 26](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/asm-generic/bitops/generic-non-atomic.h#L23-L26); comment markers dropped.) The Build is single-threaded, so it has no use for the atomic kind.

Each of the four operations touches one word, so each is O(1) in the **worst case**. A `set` past the end has first to add the words in between. The sequence is a dynamic array, whose append is **amortised** O(1), so such a `set` costs time in proportion to the number of words it adds, amortised. This is the Problem `bitset`.

## Counting the bits

The kernel's list of bitmap operations includes one for this: "bitmap_weight(src, nbits) Hamming Weight: number set bits". ([include/linux/bitmap.h, line 53](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/bitmap.h#L53-L53); comment marker dropped.) The Hamming weight is defined next to the code that computes it: "The Hamming Weight of a number is the total number of bits set in it." ([lib/hweight.c, lines 6 to 11](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/hweight.c#L6-L11); comment markers dropped.)

The weight over the first `bits` bits adds up the whole words, then the last, partial word with its extra bits masked off:

```c
for (idx = 0; idx < __bits / BITS_PER_LONG; idx++)
	w += hweight_long(FETCH);
if (__bits % BITS_PER_LONG)
	w += hweight_long((FETCH) & BITMAP_LAST_WORD_MASK(__bits));
```

([lib/bitmap.c, lines 340 to 344](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/bitmap.c#L340-L344); the trailing `\` of each line in the macro is dropped.) The mask is what makes `nbits` not have to be a multiple of the word size. For one word, the software version does not loop over its bits at all:

```c
w -= (w >> 1) & 0x55555555;
w = (w & 0x33333333) + ((w >> 2) & 0x33333333);
w = (w + (w >> 4)) & 0x0f0f0f0f;
return (w * 0x01010101) >> 24;
```

([lib/hweight.c, lines 15 to 19](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/hweight.c#L15-L19)) Each line adds neighbouring groups of bits: pairs, then groups of four, then whole bytes, and the multiplication adds the four bytes into the top one (this is a reading of the code, labelled as arithmetic). A word costs a fixed number of operations, so the weight of `n` bits is O(n / 32) in the **worst case**. This is the Problem `weight`.

## The same word, the other way round

A word's bits can also be read in reverse order. The kernel has two ways to do it, and the choice is a trade. One looks up each byte in a table of 256 reversed bytes: `return byte_rev_table[byte];`, with the 16-bit version built from two bytes, `return (__bitrev8(x & 0xff) << 8) | __bitrev8(x >> 8);`, and the 32-bit version from two halves: `return (__bitrev16(x & 0xffff) << 16) | __bitrev16(x >> 16);`. ([include/linux/bitrev.h, lines 16 to 29](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/bitrev.h#L16-L29)) The other swaps without a table: `___x = (___x >> 16) | (___x << 16);` is the first of five swaps, and the last is `___x = ((___x & (u32)0xAAAAAAAAUL) >> 1) | ((___x & (u32)0x55555555UL) << 1);`. ([lines 38 to 42](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/bitrev.h#L38-L42); the trailing `\` of each line is dropped.) Between them, the swaps exchange halves, bytes, nibbles, pairs and neighbouring bits. The macro chooses by what it is given: `__builtin_constant_p(__x) ? __constant_bitrev32(__x) : __bitrev32(__x);`. ([lines 74 to 80](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/bitrev.h#L74-L80); the trailing `\` of each line is dropped.) Both take a fixed number of steps per word, O(1) in the **worst case**. The Extra Problem `reverse` is this.

## Roaring: when a plain bitmap is too big

A bitmap costs one bit for every possible number, however few are present. For the 2^32 possible 32-bit integers that is 512 MB (arithmetic), so the Roaring format splits the number line. "Roaring bitmaps are designed to store sets of 32-bit (unsigned) integers." and "They are made of three types of 16-bit containers: array, bitset and run containers." ([RoaringFormatSpec README.md, line 50](https://github.com/RoaringBitmap/RoaringFormatSpec/blob/e1b736158c29d077f37bd8a969bcc78995f59377/README.md#L50-L50)) A container is named by the top half of the number: "we store the key (16 most significant bits) along with the cardinality minus 1". ([lines 86 to 88](https://github.com/RoaringBitmap/RoaringFormatSpec/blob/e1b736158c29d077f37bd8a969bcc78995f59377/README.md#L86-L88)) So each container covers 65,536 consecutive numbers.

Then comes the decision. A container with few numbers stores them as a sorted list; one with many stores a bitmap. The format does not store which: "we use the cardinality to determine the type: a cardinality of up and including 4096 indicates an array container whereas a cardinality above 4096 indicates a bitset container." ([lines 95 to 97](https://github.com/RoaringBitmap/RoaringFormatSpec/blob/e1b736158c29d077f37bd8a969bcc78995f59377/README.md#L95-L97)) The two sizes explain the number: "if there are x values in the array container, 2 x bytes are used." and "Bitset containers are stored using exactly 8KB using a bitset serialized with 64-bit words." ([lines 112 to 113](https://github.com/RoaringBitmap/RoaringFormatSpec/blob/e1b736158c29d077f37bd8a969bcc78995f59377/README.md#L112-L113)) 4096 values at 2 bytes is 8192 bytes, and a bitmap of 65,536 bits is 8192 bytes too; one more value and the list is the bigger one (arithmetic on the two quotes). The same lines give the bit order: "if value j is present, then word j/64 (starting at word 0) will have its (j%64) least significant bit set to 1 (starting at bit 0)." That is the kernel's rule again, with 64-bit words. The Extra Problem `roaring` reads a bitmap in the Build as Roaring would and says which container each block would get; it ignores run containers.

## What the Problems build

`bitset` makes the sequence an array of flags with `set`, `clear`, `flip` and `test`. `weight` adds `count`, the kernel's weight over the first `N` bits. The Extras `reverse` and `roaring` branch off: they read the same bitmap and add nothing the later Problems need.
