# LevelDB: a Bloom filter in front of the disk

A database that keeps its data on disk would like to know, before it reads, that a key is not there. A **Bloom filter** answers that from a small array of bits kept in memory. It can be wrong in one direction only. This Chapter reads LevelDB 1.23's version of it: how big it makes the array, how many bits it sets per key, and how it finds those bits from one hash. The Problems build it on the Build's bitmap.

## What the filter is for, and what it promises

LevelDB's header says what the filter is for: "These filters are stored in leveldb and are consulted automatically by leveldb to decide whether or not to read some information from disk." ([include/leveldb/filter_policy.h, lines 5 to 11](https://github.com/google/leveldb/blob/99b3c03b3284f5886f9ef9a4ef703d57373e61be/include/leveldb/filter_policy.h#L5-L11); comment markers dropped.) And it states the promise a filter must keep, which is the whole contract of a Bloom filter: "This method must return true if the key was in the list of keys passed to CreateFilter()." and "This method may return true or false if the key was not on the list, but it should aim to return false with a high probability." ([lines 46 to 50](https://github.com/google/leveldb/blob/99b3c03b3284f5886f9ef9a4ef703d57373e61be/include/leveldb/filter_policy.h#L46-L50); comment markers dropped.)

So a "no" is always right, and a "yes" is only probably right. A wrong "yes" is a **false positive**: the database goes to disk for a key that is not there. A wrong "no" would lose data, and the contract rules it out. The header also gives a figure for the built-in filter: "A good value for bits_per_key is 10, which yields a filter with ~ 1% false positive rate." ([lines 54 to 56](https://github.com/google/leveldb/blob/99b3c03b3284f5886f9ef9a4ef703d57373e61be/include/leveldb/filter_policy.h#L54-L56); comment markers dropped.)

## How big, and how many probes

The size comes from the number of keys, n, and the bits spent on each: `size_t bits = n * bits_per_key_;`. Two rules adjust it. "For small n, we can see a very high false positive rate. Fix it by enforcing a minimum bloom filter length." is followed by `if (bits < 64) bits = 64;`. And the filter is stored in whole bytes: `size_t bytes = (bits + 7) / 8;` and then `bits = bytes * 8;`. ([util/bloom.cc, lines 29 to 37](https://github.com/google/leveldb/blob/99b3c03b3284f5886f9ef9a4ef703d57373e61be/util/bloom.cc#L29-L37); comment markers dropped.) The size is therefore a multiple of 8 bits and at least 64. The Problem `bloomsize` asks for it.

The number of bits set per key, k, is fixed by the same setting: `k_ = static_cast<size_t>(bits_per_key * 0.69);`, with the comment `0.69 =~ ln(2)`, and then `if (k_ < 1) k_ = 1;` and `if (k_ > 30) k_ = 30;`. The code says why it rounds down: "We intentionally round down to reduce probing cost a little bit". ([util/bloom.cc, lines 20 to 23](https://github.com/google/leveldb/blob/99b3c03b3284f5886f9ef9a4ef703d57373e61be/util/bloom.cc#L20-L23); comment markers dropped.) The factor is a choice of the library; the Problem uses it as given. With 10 bits per key, 10 times 0.69 is 6.9, rounded down to 6, and 6 probes per key.

## Many bit positions from one hash

A Bloom filter needs k different bit positions for each key. LevelDB computes one hash and derives the rest: "Use double-hashing to generate a sequence of hash values." and cites "See analysis in [Kirsch,Mitzenmacher 2006]." The code:

```c
uint32_t h = BloomHash(keys[i]);
const uint32_t delta = (h >> 17) | (h << 15);  // Rotate right 17 bits
for (size_t j = 0; j < k_; j++) {
  const uint32_t bitpos = h % bits;
  array[bitpos / 8] |= (1 << (bitpos % 8));
  h += delta;
}
```

([util/bloom.cc, lines 44 to 52](https://github.com/google/leveldb/blob/99b3c03b3284f5886f9ef9a4ef703d57373e61be/util/bloom.cc#L44-L52); comment markers dropped.) The first hash `h` is the first probe, and each next probe adds `delta`, a rotation of `h`, with the 32-bit arithmetic wrapping. `BloomHash` hashes the key's bytes: `return Hash(key.data(), key.size(), 0xbc9f1d34);`. ([lines 13 to 15](https://github.com/google/leveldb/blob/99b3c03b3284f5886f9ef9a4ef703d57373e61be/util/bloom.cc#L13-L15)) The Problem has its own hash, written for it and described in its statement, that turns a 32-bit key into a 32-bit `h`; everything after that is the code above. Bit `p` is bit `p % 8` of byte `p / 8` in LevelDB, which is the same place as bit `p % 32` of word `p / 32` in the Build's little-endian bit order, so the filter lives in the sequence of words from the second Chapter.

## Asking

A lookup walks the same positions and gives up at the first bit that is not set: `if ((array[bitpos / 8] & (1 << (bitpos % 8))) == 0) return false;`, and if it gets through every probe, `return true;`. ([util/bloom.cc, lines 72 to 79](https://github.com/google/leveldb/blob/99b3c03b3284f5886f9ef9a4ef703d57373e61be/util/bloom.cc#L72-L79)) A key that was added has all k of its bits set and can never be rejected. A key that was not added is accepted only if the other keys happened to set all k of its bits.

Building the filter for n keys is O(n × k) in the **worst case**, and a lookup is O(k) in the **worst case**. Since k is at most 30, a lookup is a constant number of steps however many keys the filter holds. The "yes" is **expected** to be wrong about 1 percent of the time for 10 bits per key, by the header's figure, not by anything the Problems prove.

## What the Problems build

`bloomsize N B` prints the size and the number of probes for N keys at B bits per key. `bloom B keys...` builds the filter into the sequence, and `maybe X` asks it. Because the filter is the sequence, `ushow`, `test` and the rest of the Build can look at its bits.
