Compute the size and `k` as in `bloomsize`, make a sequence of `ceil(size / 32)` zero words, and remember the size and `k`. For each key compute the hash `h`, the step `delta`, and visit `k` positions `h % size`, adding `delta` to `h` (wrapping at 32 bits) after each. Building turns the flag on at every position; `maybe` returns `no` at the first position whose flag is off and `yes` if none is.

The size is a multiple of 8 but not always of 32, so the last word of the sequence may have flags that are never used. `maybe` must treat a flag past the end of the sequence as off, which matters after a `load` has replaced the filter's words with fewer.

Building is O(n × k) in the worst case for n keys, since each key makes `k` probes, and `maybe` is O(k) in the worst case. `k` is at most 30, so a lookup is a constant number of steps. The filter takes O(size / 32) space.

**Language notes.** The hash multiplies two 32-bit numbers. In TypeScript use `Math.imul` and `>>> 0`; a plain `*` would lose bits. In Go, `uint32` multiplication and addition wrap. In Python, mask with `0xFFFFFFFF` after the multiply, the add and the rotate. A position is `h % size` with `h` as an unsigned number.

**Edges.** A filter for 0 keys has 64 bits, all off, so every `maybe` is `no`. A key added twice is the same flags. A key that was added is always `yes`. A key that was not added can be `yes` too, and the tests include some, which is the point of the filter: a `yes` is only probably right.
