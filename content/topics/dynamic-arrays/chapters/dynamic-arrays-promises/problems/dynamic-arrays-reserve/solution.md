Both commands are a guard and a call to the function that replaces the block. `reserve N` moves only when `N` is larger than the capacity; `shrink` moves only when the capacity is larger than the length.

`reserve` before a known number of appends removes every copy: the block is never full until the last append has been done. That is the reason `Vec::with_capacity` and `ensureCapacity` exist.

`shrink` costs one full copy, O(n) in the worst case, and it leaves the block exactly full, so the next `append` has to grow at once. Under `double`, `fill 5 1` then `shrink` then `append 1` ends with capacity 10 and has copied 17 items; without the `shrink` it would have copied 7. Shrink a list when it has stopped growing, not in the middle of filling it.

Your `reserve` and `shrink` are exact, which keeps the Tests simple. As the Chapter quotes, Rust does not promise that `shrink_to_fit` leaves no spare room at all.
