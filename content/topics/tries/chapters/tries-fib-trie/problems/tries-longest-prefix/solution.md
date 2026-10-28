Read each address as a 32-bit number. A prefix `a.b.c.d/n` is valid when the last `32 - n` bits of its number are 0. When `n` is 32 nothing remains to check, and when `n` is 0 the whole address must be 0.

The table is a binary trie: a node has a child for a 0 bit and one for a 1 bit. `route` walks `n` bits of the prefix from the top bit down, creating nodes as needed, and stores the prefix and name at the node it reaches. `match` walks the 32 bits of the address from the top, and every time the node it steps to holds a route, it remembers that route. It stops at the first missing child or after 32 bits, and prints the last route it remembered, or `none`.

The remembered route is the longest because a route at depth `n` is only reachable through the first `n` bits of the address, and the walk visits depths in increasing order: a later route is always longer than an earlier one. The Linux kernel's search is different (it skips bits, so it checks the key in the leaf and climbs back up; see the Chapter), but it answers the same question.

Cost: `route` and `match` each take at most 32 steps, which is O(1) in the **worst case** however many routes are stored, since a step follows a bit of the address, not a route. Memory is at most 32 nodes per stored route, in the worst case when the routes share no bits.
