**Pushing and showing.** `spush H N` writes the head's value into `N`'s cell and then `N` into the head. `sshow H` follows cells from the head until it reads 0.

**Removing.** Let `cur` be the address of a cell that holds a pointer, starting with the head, and let `hops` be 0. Read the cell at `cur`:

- if it is 0, `N` is not in the list: print `absent`;
- if it is `N`, write `N`'s own cell into the cell at `cur` and print `hops`;
- otherwise set `cur` to that node, add 1 to `hops`, and repeat.

If `N` is the k-th node, the loop steps over k - 1 nodes, so `hops` is k - 1. Using the head's cell and a node's first cell in the same way is what removes the special case for the first node.

**Cost.** Removing the k-th node reads k cells: O(n) in the worst case, and O(1) when the node is first. `absent` always costs the whole list. Compare Problem 2, where `del` needed no walk because each node held its previous node.
