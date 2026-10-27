# Hits, misses and a cache of size 0

`lru_cache` also keeps statistics, can be cleared, and treats a size of 0 as "cache nothing". Add all three.

Changes and additions:

| Command | What it does | Prints |
|---|---|---|
| `cache C` | as before, and now `C` may be 0. A new cache also starts with 0 hits and 0 misses | nothing |
| `call K V` | as before, and now each hit adds 1 to the hit count and each miss adds 1 to the miss count. In a cache of size 0 nothing is stored, so every call is a miss and prints `miss` | as before |
| `info` | reads the statistics | `hits=H misses=M maxsize=C currsize=S` with the two counts, the size `C` given to `cache`, and the number of entries now in the cache |
| `clear` | empties the cache and sets both counts to 0. The size `C` stays | nothing |

## Example

Input:

```
cache 2
call 1 10
call 1 10
call 2 20
call 3 30
info
clear
info
order
cache 0
call 5 50
call 5 50
info
```

Output:

```
miss
hit 10
miss
miss evict 1
hits=1 misses=3 maxsize=2 currsize=2
hits=0 misses=0 maxsize=2 currsize=0
-
miss
miss
hits=0 misses=2 maxsize=0 currsize=0
```

Of the four calls, one is a hit and three are misses; the cache ends with two entries. `clear` zeroes both counts and empties the cache, and `maxsize` stays 2. In a cache of size 0 the second `call 5 50` is a miss too, since the first stored nothing.
