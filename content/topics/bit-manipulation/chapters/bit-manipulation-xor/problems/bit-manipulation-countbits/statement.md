# Weights from 0 to N

How many bits are on in each of the numbers 0, 1, 2, ..., N? Clearing the lowest set bit gives a smaller number you have already counted.

Add to the Build:

| Command | What it does | Prints |
|---|---|---|
| `countbits N` | For every number from 0 up to and including `N`, counts the bits that are on in it. This command does not use the sequence. | the `N + 1` counts, separated by single spaces |

`N` is from 0 to 10,000.

## Example

Input:

```
countbits 5
```

Output:

```
0 1 1 2 1 2
```

0 has no bits on; 3 is `11`, so 2; 5 is `101`, so 2.
