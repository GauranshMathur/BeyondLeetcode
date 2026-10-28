A quarter turn clockwise puts the old item `(n - 1 - j, i)` at the new `(i, j)`. Items move in cycles of four, one from each side of a ring, so the turn needs one spare variable and no second block.

```
for i in 0 .. n/2 - 1:
    for j in i .. n - 2 - i:
        held = a[i][j]
        a[i][j] = a[n-1-j][i]
        a[n-1-j][i] = a[n-1-i][n-1-j]
        a[n-1-i][n-1-j] = a[j][n-1-i]
        a[j][n-1-i] = held
```

Each cycle moves four items and the cycles cover each item once, so every item is moved exactly once. For an odd `n` the centre item stays put, and the loops never touch it.

`spin` only applies when the view is the standard one: a turned view would make "the item at `(i, j)`" a different block position, and the move would not do what its name says. The Reference Code checks the offset and the two strides, and the number of rows and columns, before it moves anything.

Compare it with `rotate`: `rotate` is O(1) in the worst case and moves nothing. `spin` is O(n^2) in time, the number of items, in the worst case, with O(1) extra space.
