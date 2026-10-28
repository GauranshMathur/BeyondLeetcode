# Count the multiplications

An **Extra Problem**: it branches off after `powmod` and does not affect completing the Topic.

The Chapter reads two loops for the same job: the kernel's, which starts from the lowest bit of the exponent, and CPython's, which starts from the highest. They do not make the same number of multiplications.

| Command | What it does | Prints |
|---|---|---|
| `muls E` | Counts the multiplications each loop makes for the exponent `E`. | two whole numbers separated by one space: the kernel's count, then the left-to-right count |

`E` is a whole number from 0 to 1,000,000,000,000,000,000 (10^18). The counting rules are written for this Problem:

- **The kernel's loop.** It has one pass for each bit of `E`, up to the highest set bit. Every pass makes one multiplication, `base *= base`, and one more, `result *= base`, when the lowest bit of `E` is 1. Passes happen while `E` is not 0.
- **The left-to-right loop.** The result starts as the base itself, which stands for the highest set bit and costs nothing. Then, for each of the remaining bits of `E`, from the highest down, it makes one multiplication to square the result, and one more when that bit is 1.

With `E` of 0 neither loop makes a multiplication. With `E` of 1 the kernel's loop makes 2 and the left-to-right loop makes 0.

## Example

Input:

```
muls 0
muls 1
muls 10
muls 15
```

Output:

```
0 0
2 0
6 4
8 6
```

`10` is 1010 in binary: 4 bits, 2 of them set. The kernel's loop makes 4 + 2 = 6 multiplications. The left-to-right loop has 3 bits left after the first, so it makes 3 squarings and 1 more multiplication for the set bit, 4 in all.
