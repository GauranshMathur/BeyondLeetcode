**Detect.** Set `slow = fast = S`. Repeat: if `fast` is `-1` or its link is `-1`, print `none`. Otherwise move `slow` one link and `fast` two, and stop when they are the same node.

**Find `m`.** Let `m` be the nodes before the loop, `n` the loop length, and suppose they meet after `t` rounds. The fast pointer has moved twice as far, so it has gone `t` further than the slow one, and that distance is a multiple of `n`. Hence `t` is a multiple of `n`, and the slow pointer, which has made `t` moves, stands `t` nodes past the start, at an offset of `t - m` into the loop. Moving a pointer from there another `m` nodes brings it to offset `t`, which is a multiple of `n`, that is, the loop's first node. A second pointer that starts at `S` reaches that same node after `m` moves. So move both one link at a time until they are equal and count the moves: that count is `m`.

**Find `n`.** From the loop's first node, follow links until you come back to it, counting.

Cost: the detection takes at most about m + n rounds; the other two phases take m and n steps. Overall O(m + n) in the worst case, and O(1) extra space. Remembering every visited node needs O(m + n) extra space.
