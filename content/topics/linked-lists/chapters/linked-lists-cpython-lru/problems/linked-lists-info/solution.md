Add `hits` and `misses` to the cache state. `call` adds 1 to `hits` on a hit and to `misses` on a miss. `info` prints them with the capacity given to `cache` and the number of keys in the map. `clear` does what `cache C` does for the current `C`, which resets the map, the ring and both counts.

**Size 0.** On a miss, count it. If the capacity is 0, print `miss` and stop before storing. A capacity of 0 can never hold a key, so a cache that reached the "full" branch would have an empty ring to take the oldest from. This is the case CPython handles by choosing a different wrapper, `uncached_lru_cache_wrapper`, which only counts the miss and calls the function.

**Cost.** The counters add O(1) to a call. `clear` is O(1) if the ring is re-initialised and the map is replaced, and O(n) if the nodes are released one by one.
