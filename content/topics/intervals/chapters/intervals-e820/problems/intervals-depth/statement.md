# How many overlap at once

The Chapter reads how the Linux kernel's e820 code walks the edges of overlapping ranges from left to right. This Problem asks for the largest number of intervals that overlap at one number. The rule below is written for this Problem; it uses the idea in the Chapter, not the kernel's code.

Add:

| Command | What it does | Prints |
|---|---|---|
| `depth` | Looks at the intervals that `add` and `place` have put in, as they were given and not merged, and finds the whole number that is held by the most of them. | how many intervals hold that number; `0` if no interval has been added |

Intervals that only touch without sharing a number, like `1 3` and `4 6`, do not count together. `3 5` and `5 8` share the number 5, so they do. `depth` changes nothing.

## Example

Input:

```
add 1 5
add 3 8
add 5 9
add 20 21
depth
```

Output:

```
3
```

The number 5 is held by `1 5`, `3 8` and `5 9`: three intervals. No number is held by more.
