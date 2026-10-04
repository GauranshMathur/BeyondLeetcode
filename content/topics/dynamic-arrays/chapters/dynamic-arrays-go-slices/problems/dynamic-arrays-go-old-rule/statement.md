Add `policy go117`: the rule Go used up to Go 1.17, as quoted in the Chapter, so you can put the two side by side.

When `append` finds the block full:

- If the capacity is below 1024, the new capacity is twice the old one, or 1 if the old one is 0.
- Otherwise the new capacity is `cap + cap / 4`, with the remainder of the division dropped.

`pop` never changes the capacity under `go117`.

## Example

Input:

```
policy go117
fill 1024 1
cap
append 1
cap
fill 256 1
cap
copies
```

Output:

```
1024
1280
1600
3327
```
