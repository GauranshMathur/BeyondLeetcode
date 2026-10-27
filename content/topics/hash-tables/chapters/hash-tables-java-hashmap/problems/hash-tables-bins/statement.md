Add a second kind of table, the chained one from Java's `HashMap`.

| Command | What it does | Prints |
|---|---|---|
| `impl java` | Switches to the Java-style table and makes it empty, with 16 bins. | nothing |
| `impl cpython` | Switches back to the CPython-style table and makes it empty, with 8 slots. | nothing |
| `bin K` | Reads which bin `K` belongs to. Changes nothing. | the bin index |
| `longest` | Reads the longest chain. | the number of nodes in the longest chain, 0 if the table is empty |

Until the first `impl`, the table is the CPython-style one from before. `table N` makes an empty table of the current kind: for a Java-style table `N` is the number of bins, a power of two from 2 to 1024. The commands `put`, `get`, `probes`, `len`, `cap` and `dump` work on the current table. The rules below are for the Java-style one; the CPython-style rules are unchanged. `del`, `indices`, `keys` and `nentries` are never used with a Java-style table.

## The Java-style table

- A table of `N` bins has `N` chains, each a list of nodes with a key and a value, starting empty.
- The **hash** of a key `K` is `K`. The **spread** hash is `h ^ (h >> 16)`, where `h` is the hash and `>>` shifts right. The **bin** of `K` is `spread & (N - 1)`.
- `put K V`: if the chain of `K`'s bin holds `K`, replace its value. Otherwise add a node at the **end** of the chain. Prints the bin index.
- `get K` prints the value, or `error`.
- `probes K` prints how many nodes the lookup visited: it walks the chain from the head until it reaches `K`, counting that node. If `K` is not there, it is the number of nodes in the chain, which is 0 for an empty bin.
- `len` prints the number of keys. `cap` prints `N`.
- `dump` prints one line for each bin that is not empty, in increasing bin order: the bin index, a colon and a space, then the keys of the chain from head to tail, separated by single spaces. An empty table prints nothing.

The tests never put a ninth key into one bin.

## Example

Input:

```
impl java
put 1 10
put 17 20
put 33 30
put 2 40
dump
probes 33
get 17
get 3
probes 3
bin 65536
bin 65537
cap
```

Output:

```
1
1
1
2
1: 1 17 33
2: 2
3
20
error
0
1
0
16
```

With 16 bins, keys 1, 17 and 33 all have bin `1`, so they form the chain `1 17 33` in the order they were put. `probes 33` walks all three nodes. Key 3 would go to the empty bin 3: `get 3` prints `error` and `probes 3` prints 0. The spread is what makes `bin 65536` print 1: `65536 >> 16 = 1`, so the spread hash is `65536 ^ 1 = 65537`, and `65537 & 15 = 1`. And `bin 65537` is `65537 ^ 1 = 65536`, bin 0.

## Another example

Input:

```
impl java
table 4
put 1 1
put 5 2
put 9 3
put 4 4
put 5 9
dump
len
longest
get 5
probes 9
```

Output:

```
1
1
1
0
1
0: 4
1: 1 5 9
4
3
9
3
```

With 4 bins, keys 1, 5 and 9 all go to bin 1. Key 4 goes to bin 0. `put 5 9` finds key 5 already in the chain and only replaces its value: the chain stays `1 5 9`, `len` stays 4 and `get 5` prints 9.
