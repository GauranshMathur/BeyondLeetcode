# The cheapest edit between two words

PostgreSQL's `levenshtein` charges separate costs for inserting, deleting and substituting a letter, and keeps two rows of its table ([the Chapter](/chapters/dp-2d-postgres) reads how). The Build already holds the two words, and you add the edit cost between them.

| Command | What it does | Prints |
|---|---|---|
| `edit INS DEL SUB` | Finds the least total cost of turning the first word into the second, with `INS` for inserting a letter, `DEL` for deleting one and `SUB` for replacing one letter by a different letter. | that cost |

`INS`, `DEL` and `SUB` are whole numbers between 1 and 100. A move inserts a letter anywhere, deletes any letter, or replaces any letter by a different one. Replacing a letter by itself is not a move and costs nothing, so identical words cost 0. An empty word is written `-`. The cheapest way to turn the first word into the second need not be the cheapest way to turn the second into the first: inserting makes the second word longer, and deleting makes it shorter. The words do not change. The earlier commands still have to work.

The Tests cannot see how much memory your program keeps, but the Solution keeps two rows of the table, and it is worth doing the same: the words are up to 1000 letters.

## Example

Input:

```
words marble ramble
edit 1 1 1
edit 3 1 1
words - ramble
edit 2 5 7
```

Output:

```
2
2
12
```

`marble` becomes `ramble` by replacing `m` with `r` and `r` with `m`, two moves of cost 1 each. With insertion costing 3, two replacements at 1 each are still the cheapest, 2. From the empty word to `ramble` there are six letters to insert, at 2 each: 12.
