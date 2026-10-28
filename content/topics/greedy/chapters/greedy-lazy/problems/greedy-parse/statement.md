# Take the longest match, or wait one position

A DEFLATE compressor writes a text as a series of **tokens**. A token is either a literal byte or a match, a pair of a length and a distance back to an earlier copy of the text, with the length drawn from 3 to 258 ([RFC 1951, section 3.2.5](https://www.rfc-editor.org/rfc/rfc1951.html#section-3)). zlib's `deflate_fast` takes the longest match it finds and does not evaluate matches lazily ([zlib 1.3.1, deflate.c](https://github.com/madler/zlib/blob/51b7f2abdade71cd9bb0e7a373ef2610ec6f9daf/deflate.c#L1805-L1809)), and `deflate_slow` waits one position before it commits to one ([deflate.c](https://github.com/madler/zlib/blob/51b7f2abdade71cd9bb0e7a373ef2610ec6f9daf/deflate.c#L1904-L1908)). This Problem counts tokens under the two rules. Both are written out here, simplified; they are the Problem's rules, not zlib's whole code, which also has limits and tuning parameters.

A **table** is a sequence that says, for each position of a text, how long the longest match is that starts there. The Problem works on the table, not on a text. Item `i` is `0` if no match starts at position `i`, and otherwise a length from 3 to 258 with `i + item <= n`, where `n` is the number of items: a match does not run past the end. A table is loaded with `load`, as before.

A **parse** goes through the positions from 0 and writes tokens until it has passed the last one. Add:

| Command | What it does | Prints |
|---|---|---|
| `greedy` | At position `i`: if the item is at least 3, write a match of that length and move to `i + item`; otherwise write a literal and move to `i + 1`. | the number of tokens |
| `lazy` | At position `i` with an item `L` of at least 3: while there is a next position and its item is **greater** than `L`, write a literal for `i`, move to `i + 1` and let `L` be that position's item. Then write a match of length `L` and move on by `L`. A position with an item below 3 is a literal, as in `greedy`. | the number of tokens |

The table has at most 3000 items. An empty table has no tokens. An item that equals the next one does not make `lazy` wait: only a strictly longer match does.

## Example

Input:

```
load 3 8 0 0 0 0 0 0 0
greedy
lazy
```

Output:

```
7
2
```

`greedy` takes the 3 at position 0 and then has six positions with no match: a match and six literals, 7 tokens. `lazy` sees that position 1 has a match of 8, longer than 3, so position 0 becomes a literal and the match of 8 covers the rest: 2 tokens. Waiting paid here. The next table, in the Chapter, is one where it does not.
