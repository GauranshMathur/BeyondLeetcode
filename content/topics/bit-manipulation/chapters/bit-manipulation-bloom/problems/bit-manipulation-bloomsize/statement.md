# How big a filter

LevelDB's Bloom filter sets its size from the number of keys and the bits it spends on each, and its number of probes from the bits per key. Compute both.

Add to the Build:

| Command | What it does | Prints |
|---|---|---|
| `bloomsize N B` | Finds the size of a filter for `N` keys at `B` bits per key, and its number of probes. This command does not use the sequence. | the size in bits and the number of probes, separated by a space |

The rules, which follow LevelDB 1.23's:

1. The size starts at `N * B` bits. If that is less than 64, it becomes 64.
2. The size is rounded up to a whole number of bytes, and is written in bits, so it is a multiple of 8.
3. The number of probes is `B` times 0.69, as a floating-point multiplication, with the fraction dropped. If that is less than 1 it becomes 1, and if it is more than 30 it becomes 30.

`N` is from 0 to 1,000,000 and `B` is from 1 to 100.

## Example

Input:

```
bloomsize 100 10
```

Output:

```
1000 6
```

100 keys at 10 bits is 1000 bits, already a whole number of bytes (125). 10 times 0.69 is 6.9, so 6 probes.
