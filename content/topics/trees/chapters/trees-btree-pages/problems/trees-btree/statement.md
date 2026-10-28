# A B-tree of at most three keys

Rust's `BTreeMap` and SQLite's file format both keep several keys in each node, so that a search reads few nodes. Build the smallest B-tree that shows how: a node holds at most 3 keys. The source for each claim is in [B-trees: fewer, fatter nodes](/chapters/trees-btree-pages).

The B-tree is a second structure in the Build, beside the binary tree. The commands for one do not touch the other, and `bt` has its own subcommands. It starts empty.

A **node** holds between 1 and 3 keys in increasing order. A node with no children is a **leaf**. Any other node with k keys has k + 1 children: the first child holds keys smaller than the first key, the second holds keys between the first and the second key, and so on up to the last child, which holds keys larger than the last key. Every leaf is at the same depth.

| Command | What it does | Prints |
|---|---|---|
| `bt add k1 k2 ...` | Adds each key in turn (rule below). A key that is already in the B-tree is ignored. | nothing |
| `bt show` | Shows the B-tree one level per line, from the root down. A node is its keys in square brackets, separated by single spaces, such as `[10 20]`. The nodes of a level are separated by single spaces, left to right. | one line per level; nothing if the B-tree is empty |
| `bt find k` | Searches for `k`, starting at the root. At each node it looks at the keys in order, and either finds `k` there or moves to the one child that can hold it. | `found N` or `missing N`, where `N` is the number of nodes the search read (`0` for an empty B-tree) |

**Adding a key.** Walk down from the root to the leaf where the key belongs and put the key there, in order. If a node now holds 4 keys, **split** it: the second key moves up into the parent, between the two nodes that the split makes; the first key stays in the node; the third and fourth keys, with their children if the node has any, go to a new node placed right after it. If the parent now holds 4 keys, it splits the same way. If the root splits, a new root is made with the one key that moved up and the two nodes as its children. An empty B-tree becomes a root with the one key.

## Example

Input:

```
bt add 10 20 30
bt show
bt add 40
bt show
```

Output:

```
[10 20 30]
[20]
[10] [30 40]
```

Three keys fit in one node. The fourth makes it hold `10 20 30 40`, so it splits: `20`, the second key, moves up and becomes a new root, `10` stays, and `30 40` go to a new node.

A longer one:

```
bt add 1 2 3 4 5 6 7 8 9 10
bt show
bt find 7
bt find 11
```

```
[4]
[2] [6 8]
[1] [3] [5] [7] [9 10]
found 3
missing 3
```

`bt find 7` reads the root `[4]`, then `[6 8]`, then the leaf `[7]`. `bt find 11` reads the root, then `[6 8]`, then `[9 10]`, and `11` is not there.
