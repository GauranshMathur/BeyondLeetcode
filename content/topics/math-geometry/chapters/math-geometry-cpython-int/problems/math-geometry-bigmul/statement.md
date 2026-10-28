# Multiply long numbers

Add a command that multiplies numbers too long for any machine integer, the way CPython's grade-school loop does in the Chapter.

| Command | What it does | Prints |
|---|---|---|
| `mul A B` | Multiplies the non-negative whole numbers `A` and `B`, each given as decimal text. | the product, as decimal text |

`A` and `B` are each 1 to 60 digits, with no leading zeros unless the number is 0 itself. The product has no leading zeros either, and is `0` when either number is 0.

Their values do not fit in a 64-bit integer, so do not turn the whole text into one number and do not use a big-number type. Keep each number as an array of digits, one digit per slot, and multiply them as the Chapter's loop does, with carries.

## Example

Input:

```
mul 12 34
mul 0 987654321
mul 99 99
```

Output:

```
408
0
9801
```
