# Bit manipulation: sources

Research for the Topic `bit-manipulation` (card C123, issue #256). Every claim about a real system that the four Chapters make is listed below with its source. The Problems follow the same sources: the rules in each statement are the rules in the code or text quoted here, except where a statement says it is written for the Problem (the key hash of `bloomfilter`, the three-state container rule of `roaring`, which leaves out run containers).

Pinned versions. Code links in the Chapters use the commit SHA, never a branch or a tag.

| Project | Tag | Commit |
|---|---|---|
| Linux | `v6.6` | `ffc253263a1375a65fa6c9f62a893e9767fbebfa` (the pin of the Sliding window Topic) |
| LevelDB | `1.23` | `99b3c03b3284f5886f9ef9a4ef703d57373e61be` (tag `1.23` of `google/leveldb`) |
| RoaringFormatSpec | none (no release tags) | `e1b736158c29d077f37bd8a969bcc78995f59377` (`master` when fetched, 28 October 2026) |
| Java Language Specification | SE 21 | `https://docs.oracle.com/javase/specs/jls/se21/html/` (a versioned URL; the page is for Java SE 21) |

Method. Code and the Roaring README were fetched with `curl` from `raw.githubusercontent.com/<org>/<repo>/<sha>/<path>` and line numbers read with `grep -n` and `sed -n` on the fetched file. The JLS chapters were fetched as HTML, with tags dropped and whitespace collapsed to read them as text; the section anchors in the Chapters are the HTML version's. Every quoted string in the Chapters was checked by a script against the fetched text, inside the line range the link cites (whitespace normalised, comment markers and macro line-continuation backslashes dropped), and every quoted string was checked to appear in its Chapter. Source types: 1 = source code, 2 = official documentation, 3 = standard or original paper, 4 = a post by the system's own engineers. Fetched by the agent, quote checked; no human has opened the links yet.

## Observed, not cited

- **The oracle.** The expected output of every Test comes from a second model of the Build, written apart from the Reference Code: the bitset is one big integer, signed fields are read from binary strings, sums are plain addition, weights come from `bin(...).count("1")`, the missing number is a sum difference, and the Bloom filter is written out in integer arithmetic. Python and TypeScript (Node) Reference Code was run on every Test in its scope with no difference; Go was compiled and run in the Go Sandbox image on the same Tests.
- **`0.69` and the number of probes.** `int(B * 0.69)` in floating point and the exact product `floor(Fraction(0.69) * B)` agree for every `B` from 1 to 100 except `B` = 100 (69.0 against 68.99999), where both clamp to 30. This is a check of this project's Problem `bloomsize`, not a claim in a Chapter.
- **Mainline Test count.** The Submit of the last Core Problem (`bloomfilter`) runs 39 hidden Tests (9 earlier Core Problems with 1 Example and 3 Hidden Tests each, plus its own 3 Hidden Tests), under the limit of 50.

## Leads that changed

- Chapter 1 (the issue's "Two's complement and the operators") has no lead for a system. The Chapter reads the Linux kernel's `sign_extend32` for the decision, and the Java Language Specification for the definitions it rests on (two's complement, the two right shifts, overflow keeping the low 32 bits).
- Chapter 2's leads were "Linux's bitmap, compressed bitmaps in search engines". The Chapter reads Linux's bitmap, and Roaring through its own format specification. The specification lists Lucene, Elastic and others as users; the Chapter does not repeat that list, and says nothing about any search engine.
- Chapter 3 ("Tricks: XOR, masks, lowest set bit") has no lead in the issue. A search for a system that rebuilds data with XOR found the kernel's RAID 5 code in `drivers/md/raid5.c`; the power-of-two test is `include/linux/log2.h`.
- Chapter 4 ("Bit-level hashing: Bloom filters") has no lead. LevelDB's `util/bloom.cc` was chosen because it states its sizing, its probe count and its double hashing in the code. The original paper (Bloom, 1970) and the Kirsch and Mitzenmacher analysis that the code cites were not fetched and are not cited.
- Candidate Problems: all six are used. Single Number is `recover`, Number of 1 Bits is `weight`, Counting Bits is `countbits`, Missing Number is `missing`, Sum of Two Integers is `wrapsum`, and Reverse Bits is the Extra `reverse`.

## Claims cut

- "Hardware registers and packed formats hold small signed numbers in fewer bits than a whole word: a 12-bit temperature, a 5-bit offset." (Chapter 1 draft). No source for the examples; rewritten as "a small signed number can be packed into fewer bits than a whole word", which makes no claim about a system.
- "Computing k hashes would be slow" (Chapter 4 draft). LevelDB's code says what it does and cites an analysis; it does not say why. Cut.
- "A wrong yes costs time and nothing else" (Chapter 4 draft). Rewritten to the contract's own words.
- The Roaring authors' design rationale (the paper at arXiv 1603.06549, linked from the README) was not fetched, so the Chapter does not claim why Roaring chose 4096; it reads the two sizes in the specification and says the equality is arithmetic on them.

---


## Chapter 1: Linux: reading a field as a signed number (`bit-manipulation-signed`)

System: Java (Language Specification SE 21) and Linux v6.6.

### Claim 1.1. Java defines its integer types as signed two's-complement integers of fixed width.
- Link: [Java Language Specification SE 21, section 4.2](https://docs.oracle.com/javase/specs/jls/se21/html/jls-4.html#jls-4.2)
- Quote: "The integral types are byte, short, int, and long, whose values are 8-bit, 16-bit, 32-bit and 64-bit signed two's-complement integers, respectively"
- Type 2. Status: sourced.

### Claim 1.2. An int runs from -2147483648 to 2147483647.
- Link: [Java Language Specification SE 21, section 4.2.1](https://docs.oracle.com/javase/specs/jls/se21/html/jls-4.html#jls-4.2.1)
- Quote: "For int, from -2147483648 to 2147483647, inclusive"
- Type 2. Status: sourced.

### Claim 1.3. Java has two right shifts: `>>` copies the sign, `>>>` fills with zeros.
- Link: [Java Language Specification SE 21, section 15.19](https://docs.oracle.com/javase/specs/jls/se21/html/jls-15.html#jls-15.19)
- Quote: "The value of n >> s is n right-shifted s bit positions with sign-extension."; "The value of n >>> s is n right-shifted s bit positions with zero-extension"
- Type 2. Status: sourced. Rendered text: HTML tags dropped.

### Claim 1.4. Java integer operators never report overflow; the result is the low 32 bits.
- Link: [Java Language Specification SE 21, section 4.2.2](https://docs.oracle.com/javase/specs/jls/se21/html/jls-4.html#jls-4.2.2)
- Quote: "The integer operators do not indicate overflow or underflow in any way."; "The value -727379968 is the decimal value of the low 32 bits of the mathematical result, 1000000000000, which is a value too large for type int."
- Type 2. Status: sourced. Rendered text: HTML tags dropped.

### Claim 1.5. The kernel's `sign_extend32` takes a 32-bit value and the index of its sign bit, and shifts left then right.
- Link: [include/linux/bitops.h, lines 179 to 190 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/bitops.h#L179-L190)
- Quote: "sign_extend32 - sign extend a 32-bit value using specified bit as sign-bit"; "@index: 0 based bit index (0<=index<32) to sign bit"; "This is safe to use for 16- and 8-bit types as well."; "__u8 shift = 31 - index;"; "return (__s32)(value << shift) >> shift;"
- Type 1. Status: sourced. Comment markers (`/**`, `*`, `*/`) dropped.


## Chapter 2: Linux bitmaps: one bit per flag (`bit-manipulation-bitmap`)

System: Linux v6.6 bitmaps, and Roaring (RoaringFormatSpec).

### Claim 2.1. A kernel bitmap is a bit array made of unsigned longs.
- Link: [include/linux/bitmap.h, lines 17 to 18 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/bitmap.h#L17-L18)
- Quote: "bitmaps provide bit arrays that consume one or more unsigned longs."
- Type 1. Status: sourced. Comment markers dropped.

### Claim 2.2. Bit `nr` lives in word `nr / BITS_PER_LONG`, at bit `nr % BITS_PER_LONG`.
- Link: [include/linux/bits.h, lines 9 to 10 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/bits.h#L9-L10)
- Quote: "#define BIT_MASK(nr) (UL(1) << ((nr) % BITS_PER_LONG))"; "#define BIT_WORD(nr) ((nr) / BITS_PER_LONG)"
- Type 1. Status: sourced.

### Claim 2.3. Setting and clearing a bit are an OR and an AND NOT on the word that holds it.
- Link: [include/asm-generic/bitops/generic-non-atomic.h, lines 27 to 43 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/asm-generic/bitops/generic-non-atomic.h#L27-L43)
- Quote: "unsigned long mask = BIT_MASK(nr);"; "unsigned long *p = ((unsigned long *)addr) + BIT_WORD(nr);"; "*p |= mask;"; "*p &= ~mask;"
- Type 1. Status: sourced.

### Claim 2.4. Toggling a bit is an XOR.
- Link: [include/asm-generic/bitops/generic-non-atomic.h, lines 54 to 61 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/asm-generic/bitops/generic-non-atomic.h#L54-L61)
- Quote: "*p ^= mask;"
- Type 1. Status: sourced.

### Claim 2.5. The generic set is non-atomic.
- Link: [include/asm-generic/bitops/generic-non-atomic.h, lines 23 to 26 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/asm-generic/bitops/generic-non-atomic.h#L23-L26)
- Quote: "Unlike set_bit(), this function is non-atomic and may be reordered."
- Type 1. Status: sourced. Comment markers dropped.

### Claim 2.6. The number of words for `nr` bits is `nr` divided by the bits in a long, rounded up.
- Link: [include/linux/bitops.h, lines 19 to 19 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/bitops.h#L19-L19)
- Quote: "#define BITS_TO_LONGS(nr) __KERNEL_DIV_ROUND_UP(nr, BITS_PER_TYPE(long))"
- Type 1. Status: sourced.

### Claim 2.7. `bitmap_weight` is the Hamming weight, the number of set bits.
- Link: [include/linux/bitmap.h, lines 53 to 53 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/bitmap.h#L53-L53)
- Quote: "bitmap_weight(src, nbits) Hamming Weight: number set bits"
- Type 1. Status: sourced. Comment marker dropped.

### Claim 2.8. The weight over `bits` bits adds up whole words, then the last word masked.
- Link: [lib/bitmap.c, lines 340 to 344 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/bitmap.c#L340-L344)
- Quote: "for (idx = 0; idx < __bits / BITS_PER_LONG; idx++) w += hweight_long(FETCH);"; "if (__bits % BITS_PER_LONG) w += hweight_long((FETCH) & BITMAP_LAST_WORD_MASK(__bits));"
- Type 1. Status: sourced. The trailing `\` of each macro line is dropped.

### Claim 2.9. The Hamming weight is the number of bits set in a number.
- Link: [lib/hweight.c, lines 6 to 11 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/hweight.c#L6-L11)
- Quote: "The Hamming Weight of a number is the total number of bits set in it."
- Type 1. Status: sourced. Comment markers dropped.

### Claim 2.10. The kernel's software `hweight32` counts with masks and shifts, not a loop over bits.
- Link: [lib/hweight.c, lines 15 to 19 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/hweight.c#L15-L19)
- Quote: "w -= (w >> 1) & 0x55555555;"; "w = (w & 0x33333333) + ((w >> 2) & 0x33333333);"; "w = (w + (w >> 4)) & 0x0f0f0f0f;"; "return (w * 0x01010101) >> 24;"
- Type 1. Status: sourced.

### Claim 2.11. The table version of `bitrev32` reverses each byte by lookup.
- Link: [include/linux/bitrev.h, lines 16 to 29 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/bitrev.h#L16-L29)
- Quote: "return byte_rev_table[byte];"; "return (__bitrev8(x & 0xff) << 8) | __bitrev8(x >> 8);"; "return (__bitrev16(x & 0xffff) << 16) | __bitrev16(x >> 16);"
- Type 1. Status: sourced.

### Claim 2.12. For a constant the kernel swaps halves, bytes, nibbles, pairs and neighbours instead.
- Link: [include/linux/bitrev.h, lines 38 to 42 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/bitrev.h#L38-L42)
- Quote: "___x = (___x >> 16) | (___x << 16);"; "___x = ((___x & (u32)0xAAAAAAAAUL) >> 1) | ((___x & (u32)0x55555555UL) << 1);"
- Type 1. Status: sourced. The trailing `\` of each macro line is dropped.

### Claim 2.13. `bitrev32` picks between the two at compile time.
- Link: [include/linux/bitrev.h, lines 74 to 80 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/bitrev.h#L74-L80)
- Quote: "__builtin_constant_p(__x) ? __constant_bitrev32(__x) : __bitrev32(__x);"
- Type 1. Status: sourced. The trailing `\` of each macro line is dropped.

### Claim 2.14. Roaring stores sets of 32-bit unsigned integers in containers.
- Link: [RoaringFormatSpec README.md, lines 50 to 50](https://github.com/RoaringBitmap/RoaringFormatSpec/blob/e1b736158c29d077f37bd8a969bcc78995f59377/README.md#L50-L50)
- Quote: "Roaring bitmaps are designed to store sets of 32-bit (unsigned) integers."; "They are made of three types of 16-bit containers: array, bitset and run containers."
- Type 2. Status: sourced.

### Claim 2.15. A container is keyed by the 16 most significant bits.
- Link: [RoaringFormatSpec README.md, lines 86 to 88](https://github.com/RoaringBitmap/RoaringFormatSpec/blob/e1b736158c29d077f37bd8a969bcc78995f59377/README.md#L86-L88)
- Quote: "we store the key (16 most significant bits) along with the cardinality minus 1"
- Type 2. Status: sourced.

### Claim 2.16. The type of a non-run container follows from its cardinality: up to 4096 is an array.
- Link: [RoaringFormatSpec README.md, lines 95 to 97](https://github.com/RoaringBitmap/RoaringFormatSpec/blob/e1b736158c29d077f37bd8a969bcc78995f59377/README.md#L95-L97)
- Quote: "we use the cardinality to determine the type: a cardinality of up and including 4096 indicates an array container whereas a cardinality above 4096 indicates a bitset container."
- Type 2. Status: sourced.

### Claim 2.17. An array container costs 2 bytes a value; a bitset container is exactly 8 KB, with the same bit order as the kernel's.
- Link: [RoaringFormatSpec README.md, lines 112 to 113](https://github.com/RoaringBitmap/RoaringFormatSpec/blob/e1b736158c29d077f37bd8a969bcc78995f59377/README.md#L112-L113)
- Quote: "if there are x values in the array container, 2 x bytes are used."; "Bitset containers are stored using exactly 8KB using a bitset serialized with 64-bit words."; "if value j is present, then word j/64 (starting at word 0) will have its (j%64) least significant bit set to 1 (starting at bit 0)."
- Type 2. Status: sourced.


## Chapter 3: XOR and the lowest set bit: RAID 5 and power-of-two checks (`bit-manipulation-xor`)

System: Linux v6.6 RAID 5 and `log2.h`.

### Claim 3.1. To rebuild one block of a RAID 5 stripe the kernel gathers every other block.
- Link: [drivers/md/raid5.c, lines 1594 to 1599 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/drivers/md/raid5.c#L1594-L1599)
- Quote: "for (i = disks; i--; ) {"; "if (i != target) {"; "off_srcs[count] = sh->dev[i].offset;"; "xor_srcs[count++] = sh->dev[i].page;"
- Type 1. Status: sourced.

### Claim 3.2. It then XORs them into the target block.
- Link: [drivers/md/raid5.c, lines 1609 to 1610 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/drivers/md/raid5.c#L1609-L1610)
- Quote: "tx = async_xor_offs(xor_dest, off_dest, xor_srcs, off_srcs, count,"
- Type 1. Status: sourced.

### Claim 3.3. The kernel computes a data drive or the parity drive the same way, with XOR.
- Link: [drivers/md/raid5.c, lines 1715 to 1715 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/drivers/md/raid5.c#L1715-L1715)
- Quote: "Compute any data- or p-drive using XOR"
- Type 1. Status: sourced. Comment markers dropped.

### Claim 3.4. The XOR routines are the RAID-5 checksumming functions.
- Link: [crypto/xor.c, lines 8 to 8 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/crypto/xor.c#L8-L8)
- Quote: "Dispatch optimized RAID-5 checksumming functions."
- Type 1. Status: sourced. Comment marker dropped.

### Claim 3.5. `is_power_of_2` is `n != 0` and `n & (n - 1)` equal to 0.
- Link: [include/linux/log2.h, lines 37 to 47 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/log2.h#L37-L47)
- Quote: "is_power_of_2() - check if a value is a power of two"; "Determine whether some value is a power of two"; "return (n != 0 && ((n & (n - 1)) == 0));"
- Type 1. Status: sourced. Comment markers dropped.


## Chapter 4: LevelDB: a Bloom filter in front of the disk (`bit-manipulation-bloom`)

System: LevelDB 1.23.

### Claim 4.1. LevelDB consults a filter to decide whether to read from disk.
- Link: [include/leveldb/filter_policy.h, lines 5 to 11 (LevelDB 1.23)](https://github.com/google/leveldb/blob/99b3c03b3284f5886f9ef9a4ef703d57373e61be/include/leveldb/filter_policy.h#L5-L11)
- Quote: "These filters are stored in leveldb and are consulted automatically by leveldb to decide whether or not to read some information from disk."
- Type 1. Status: sourced. Comment markers dropped.

### Claim 4.2. A filter must say yes for every key it was built from, and should say no for others with high probability.
- Link: [include/leveldb/filter_policy.h, lines 46 to 50 (LevelDB 1.23)](https://github.com/google/leveldb/blob/99b3c03b3284f5886f9ef9a4ef703d57373e61be/include/leveldb/filter_policy.h#L46-L50)
- Quote: "This method must return true if the key was in the list of keys passed to CreateFilter()."; "This method may return true or false if the key was not on the list, but it should aim to return false with a high probability."
- Type 1. Status: sourced. Comment markers dropped.

### Claim 4.3. Ten bits per key gives about a 1 percent false positive rate.
- Link: [include/leveldb/filter_policy.h, lines 54 to 56 (LevelDB 1.23)](https://github.com/google/leveldb/blob/99b3c03b3284f5886f9ef9a4ef703d57373e61be/include/leveldb/filter_policy.h#L54-L56)
- Quote: "A good value for bits_per_key is 10, which yields a filter with ~ 1% false positive rate."
- Type 1. Status: sourced. Comment markers dropped.

### Claim 4.4. The number of probes is bits per key times 0.69 (about ln 2), rounded down, kept from 1 to 30.
- Link: [util/bloom.cc, lines 20 to 23 (LevelDB 1.23)](https://github.com/google/leveldb/blob/99b3c03b3284f5886f9ef9a4ef703d57373e61be/util/bloom.cc#L20-L23)
- Quote: "We intentionally round down to reduce probing cost a little bit"; "k_ = static_cast<size_t>(bits_per_key * 0.69);"; "0.69 =~ ln(2)"; "if (k_ < 1) k_ = 1;"; "if (k_ > 30) k_ = 30;"
- Type 1. Status: sourced. Comment markers dropped; the inline comment on the `k_ =` line is quoted separately.

### Claim 4.5. The filter has n x bits-per-key bits, at least 64, rounded up to whole bytes.
- Link: [util/bloom.cc, lines 29 to 37 (LevelDB 1.23)](https://github.com/google/leveldb/blob/99b3c03b3284f5886f9ef9a4ef703d57373e61be/util/bloom.cc#L29-L37)
- Quote: "size_t bits = n * bits_per_key_;"; "For small n, we can see a very high false positive rate. Fix it by enforcing a minimum bloom filter length."; "if (bits < 64) bits = 64;"; "size_t bytes = (bits + 7) / 8;"; "bits = bytes * 8;"
- Type 1. Status: sourced. Comment markers dropped.

### Claim 4.6. The k probe positions come from one hash by double hashing.
- Link: [util/bloom.cc, lines 44 to 52 (LevelDB 1.23)](https://github.com/google/leveldb/blob/99b3c03b3284f5886f9ef9a4ef703d57373e61be/util/bloom.cc#L44-L52)
- Quote: "Use double-hashing to generate a sequence of hash values."; "See analysis in [Kirsch,Mitzenmacher 2006]."; "const uint32_t delta = (h >> 17) | (h << 15);"; "Rotate right 17 bits"; "const uint32_t bitpos = h % bits;"; "array[bitpos / 8] |= (1 << (bitpos % 8));"; "h += delta;"
- Type 1. Status: sourced. Comment markers dropped.

### Claim 4.7. A lookup answers no at the first probed bit that is 0, and yes if all are 1.
- Link: [util/bloom.cc, lines 72 to 79 (LevelDB 1.23)](https://github.com/google/leveldb/blob/99b3c03b3284f5886f9ef9a4ef703d57373e61be/util/bloom.cc#L72-L79)
- Quote: "if ((array[bitpos / 8] & (1 << (bitpos % 8))) == 0) return false;"; "return true;"
- Type 1. Status: sourced.

### Claim 4.8. LevelDB hashes the key's bytes with a fixed seed to start a filter probe.
- Link: [util/bloom.cc, lines 13 to 15 (LevelDB 1.23)](https://github.com/google/leveldb/blob/99b3c03b3284f5886f9ef9a4ef703d57373e61be/util/bloom.cc#L13-L15)
- Quote: "return Hash(key.data(), key.size(), 0xbc9f1d34);"
- Type 1. Status: sourced.
