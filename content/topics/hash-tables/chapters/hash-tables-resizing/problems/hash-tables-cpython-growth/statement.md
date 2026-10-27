Give the CPython-style table a way to grow. `resize on` now applies to it as well as to the Java-style table. Off is still the start.

With `resize on`, before `put` stores a **new** key in a CPython-style table, check the rows. If the number of rows (`nentries`, deleted rows included) is at least `floor(N * 2 / 3)`, where `N` is the number of slots, **rebuild** the table first. Then store the key as usual. `put` prints its final slot, after the rebuild. Replacing the value of a key that is there never rebuilds.

To rebuild, let `used` be the number of keys, not counting deleted rows.

1. The new number of slots depends on `used`: 8 if `used` is 0; **16 if `used` is 1 or 2**; otherwise the smallest power of two that is at least `3 * used`.
2. The new table has all slots Unused. The rows that are not empty are copied, in order, to rows 0, 1, 2 and so on. Empty rows are gone.
3. For each copied row in order, put its row number into the new slots: start at slot `key & mask` and move on with the search rule while the slot is taken. There are no Dummy slots in the new table.
4. `moved` goes up by `used`.

`moved` and `table` work as in the last Problem. `cap` prints the number of slots.

The tests never put more keys than the table can hold when `resize` is off. They only use keys between 0 and 2,147,483,647.

## Example

Input:

```
resize on
table 8
put 1 1
put 2 2
put 3 3
put 4 4
put 5 5
cap
nentries
put 6 6
cap
nentries
dump
moved
```

Output:

```
1
2
3
4
5
8
5
6
16
6
. 1 2 3 4 5 6 . . . . . . . . .
5
```

A table of 8 slots has room for `floor(8 * 2 / 3) = 5` rows. Five keys fill them. The sixth key finds 5 rows, so the table is rebuilt first: `used = 5`, and the smallest power of two at least 15 is 16. The five keys are placed again in a table of 16, then key 6 is stored. `put 6` prints slot 6. `moved` is 5.

## Another example

Input:

```
resize on
table 8
put 0 1
put 1 1
put 2 1
put 3 1
put 4 1
del 0
del 1
del 2
del 3
cap
nentries
len
put 9 1
cap
nentries
keys
moved
dump
```

Output:

```
0
1
2
3
4
ok
ok
ok
ok
8
5
1
9
16
2
4 9
1
. . . . 4 . . . . 9 . . . . . .
```

Five keys are put, then four are deleted, leaving key 4. The five rows are still there, so `nentries` stays 5. The next new key, 9, finds the rows full and triggers a rebuild with `used = 1`. The table does not shrink to 8: the rule gives 16 for one or two keys. That is how CPython 3.13.0 rounds, and the Chapter shows the line. The rebuild keeps one key and drops the four empty rows, so `nentries` is 2 afterwards and `moved` is 1.
