# What the cache would report

An **Extra Problem**: it branches off after `ways` and does not affect completing the Topic.

`functools.cache` counts its **hits** and its **misses**. Here you predict them for one call, without running the cache. Take the recursion behind `ways`: `ways(0)` is 1, and for `n` above 0, `ways(n)` is the sum of `ways(n - step)` over the step sizes that are at most `n`. Make it memoised, with an empty cache at the start, and call `ways(N)` once. Every call to `ways` looks in the cache first. A call whose argument is already in the cache is a **hit**. Any other call is a **miss**, and it computes its answer, calling `ways` for each smaller argument in turn.

Add:

| Command | What it does | Prints |
|---|---|---|
| `cache N` | Counts the hits and the misses of that one call `ways(N)`, the call itself included. | the hits and the misses, separated by a single space |

`N` is between 0 and 300. The call `ways(N)` itself is a miss. The sequence does not change.

## Example

Input:

```
load 1 2
cache 3
```

Output:

```
2 4
```

`ways(3)` is a miss and calls `ways(2)`, a miss, which calls `ways(1)`, a miss, which calls `ways(0)`, a miss. Back in `ways(2)`, the step 2 calls `ways(0)`, a hit. Back in `ways(3)`, the step 2 calls `ways(1)`, a hit. There are 6 calls: 4 misses and 2 hits.
