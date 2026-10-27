Build the attacker's side, and then see what the table does when it is flooded.

`Aa` and `BB` have the same hash. So any string made of blocks, each `Aa` or `BB`, has the same hash as any other string with the same number of blocks. You will make a family of 1024 strings with one hash.

| Command | What it does | Prints |
|---|---|---|
| `collide I` | Builds the string number `I`, for `I` from 0 to 1023. | a string of 10 blocks, 20 characters |

Write `I` as a 10-bit binary number. The 10 blocks, from left to right, follow its bits from the highest to the lowest: a bit of 0 gives the block `Aa`, a bit of 1 gives `BB`. So `collide 0` is `AaAaAaAaAaAaAaAaAaAa`, `collide 1` is `AaAaAaAaAaAaAaAaAaBB`, and `collide 1023` is ten times `BB`.

Nothing else is new. The tests flood a Java-style table with these strings (copied into the test input as keys, with `put`) and with other keys, and ask about the table. One thing is: a resize may now happen to a table that has a tree bin. Treat a tree bin like a chain when you split it: the nodes whose spread hash has `spread & M == 0` go to bin `j`, the others to bin `j + M`. A half with **more than 6** nodes becomes a tree bin, and a half with 6 or fewer becomes a plain chain. The tests only resize tree bins whose keys all share one hash, so one half is always empty, and the order of nodes inside a tree bin still never matters.

## Example

Input:

```
hashcode AaAaAaAaAaAaAaAaAaAa
hashcode BBBBBBBBBBBBBBBBBBBB
collide 0
collide 1
collide 5
collide 1023
```

Output:

```
-1253014912
-1253014912
AaAaAaAaAaAaAaAaAaAa
AaAaAaAaAaAaAaAaAaBB
AaAaAaAaAaAaAaBBAaBB
BBBBBBBBBBBBBBBBBBBB
```

All the strings in the first test have the same hash, -1253014912, whether made of `Aa` blocks or `BB` blocks. `collide 5` is the 10-bit number `0000000101`: seven `Aa` blocks, `BB`, `Aa`, `BB`.

## Another example

Input:

```
impl java
put AaAaAaAaAaAaAaAaAaAa 0
put AaAaAaAaAaAaAaAaAaBB 1
put AaAaAaAaAaAaAaAaBBAa 2
put AaAaAaAaAaAaAaAaBBBB 3
put AaAaAaAaAaAaAaBBAaAa 4
put AaAaAaAaAaAaAaBBAaBB 5
put AaAaAaAaAaAaAaBBBBAa 6
put AaAaAaAaAaAaAaBBBBBB 7
put AaAaAaAaAaAaBBAaAaAa 8
cap
dump
trees
longest
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
16
32
16: AaAaAaAaAaAaAaAaAaAa AaAaAaAaAaAaAaAaAaBB AaAaAaAaAaAaAaAaBBAa AaAaAaAaAaAaAaAaBBBB AaAaAaAaAaAaAaBBAaAa AaAaAaAaAaAaAaBBAaBB AaAaAaAaAaAaAaBBBBAa AaAaAaAaAaAaAaBBBBBB AaAaAaAaAaAaBBAaAaAa
0
9
```

Nine strings with one hash all go to the same bin. The table starts with 16 bins. The ninth string makes a chain of 9, so the table doubles to 32 bins. Doubling does not help: the strings have one hash, so they all stay together in bin 16. `trees` is 0 and `longest` is 9. The tenth string doubles the table again, to 64 bins, and the eleventh turns the bin into a tree bin.
