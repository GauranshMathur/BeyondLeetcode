# Cutting by a vocabulary

An **Extra Problem**: it branches off after `decode` and does not affect completing the Topic.

The codes 1 to 26 were a fixed vocabulary. Now the vocabulary is given, and you ask both questions of the Chapter in one go: how many cuts there are, and how few pieces the best one uses. Both come from one table with two numbers per place.

The sequence is a row of digits, as in `decode`. A **piece** is a non-empty string of digits, which may start with 0. A **cut** splits the whole row, in order, into pieces from the list. A piece may be used any number of times, and a piece that is listed twice counts once.

Add:

| Command | What it does | Prints |
|---|---|---|
| `vocab p1 p2 ...` | Counts the cuts of the row into the listed pieces, and finds the cut with the fewest pieces. | the number of cuts, modulo 1000000007, then a single space, then the fewest pieces in any cut; `1 0` for an empty row; `0 -1` if there is no cut |

The list has at least one piece. The row has at most 3000 digits, and each piece has at most 10 digits. The sequence does not change.

## Example

Input:

```
load 1 2 1 2 1
vocab 1 2 12 21
load 1 3
vocab 12 3
vocab 1 3 13
```

Output:

```
8 3
0 -1
2 1
```

The row `12121` has 8 cuts into the pieces 1, 2, 12 and 21, and the best, `12|12|1`, has 3 pieces. The row `13` has no cut into 12 and 3. Into 1, 3 and 13 it has two: `1|3` and `13`, and the second uses 1 piece.
