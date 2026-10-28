An **Extra Problem**: it branches off after `bitset` and does not affect completing the Topic.

# Bit order reversed

The kernel's `bitrev32` reverses the order of the bits of a word. It has a table version and a version made of swaps. This Problem asks for the result.

Add to the Build:

| Command | What it does | Prints |
|---|---|---|
| `reverse` | Reverses the 32 bits of each word, so bit 0 goes to bit 31, bit 1 to bit 30, and so on. The sequence does not change. | the reversed words as unsigned numbers, separated by single spaces; an empty line if the sequence is empty |

## Example

Input:

```
load 1 2 4294967295 2147483648
reverse
```

Output:

```
2147483648 1073741824 4294967295 1
```

The word `1` has only bit 0 set; reversed, only bit 31 is set, which is 2147483648. The word `4294967295` has every bit set and reverses to itself.
