# Power by squaring

The Linux kernel's `int_pow` raises a base to a power in one pass over the bits of the exponent. Add it to the Build, with the answer wrapped the way a 64-bit unsigned integer wraps.

| Command | What it does | Prints |
|---|---|---|
| `pow64 B E` | Raises `B` to the power `E`, modulo 2^64. | the result |

`B` is a whole number from 0 to 18,446,744,073,709,551,615 (2^64 - 1) and `E` is a whole number from 0 to 4,294,967,295 (2^32 - 1). The result is the remainder after dividing the true power by 18,446,744,073,709,551,616 (2^64). Any base to the power 0 is 1, including a base of 0.

An exponent of 4 billion is too many multiplications to do one at a time within the time limit. Use the loop in the Chapter instead: one pass for each bit of `E`.

## Example

Input:

```
pow64 2 10
pow64 3 0
pow64 2 64
pow64 2 63
```

Output:

```
1024
1
0
9223372036854775808
```

The last example line is 2^63. The one before it is 2^64, which wraps to 0.
