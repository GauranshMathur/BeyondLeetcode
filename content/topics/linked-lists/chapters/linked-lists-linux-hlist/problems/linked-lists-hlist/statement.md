# A head with one pointer, a node with two

Now Linux's `hlist`. The head is one cell, `first`. A node is two cells: `next` at its address, and `pprev` at its address plus one. `pprev` is not the previous node. It is the **address of the cell that points at this node**: the head's cell if the node is first, otherwise the first cell of the node before it, which is that node's address. A node that is not on a list is not read.

Add:

| Command | What it does | Prints |
|---|---|---|
| `hadd N H` | `hlist_add_head`: links `N` in as the first node of the list whose head cell is `H` | nothing |
| `hadd_before N X` | `hlist_add_before`: links `N` right before the node `X`, which is on a list. It is not given the head | nothing |
| `hadd_behind N X` | `hlist_add_behind`: links `N` right after the node `X` | nothing |
| `hdel N` | `hlist_del`: makes the cell that `N`'s `pprev` names hold `N`'s `next`; if `N`'s `next` is not 0, sets that node's `pprev` to `N`'s `pprev`. Then writes 256 into `N`'s `next` cell and 290 into its `pprev` cell. It is not given the head | nothing |
| `hshow H` | like `sshow`: the nodes from the head, in order | the addresses, or `-` if there are none |

`get A` from before still reads a cell. The tests only use these commands on nodes that are on a list, or, for the `hadd` ones, not on any.

## Example

Input:

```
hadd 20 10
hadd 30 10
hadd_behind 40 30
hadd_before 50 20
hshow 10
get 51
hdel 40
hshow 10
get 51
get 40
get 41
```

Output:

```
30 40 50 20
40
30 50 20
30
256
290
```

The list grows 20; then 30, 20; then 30, 40, 20; then 30, 40, 50, 20. Node 50 follows node 40, so its `pprev` (cell 51) holds 40, the address of the cell that points at it. After `hdel 40` the list is 30, 50, 20, and node 50 is now pointed at by node 30's cell, so cell 51 holds 30. The deleted node's two cells hold the poison numbers.
