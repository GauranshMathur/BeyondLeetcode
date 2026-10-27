# Palindrome around the padding

A sequence is a **palindrome** if it reads the same forwards and backwards. Here zeros are padding that does not count, wherever they are: only the non-zero items are compared.

Add:

| Command | What it does | Prints |
|---|---|---|
| `palindrome` | Checks whether the non-zero items, in order, read the same in both directions. It does not change the sequence. | `yes` or `no` |

A sequence with no non-zero items (including the empty one) is a palindrome.

## Example

Input:

```
load 1 0 2 0 2 1
palindrome
```

Output:

```
yes
```

Ignoring zeros, the items are `1 2 2 1`, which reads the same both ways, so the answer is `yes`.
