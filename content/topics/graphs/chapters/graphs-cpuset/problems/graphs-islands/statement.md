# Count the islands

OpenCV labels the connected parts of a picture with a union-find: its source has a find whose comment says "Find the root of the tree of the node i and compress the path in the process" ([connectedcomponents.cpp, line 221 (OpenCV 4.9.0)](https://github.com/opencv/opencv/blob/dad8af6b17f8e60d7b95a1203a1b4d22f56574cf/modules/imgproc/src/connectedcomponents.cpp#L221)); [Linux cpusets: merging overlapping sets](/chapters/graphs-cpuset) reads it. This Extra Problem branches off `same`, and nothing you add here is carried into the Problems after it. It does not use the graph.

Add:

| Command | What it does | Prints |
|---|---|---|
| `grid R1 R2 ...` | Replaces the grid. Each argument is one row, a word of `1` (land) and `0` (water). All the rows are the same length. With no arguments the grid is empty. | nothing |
| `islands C` | Counts the islands in the grid. `C` is `4` or `8`. | the number of islands |

Two land cells are next to each other if they share a side. When `C` is `8` they are also next to each other if they touch at a corner. An **island** is a set of land cells that you can walk through from any of them to any other by steps between cells that are next to each other. `clear` does not touch the grid. With no grid, or no land, the answer is `0`.

## Example

Input:

```
grid 1000 0100 0011
islands 4
islands 8
```

Output:

```
3
1
```

The grid is three rows of four cells. With `4` the land at the top left, the land in the middle and the pair at the bottom right are three islands. With `8` the corners touch, and all four cells and the pair are one island.
