Loop with `cur = H` and `count = 0`:

1. `nxt = cur.next`
2. if `nxt == 0` or `nxt.prev != cur`: print `broken cur` and stop;
3. if `nxt == H`: print `ok count` and stop;
4. `count += 1`, `cur = nxt`.

**Why it stops.** Suppose all steps so far pass step 2 and the walk meets a node twice. The two visits to it come from nodes whose `next` is it, and it has one `prev`, so those two nodes are the same node, and so on back: the first repeated node is `H`, where step 3 stops. So the walk never visits any other node twice, and in a finite memory it must stop. No visited set and no second pointer is needed: the back-pointer plays that part. A chain without back-pointers needs the slow and fast pointers of the [Emacs Chapter](/chapters/two-pointers-emacs-cycles).

**Cost.** One visit per node: O(n) in the worst case, where n is the number of nodes reached before the walk stops, and O(1) extra space.
