# Wrap at 32 bits

The Build for this Topic is a small calculator. Your program reads commands from standard input, one per line, until the input ends, and writes its answers to standard output. Skip empty lines. You start from an empty file.

The Chapter shows that Go's `int32` wraps when a result does not fit, and that Python's integers never do. Your first commands do arithmetic on 32-bit signed integers, in whichever Language you chose: when the true result does not fit, give the wrapped one.

| Command | What it does | Prints |
|---|---|---|
| `add32 A B` | Adds `A` and `B` as 32-bit signed integers. | the result |
| `mul32 A B` | Multiplies `A` and `B` as 32-bit signed integers. | the result |

`A` and `B` are whole numbers from -2,147,483,648 to 2,147,483,647. The result is the number in that same range that differs from the true result by a multiple of 4,294,967,296 (2^32).

## Example

Input:

```
add32 2147483647 1
add32 100 -250
mul32 65536 65536
mul32 -7 6
```

Output:

```
-2147483648
-150
0
-42
```

The true sum of the first line is 2,147,483,648, one past the range, so it wraps to the lowest number. The true product of the third line is 4,294,967,296, which is a multiple of 2^32 and wraps to 0.
