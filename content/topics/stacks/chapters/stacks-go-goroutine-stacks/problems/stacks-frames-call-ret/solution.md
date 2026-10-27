Keep the frame sizes in a list and push and pop at its end. Keep `used` as a running total: add `N` on `call`, subtract the popped size on `ret`. Do not add the frames up on every `used`, which would cost O(depth) each time.

Every command is O(1) in the **worst case** here: `call` and `ret` touch one end of the list, and `depth` and `used` read a number. (A list or slice that grows by doubling makes `call` O(1) **amortised**, as in the Dynamic arrays Topic.) The next Problems give the stack a size, and then `call` and `ret` will matter more.
