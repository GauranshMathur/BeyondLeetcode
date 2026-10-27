# Triples that cancel

Add:

| Command | What it does | Prints |
|---|---|---|
| `triples` | The sequence is sorted. Counts the **distinct** value triples `(x, y, z)` with `x <= y <= z` that add up to 0, where the three items come from three different positions. | the count |

Two triples are the same if they have the same three values, however they are spread over the positions. The sequence does not change.

## Example

Input:

```
load -7 -3 -3 1 2 4 5 5
triples
```

Output:

```
2
```

The distinct triples that add up to 0 are (-7, 2, 5) and (-3, 1, 2). The value 5 appears twice, so (-7, 2, 5) can be formed in two ways, but it is counted once.
