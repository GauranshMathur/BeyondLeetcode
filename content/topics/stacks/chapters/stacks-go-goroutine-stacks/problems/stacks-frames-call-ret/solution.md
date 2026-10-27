Keep the frame sizes in a list and push and pop at its end. Keep `used` as a running total: add `N` on `call`, subtract the popped size on `ret`. Do not add the frames up on every `used`, which would cost O(depth) each time.

`ret`, `depth` and `used` are O(1) in the **worst case**. `call` adds to the end of a list that grows by doubling, as in the Dynamic arrays Topic, so it is O(1) **amortised** and O(depth) in the **worst case**, for the call that makes the list grow. The next Problems give the stack a size, and then `call` and `ret` will matter more.
