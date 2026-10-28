# The filter itself

Build the filter and ask it. The bits of the filter live in the sequence of words, with bit `p` of the filter being flag `p` of the bitset, so the Build's other commands can look at it.

Add to the Build:

| Command | What it does | Prints |
|---|---|---|
| `bloom B x1 x2 ...` | Builds the filter for the keys `x1 x2 ...` at `B` bits per key, and replaces the sequence with it. | nothing |
| `maybe X` | Asks the filter built last whether `X` may be one of its keys. | `yes` or `no` |

Keys are written as whole numbers from -2147483648 to 4294967295, and a key is its 32 bits, like a word. With no keys, the filter is built for 0 keys.

**Building.** Find the size in bits and the number of probes `k` as `bloomsize` does, for `N` equal to the number of keys given, counting a repeated key each time. Replace the sequence with `ceil(size / 32)` words, all 0. Then for each key, in order:

1. Let `x` be the key's 32 bits as an unsigned number. Let `h = (x * 0x9E3779B1 + 0x7F4A7C15) mod 2^32`, then `h = h XOR (h >> 16)`. (This hash is written for this Problem; LevelDB hashes the bytes of the key.)
2. Let `delta` be `h` rotated right by 17 bits, as a 32-bit number: `(h >> 17) | (h << 15)`, keeping 32 bits.
3. Repeat `k` times: turn on flag `h mod size`, then set `h = (h + delta) mod 2^32`.

**Asking.** `maybe X` uses the size and `k` of the filter built last, finds `X`'s positions the same way, and prints `no` as soon as one of the flags is off, and `yes` if all `k` are on. It reads the sequence as it is now, so a flag past the end of the sequence is off. If no filter was built yet, it prints `no`.

## Example

Input:

```
bloom 10 1 2 3
maybe 2
maybe 99
ushow
```

Output:

```
yes
no
83968449 1090585604
```

Three keys at 10 bits make 30 bits, raised to 64, so the sequence is two words, and `k` is 6. Key 2 was added, so it must be a `yes`. Key 99 finds a flag that is off.
