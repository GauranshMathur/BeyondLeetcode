Add deletion, the way CPython does it.

A slot now has a third state besides Unused and holding a key. A **Dummy** slot held a key that was deleted. The Chapter explains why it cannot go back to Unused: a key further along some search path would no longer be found.

| Command | What it does | Prints |
|---|---|---|
| `del K` | Removes `K` and turns its slot into a Dummy slot. | `ok`, or `error` if `K` is not in the table |

The other commands keep their meaning, with these rules:

- A search for a key walks past Dummy slots as if they were taken. It stops only at a slot holding the key or at an Unused slot. A Dummy slot counts as one slot examined.
- `put` first searches for the key. If it is there, the value is replaced, as before. If it is not, the new key goes into the first slot on its path that is **Unused or Dummy**, and `put` prints that slot.
- `dump` prints `x` for a Dummy slot.
- `len` counts keys only.

The tests always leave at least one slot Unused. A Dummy slot is not Unused.

This is the rule of the default build of CPython 3.13.0. A free-threaded build does not reuse Dummy slots, as the Chapter notes.

## Example

Input:

```
table 8
put 3 10
put 11 20
put 19 30
del 11
dump
probes 19
get 19
get 11
put 27 40
dump
```

Output:

```
3
0
1
ok
x 19 . 3 . . . .
3
30
error
0
27 19 . 3 . . . .
```

Deleting 11 turns slot 0 into a Dummy. Key 19 still sits in slot 1 and is still found: the search goes 3, 0, 1, so `probes 19` stays 3. `get 11` prints `error`. For `put 27`, the path is slot 3 (taken) then slot 0 (Dummy), so the new key goes into slot 0.

## Another example

Input:

```
table 8
put 1 1
del 2
del 1
del 1
dump
probes 1
put 1 5
dump
```

Output:

```
1
error
ok
error
. x . . . . . .
2
1
. 1 . . . . . .
```

`del 2` fails because 2 is not there. The first `del 1` works and the second fails. Slot 1 is now a Dummy, so `probes 1` examines slot 1 and then slot `(1 * 5 + 0 + 1) & 7 = 6`, which is Unused: 2 slots. Putting key 1 again finds no key, and its path starts at slot 1, a Dummy, so it goes there.
