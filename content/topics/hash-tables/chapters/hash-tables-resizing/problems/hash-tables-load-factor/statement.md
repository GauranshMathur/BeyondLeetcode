Add the rule that keeps chains short on average: resize when the table is too full.

| Command | What it does | Prints |
|---|---|---|
| `resize on` | Turns the load-factor rule on. | nothing |
| `resize off` | Turns it off. | nothing |
| `moved` | Reads the move counter. | the number of nodes moved by resizes since the last `table` or `impl` |

The rule starts off. It stays as set when `table` or `impl` is used. For now it applies to the Java-style table only.

With the rule on, after a `put` has added a **new** key (and after the 9-node rule from the last Problem has run) compare the number of keys with the **threshold**, which is `floor(N * 3 / 4)` for `N` bins. If the number of keys is greater than the threshold, resize the table, with the same resize as before. The 9-node rule and this one can both fire in one `put`: the second check uses the table the first one left.

The move counter: every resize, whatever caused it, adds the number of keys the table holds when it resizes. `table` and `impl` set the counter to 0.

The tests never resize a table that holds a tree bin, so you do not need to decide what a resize does to one yet.

## Example

Input:

```
impl java
resize on
table 4
put 1 1
put 5 2
put 9 3
dump
cap
moved
put 13 4
dump
cap
moved
put 17 5
dump
```

Output:

```
1
1
1
1: 1 5 9
4
0
5
1: 1 9
5: 5 13
8
4
1
1: 1 9 17
5: 5 13
```

With 4 bins the threshold is 3. Keys 1, 5 and 9 all go to bin 1, and nothing happens: three keys is not more than 3. The fourth key, 13, takes the count to 4, which is more than 3, so the table doubles to 8 bins and 4 nodes are moved. Keys 1 and 9 stay in bin 1 (bit 4 is clear), and 5 and 13 go to bin 5. `put 13` prints its final bin, 5. The next key, 17, joins bin 1 behind 1 and 9.

## Another example

Input:

```
impl java
resize on
table 2
put 1 1
put 2 2
put 3 3
put 4 4
put 5 5
put 6 6
put 7 7
put 8 8
put 9 9
put 10 10
put 11 11
put 12 12
put 13 13
put 14 14
put 15 15
put 16 16
put 17 17
put 18 18
put 19 19
put 20 20
put 21 21
put 22 22
put 23 23
put 24 24
len
cap
moved
```

Output:

```
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
24
32
26
```

Starting from 2 bins (threshold 1), 24 keys make the table grow 2, 4, 8, 16, 32. The resizes happen at the 2nd, 4th, 7th and 13th key and move 2 + 4 + 7 + 13 = 26 nodes. The 24th key is not more than the threshold of 24, so there is no fifth resize. The moves in total stay close to the 24 puts. That is the point of doubling.
