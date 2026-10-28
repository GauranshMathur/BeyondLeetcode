# Giving up past a limit

An **Extra Problem**: it branches off after `edit` and does not affect completing the Topic.

PostgreSQL's `levenshtein_less_equal` only promises the right distance when it is at most a limit, and stops early otherwise ([the Chapter](/chapters/dp-2d-postgres) reads how). Add the same promise.

| Command | What it does | Prints |
|---|---|---|
| `within INS DEL SUB LIMIT` | Finds the cost `edit INS DEL SUB` would print, if it is at most `LIMIT`. | that cost, or `over` if it is more than `LIMIT` |

`INS`, `DEL` and `SUB` are whole numbers between 1 and 100, as for `edit`, and `LIMIT` is between 0 and 100000. The costs and the words are those of `edit`. The Tests cannot see how much work you skip, but the Solution can stop after a row, and it is worth doing so: a distance far over the limit is known after a few rows. The words do not change.

## Example

Input:

```
words marble ramble
edit 1 1 1
within 1 1 1 3
within 1 1 1 2
within 1 1 1 0
```

Output:

```
2
2
2
over
```

`edit 1 1 1` is 2. A limit of 3 and a limit of 2 both allow it, so `within` prints the cost, 2. A limit of 0 allows only identical words, so it prints `over`.
