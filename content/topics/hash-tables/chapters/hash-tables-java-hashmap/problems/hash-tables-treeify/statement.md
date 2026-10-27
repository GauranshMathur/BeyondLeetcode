Add Java's rule for long chains.

When `put` appends a new key to a plain bin and the bin now holds **9 or more** nodes:

- If the table has fewer than 64 bins, **resize** it, as described below.
- Otherwise the bin becomes a **tree bin**.

A **resize** doubles the table. Let `M` be the number of bins before it. The new table has `2 * M` bins. Go through the old bins in order. Split each old bin `j` into two lists, keeping the order of its nodes: the nodes whose spread hash has `spread & M == 0` go to new bin `j`, the others go to new bin `j + M`. The spread hash of a key is the same as before. It does not change when the table grows; only the mask does.

A **tree bin** is a bin whose chain has turned into a tree. Later `put`s into it just add the key (or replace its value), with no check and no further change. The tests never need the order of nodes in a tree bin, and never call `probes` for a key in one.

| Command | What it does | Prints |
|---|---|---|
| `trees` | Counts the tree bins. | the number of tree bins |

Changes to the commands you have:

- `put` prints the bin the key is in when the command finishes, after any resize.
- `dump` prints a tree bin as the bin index, a colon and a space, then `tree` and the number of nodes: `0: tree 9`.
- `longest` counts the nodes of a tree bin too.

The rule is applied every time a new key is appended to a plain bin. After a resize, the bin may still hold 9 or more nodes (if the keys all differ only in higher bits); the next new key appended to it applies the rule again. A bin that is already a tree bin is never checked.

## Example

Input:

```
impl java
put 0 0
put 16 1
put 32 2
put 48 3
put 64 4
put 80 5
put 96 6
put 112 7
put 128 8
cap
dump
longest
trees
```

Output:

```
0
0
0
0
0
0
0
0
0
32
0: 0 32 64 96 128
16: 16 48 80 112
5
0
```

The first eight multiples of 16 all land in bin 0 of 16, and no rule fires. The ninth, 128, makes a chain of 9 in a table of 16 bins. The table doubles. With `M = 16`, the nodes whose spread hash has bit 16 clear (0, 32, 64, 96, 128) stay in bin 0, and the others (16, 48, 80, 112) go to bin 16. `put 128` prints 0, `cap` prints 32 and `longest` prints 5.

## Another example

Input:

```
impl java
table 64
put 0 0
put 64 1
put 128 2
put 192 3
put 256 4
put 320 5
put 384 6
put 448 7
put 512 8
cap
dump
trees
get 512
get 576
put 256 77
get 256
len
```

Output:

```
0
0
0
0
0
0
0
0
0
64
0: tree 9
1
8
error
0
77
9
```

A table of 64 bins is big enough to treeify. The ninth multiple of 64 makes bin 0 a tree bin of 9 nodes, the table stays at 64 bins, and `dump` prints `0: tree 9`. `get 512` still finds a key by comparing keys, and `put 256 77` replaces a value in the tree bin without adding a node.
