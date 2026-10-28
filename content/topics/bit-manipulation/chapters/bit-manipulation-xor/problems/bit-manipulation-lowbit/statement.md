# Lowest bit, power of two

The kernel's `is_power_of_2` is a single test, `n != 0 && (n & (n - 1)) == 0`. The lowest set bit of a number is what the trick is built on. This Problem has two commands that read each word that way.

Add to the Build. Here every word is read as unsigned, from 0 to 4294967295.

| Command | What it does | Prints |
|---|---|---|
| `lowbit` | For each word, the value of its lowest bit that is on: a word with only that bit set. `0` for the word 0. | the values as unsigned numbers, separated by single spaces; an empty line if the sequence is empty |
| `pow2` | For each word, whether it is a power of two (1, 2, 4, 8, ..., 2147483648). The word 0 is not. | `yes` or `no` for each word, separated by single spaces; an empty line if the sequence is empty |

The sequence does not change.

## Example

Input:

```
load 12 8 0 -2147483648
lowbit
pow2
```

Output:

```
4 8 0 2147483648
no yes no yes
```

12 is `1100`, whose lowest bit on is 4. 8 is a power of two. The word `-2147483648` is 2147483648, the top bit alone: a power of two, and its own lowest bit.
