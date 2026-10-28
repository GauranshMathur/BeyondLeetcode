# Least common multiple

An **Extra Problem**: it branches off after `gcd` and does not affect completing the Topic.

The kernel's `lcm` sits next to its `gcd`, and uses it.

| Command | What it does | Prints |
|---|---|---|
| `lcm A B` | Finds the least common multiple of `A` and `B`. | the least common multiple |

`A` and `B` are whole numbers from 0 to 3,000,000,000. The result is 0 when either number is 0, as in the kernel's code in the Chapter. The largest possible result, 9,000,000,000,000,000,000, fits in a 64-bit unsigned integer.

## Example

Input:

```
lcm 4 6
lcm 0 5
lcm 7 0
lcm 5 5
```

Output:

```
12
0
0
5
```
