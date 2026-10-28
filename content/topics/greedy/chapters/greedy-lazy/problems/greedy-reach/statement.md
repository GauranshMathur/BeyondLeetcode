# The fewest tokens when a match may be cut short

`greedy` and `lazy` are rules that look at one position at a time. This Extra Problem asks what the fewest tokens could be, and the answer needs a different greedy choice. It uses a rule written for this Problem, and not DEFLATE's: a match may be cut to **any** length from 1 up to its item (DEFLATE's shortest match is 3 ([RFC 1951, section 3.2.5](https://www.rfc-editor.org/rfc/rfc1951.html#section-3)), so a real compressor has less freedom than this). A cut match of length 1 is a literal. A position with item `0` can only be a literal.

It works on the loaded table, as `greedy` and `lazy` do.

Add:

| Command | What it does | Prints |
|---|---|---|
| `reach` | Writes tokens from position 0 to the end, where a token written at position `i` moves to `i + s` for any whole `s` from 1 to `max(1, item)`. | the fewest tokens that get to the end; `0` for an empty table |

The table obeys the rules of `greedy` (item 0, or 3 to 258 with `i + item <= n`, at most 3000 items). A token can never move past the end.

## Example

Input:

```
load 3 0 7 0 0 0 0 0 0
reach
```

Output:

```
2
```

Two tokens. At position 0 write the match of 3 cut down to length 2, which moves to position 2. At position 2 write the match of 7, which moves to position 9, the end of the table. Taking the 3 whole would land on position 3, where no match starts, and the six positions left would be literals: `greedy` and `lazy` both print 7 for this table.
