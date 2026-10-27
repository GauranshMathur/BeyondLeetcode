The Build for this Topic is a hash table of integers, modelled on the table inside CPython's `dict`. You start from an empty file.

Keep the table as a fixed run of **slots**: a list or array whose size you choose when the table is made and never change afterwards. A slot is either **Unused** or holds one key and its value. Do not use your language's dictionary, map or set: where each key goes is the thing you are building.

Your program reads commands from standard input, one per line, until the input ends. Skip empty lines.

| Command | What it does | Prints |
|---|---|---|
| `table N` | Makes an empty table of `N` slots, all Unused. `N` is a power of two from 2 to 1024. Every test starts with it. | nothing |
| `put K V` | Stores the value `V` under the key `K`. If `K` is already in the table, replaces its value. | the index of the slot that holds `K` |
| `get K` | Looks `K` up. | its value, or `error` if `K` is not in the table |
| `probes K` | Looks `K` up the same way `get` does. | how many slots the search examined, counting the one where it stopped |
| `len` | Counts the keys. | the number of keys |
| `cap` | Reads the size of the table. | `N` |
| `dump` | Reads every slot. | the slots from index 0 up, separated by single spaces: `.` for an Unused slot, otherwise the key in it |

Every key is between 0 and 2,147,483,647. Every value fits between -1,000,000,000 and 1,000,000,000.

## Where a key goes

The search for a key `K` in a table of `N` slots visits slots in this order. Let `mask = N - 1`. It starts at slot `K & mask` with `perturb = K`. To move on, it first does `perturb = perturb >> 5`, then goes to slot `(slot * 5 + perturb + 1) & mask`. This is the rule from the Chapter.

- The search stops at the first slot that holds `K`, which is a hit, or at the first Unused slot, which means `K` is not in the table.
- `put` for a key that is already in the table replaces its value and prints its slot. A new key is stored in the Unused slot where its search stopped.

The tests always leave at least one slot Unused.

## Example

Input:

```
table 8
put 3 10
put 11 20
put 19 30
dump
probes 3
probes 11
probes 19
get 11
get 4
probes 4
```

Output:

```
3
0
1
11 19 . 3 . . . .
1
2
3
20
error
1
```

Key 3 lands in slot 3. Keys 11 and 19 also start at slot 3 (`11 & 7 = 3` and `19 & 7 = 3`). For 11, `perturb` becomes `11 >> 5 = 0`, so its next slot is `(3 * 5 + 0 + 1) & 7 = 0`. For 19 the search goes 3, then 0, then `(0 * 5 + 0 + 1) & 7 = 1`: three slots, so `probes 19` prints 3. Key 4 would start at slot 4, which is Unused: one slot examined, and `get 4` prints `error`.

## Another example

Input:

```
table 8
put 0 1
put 65536 2
put 131072 3
dump
probes 131072
```

Output:

```
0
1
6
0 65536 . . . . 131072 .
3
```

Keys 0, 65536 and 131072 all start at slot 0. For 65536, `perturb = 65536 >> 5 = 2048`, so the next slot is `(0 * 5 + 2048 + 1) & 7 = 1`. For 131072, slot 0 is taken and `perturb = 4096`, so the next slot is `(0 + 4096 + 1) & 7 = 1`, also taken. Then `perturb = 4096 >> 5 = 128` and the next slot is `(1 * 5 + 128 + 1) & 7 = 6`. Three slots, as `probes 131072` says. The high bits of the key moved it away from the path its neighbours take.
