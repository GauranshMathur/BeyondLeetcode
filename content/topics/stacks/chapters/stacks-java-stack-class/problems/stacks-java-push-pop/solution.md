Keep the items in the block and the count beside it. The top is `block[count - 1]`; `push` writes at `block[count]`, so pushing and popping touch the end only.

When `push` finds the block full (`count == capacity`), make a block of twice the capacity, copy the `count` items across, add `count` to `copies` and swap the block in. Capacity starts at 10, never 0, so doubling always makes it bigger. Eleven pushes cost 10 copies; 21 pushes cost 10 + 20 = 30.

`pop` lowers the count and prints the item that was on top. `capacity` does not change, as in Java: Vector's `removeElementAt` never shrinks the array. You can zero the freed slot, as Java sets it to `null`; nothing reads it, because every read checks the count.

`search` walks from the top down and counts the distance: for the slot at index `i`, the distance is `count - i`. It stops at the first match, which is the one nearest the top.

Complexity. `push` is O(n) in the **worst case** (the push that grows the block) and O(1) **amortised**: the copies over n pushes are at most 2n. `pop`, `peek`, `empty`, `size` and the readers are O(1) in the **worst case**. `search` is O(n) in the **worst case**.
