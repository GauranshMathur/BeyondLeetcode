Give the caller the two controls from the Chapter.

| Command | What it does | Prints |
|---|---|---|
| `reserve N` | Makes sure the capacity is at least `N`. If it is already, nothing happens. If not, move to a block of exactly `N` slots. | nothing |
| `shrink` | Removes the spare room. If the capacity is larger than the length, move to a block of exactly `length` slots. If not, nothing happens. | nothing |

Both work the same under every policy. A move adds the number of items copied to the copies counter, as always. After either command, `append` and `pop` carry on with the policy's own rule from the capacity they find.

`N` is at most 200,000.

## Example

Input:

```
policy double
reserve 100
cap
fill 100 1
cap
copies
append 2
cap
copies
```

Output:

```
100
100
0
200
100
```

A hundred appends with no copies at all. Without `reserve`, `double` would have copied 127 items to get there.
