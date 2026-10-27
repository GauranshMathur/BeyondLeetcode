# A cache that evicts the oldest call

Python's `functools.lru_cache` remembers the results of the last N calls of a function. Here you model it. The function is a black box: `call K V` means "the function was called with the argument `K`, and if it actually runs it returns `V`".

Use a ring of nodes from the earlier Problems for the order, and your language's built-in map (a Python `dict`, a TypeScript `Map`, a Go `map`) to find the node of a key. A node is four cells: `next`, `prev`, a key and a result. The tests do not look at addresses.

Add:

| Command | What it does | Prints |
|---|---|---|
| `cache C` | starts a new empty cache that holds at most `C` keys (`C` is at least 1), forgetting any old one | nothing |
| `call K V` | if `K` is in the cache, this is a **hit**: `K` becomes the newest entry. Otherwise it is a **miss**: `V` is stored under `K` as the newest entry; if the cache already holds `C` keys, the oldest entry is removed first | `hit R` on a hit, where `R` is the result stored for `K` (not the `V` just given); on a miss `miss`, or `miss evict X` if the oldest entry, key `X`, was removed |
| `order` | reads the entries from oldest to newest | the keys separated by single spaces, or `-` if the cache is empty |

The tests give `call` and `order` only after a `cache`.

## Example

Input:

```
cache 2
call 1 10
call 2 20
call 1 99
call 3 30
order
call 2 21
order
```

Output:

```
miss
miss
hit 10
miss evict 2
1 3
miss evict 1
3 2
```

Calls 1 and 2 are misses. The third call hits key 1 and returns the stored 10, not 99, and makes 1 the newest, so the oldest is now 2. Key 3 is a miss in a full cache and evicts 2. The cache is 1, 3. Key 2 is a miss again, and evicts the oldest, 1, leaving 3, 2.
