Let `lead` start at the head and move `K` nodes along (read the cell, step to that node). If it reaches 0 before `K` moves, the list is too short: print `none`.

Now `lead` is `K` nodes ahead of a `follower` that starts at the head. Move both one node along until `lead`'s cell is 0, that is, until `lead` is the last node. Then there are `K - 1` nodes between the follower and the end, so the node the follower's cell points at is the `K`-th from the end. Print it, and write its next address into the follower's cell. Because the follower is a cell that points at the target, removing the first node needs no special case.

**Cost.** One walk from the front: O(n) in the worst case, with O(1) extra space. The two cursors stay `K` apart, the idea of the two-pointer Topic's [cycle Chapter](/chapters/two-pointers-emacs-cycles) with a gap instead of a speed difference.
