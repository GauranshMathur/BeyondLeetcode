Add `policy go`: the rule of `nextslicecap` in Go 1.22.0, as quoted in the Chapter, without the allocator's rounding.

When `append` finds the block full:

- If the capacity is below 256, the new capacity is twice the old one, or 1 if the old one is 0.
- Otherwise the new capacity is `cap + ((cap + 768) >> 2)`.

`pop` never changes the capacity under `go`.

## Example

Input:

```
policy go
fill 256 1
cap
append 1
cap
fill 256 1
cap
copies
```

Output:

```
256
512
832
1023
```

At capacity 512 the next step adds `(512 + 768) >> 2 = 320`.
