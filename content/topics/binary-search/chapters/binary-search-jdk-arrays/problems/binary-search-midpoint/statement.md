The Build for this Topic is a small search tool for integers. You start from an empty file.

Your program reads commands from standard input, one per line, until the input ends. Skip empty lines.

In this first Problem you build the midpoint of two indexes, the way Java's `Arrays.binarySearch` had it before and after its bug. Both commands take two integers `L` and `H`, with `0 <= L <= 2,147,483,647` and `0 <= H <= 2,147,483,647`.

| Command | What it does | Prints |
|---|---|---|
| `naive L H` | Works out `(L + H) / 2` the way Java did with `int` variables: the sum is held in 32 bits, signed, so a sum above 2,147,483,647 wraps around by 4,294,967,296 to a negative number; then the division by 2 drops the fraction by truncating toward zero. | the result |
| `mid L H` | The exact average of `L` and `H`, rounded down. It must be right for every `L` and `H` in range. | the result |

Python and TypeScript do not overflow on this sum the way Java does, so `naive` has to reproduce the wrap-around on purpose. In Go, converting a sum to `int32` does it for you.

## Example

Input:

```
naive 3 4
mid 3 4
naive 1500000000 2000000000
mid 1500000000 2000000000
```

Output:

```
3
3
-397483648
1750000000
```

The sum in the third line is 3,500,000,000, which wraps to -794,967,296; half of that, truncated toward zero, is -397,483,648. The exact average in the fourth line is 1,750,000,000.
