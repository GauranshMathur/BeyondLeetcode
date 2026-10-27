Keep `write = 1` (the first item stays) and loop `read` from 1 to n - 1. If `values[read] != values[read - 1]`, a new run has started: copy it to `values[write]` and move `write` on. At the end, cut the sequence to `write` items and print `write`. An empty sequence prints 0.

`write` is never ahead of `read`, so a copy never overwrites an item that has not been read. The comparison with `values[read - 1]` is safe because slot `read - 1` is never written before `read` examines it (`write <= read - 1` whenever a write happens at a position below `read`; a write at `write == read` copies an item onto itself and can be skipped, as Go does).

Cost: one pass, O(n) time in the worst case, O(1) extra space.
