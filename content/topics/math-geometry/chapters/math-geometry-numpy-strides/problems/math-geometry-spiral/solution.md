Walk the outside of the part of the matrix that is not read yet, then shrink that part by one on each side.

```
top = 0; bottom = rows - 1; left = 0; right = cols - 1
while top <= bottom and left <= right:
    read at(top, j) for j = left .. right
    read at(i, right) for i = top + 1 .. bottom
    if top < bottom: read at(bottom, j) for j = right - 1 down to left
    if left < right: read at(i, left) for i = bottom - 1 down to top + 1
    top++; bottom--; left++; right--
```

The two `if` lines matter when only one row or column is left. With one row, the first line reads it, the second does nothing (no rows below the top), and without the first `if` the bottom row would be read again. With one column, the first line reads its top item, the second reads the rest, and without the second `if` the left column would be read again.

Every item is read exactly once, so the time is O(R x C) in the worst case. Extra space is O(1) beyond the output. Because it goes through `at`, the same code spirals through a view that has been turned.
