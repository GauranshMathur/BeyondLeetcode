# Which letters they share

Hunspell's `lcslen` walks back through its table, one step per cell, counting the steps that match ([the Chapter](/chapters/dp-2d-hunspell) reads it). Here the walk collects the letters. The words and the table are those of `common`.

Add:

| Command | What it does | Prints |
|---|---|---|
| `trace` | Writes one longest common subsequence, found by the walk below. | that subsequence; `-` if it is empty |

Fill the table of `common`: `c[i][j]` is the length of the longest common subsequence of the first `i` letters of the first word and the first `j` letters of the second. Then walk back from `i` = the length of the first word and `j` = the length of the second, with an empty result. While `i` and `j` are both above 0:

1. If letter `i` of the first word (counting from 1) equals letter `j` of the second, add that letter to the result and subtract 1 from both `i` and `j`.
2. Otherwise, if `c[i - 1][j]` is at least `c[i][j - 1]`, subtract 1 from `i`.
3. Otherwise, subtract 1 from `j`.

The result, read backwards, is the answer. Two words can have several longest common subsequences, and the rule decides which one is printed: when the cell above ties the cell to the left, the walk goes up, as the `>=` does in Hunspell. The Tests expect exactly the word this walk gives. `common` and the commands before it still have to work.

## Example

Input:

```
words marble ramble
trace
words ace abcde
trace
words - xyz
trace
```

Output:

```
mble
ace
-
```

`marble` and `ramble` have several subsequences of length 4 in common, among them `mble`, `able` and `rble`. The walk takes `e`, `l` and `b` from the ends. Then it meets `r` against `m`, which differ, and the cells above and to the left tie, so it goes up. It meets `a` against `m`, which differ again, goes up again on a tie, and takes `m`. Read backwards, that is `mble`. An empty first word has nothing in common with `xyz`, so the walk prints `-`.
