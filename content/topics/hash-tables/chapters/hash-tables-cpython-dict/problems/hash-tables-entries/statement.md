Change how the table stores its keys, the way CPython does. All the commands so far print the same as before. Three new commands show the new layout.

The table now has two parts:

- the **slots**, as before, except that a slot no longer holds a key and a value. A slot that is in use holds an **entry number**;
- the **entries**: a list of rows, each with a key and a value. Rows are only ever added at the end. Their numbers are 0, 1, 2 and so on.

How the rules change:

- A new key is added as a new row, at the end. Its entry number is the number of rows there are, deleted rows included. The slot found for the key holds that number.
- Replacing the value of a key changes its row. It does not add a row or move the key.
- `del K` turns the slot into a Dummy slot and empties the row. The row still counts: other rows keep their numbers.

| Command | What it does | Prints |
|---|---|---|
| `indices` | Reads the slots. | the slots from index 0 up, separated by single spaces: `.` for Unused, `x` for Dummy, otherwise the entry number in the slot |
| `keys` | Reads the rows in order. | the keys of the rows that are not empty, in row order, separated by single spaces |
| `nentries` | Counts the rows. | the number of rows, empty ones included |

`dump` still prints keys, not entry numbers. The tests never ask for `keys` on a table with no keys.

## Example

Input:

```
table 8
put 3 10
put 11 20
put 19 30
indices
keys
nentries
del 11
indices
keys
nentries
put 11 21
indices
keys
nentries
```

Output:

```
3
0
1
1 2 . 0 . . . .
3 11 19
3
ok
x 2 . 0 . . . .
3 19
3
0
3 2 . 0 . . . .
3 19 11
4
```

Keys 3, 11 and 19 get rows 0, 1, 2, and they sit in slots 3, 0, 1, so `indices` starts `1 2 . 0`. After `del 11` slot 0 is `x`, row 1 is empty and `keys` skips it, but `nentries` is still 3. Putting 11 again goes to the first free slot on its path (slot 0 again) and gets a new row, number 3. In `keys` it comes last.

## Another example

Input:

```
table 8
put 5 1
put 2 2
put 5 3
keys
get 5
nentries
dump
indices
```

Output:

```
5
2
5
5 2
3
2
. . 2 . . 5 . .
. . 1 . . 0 . .
```

Key 5 is put twice: the second `put` replaces the value (`get 5` prints 3) and adds no row, so `keys` is `5 2`, in the order the keys first arrived, and `nentries` is 2.
