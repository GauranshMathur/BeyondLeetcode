# Rebuild the lost block

In a RAID 5 stripe, the kernel rebuilds a lost block by XORing every other block of the stripe into it, parity included. Here the words are blocks.

Add to the Build:

| Command | What it does | Prints |
|---|---|---|
| `recover` | The sequence holds every block of one stripe except the lost one. XORs the words together. The sequence does not change. | the result as an unsigned number; `0` if the sequence is empty |

The same command answers another question: when every value in the sequence appears twice except one, `recover` prints the one that appears once.

## Example

Input:

```
load 5 12 6
recover
load 7 7 9 3 3
recover
```

Output:

```
15
9
```

`5 ^ 12 ^ 6` is 15. In the second sequence the two 7s and the two 3s cancel, and 9 is left.
