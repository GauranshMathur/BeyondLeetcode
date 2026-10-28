# Power with a modulus

Give the same loop any modulus, as Python's three-argument `pow` does.

| Command | What it does | Prints |
|---|---|---|
| `powmod B E M` | Raises `B` to the power `E`, modulo `M`. | the result |

`B` and `E` are whole numbers from 0 to 1,000,000,000,000,000,000 (10^18), and `M` is a whole number from 1 to 2,147,483,647 (2^31 - 1). The result is a whole number from 0 to `M - 1`: the remainder after dividing the true power by `M`. For `E` of 0 the true power is 1, so the result is 1 modulo `M`, which is 0 when `M` is 1.

The true power is far too large to build, so reduce after every multiplication, as the Chapter explains. Because `M` is below 2^31, the product of two reduced numbers is below 2^62 and fits in a 64-bit signed integer.

## Example

Input:

```
powmod 2 10 1000
powmod 5 0 7
powmod 5 3 1
powmod 7 128 13
```

Output:

```
24
1
0
3
```
