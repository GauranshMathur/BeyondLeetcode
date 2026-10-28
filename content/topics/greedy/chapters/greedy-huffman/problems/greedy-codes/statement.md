# The fewest bits for a text

DEFLATE, specified in RFC 1951, uses Huffman codes, which are prefix codes built from how often each symbol occurs ([RFC 1951, section 3.2.1](https://www.rfc-editor.org/rfc/rfc1951.html#section-3)). This Problem asks for the cost of the best prefix code for a text. The Build gets its first sequence of integers, and the same sequence is used by later Problems.

Add:

| Command | What it does | Prints |
|---|---|---|
| `load f1 f2 ...` | Replaces the sequence with the given integers. With no integers, the sequence is empty. | nothing |
| `show` | Writes the sequence out. | the items, separated by single spaces; an empty line if the sequence is empty |
| `huffman` | Treats item `i` as the number of times symbol `i` occurs in a text. A **prefix code** gives every symbol that occurs a string of bits, so that no string is the start of another. The cost of a prefix code is the sum, over the symbols, of occurrences times the length of the symbol's string. | the lowest cost any prefix code has |

Items are integers from 0 to 1000000, and the sequence has at most 10000 of them. A symbol with 0 occurrences does not occur: it gets no string and adds nothing to the cost. A symbol that occurs always gets a string of at least one bit. If no symbol occurs, the cost is `0`.

## Example

Input:

```
load 6 1 3 0 2 8
show
huffman
```

Output:

```
6 1 3 0 2 8
41
```

Symbol 3 does not occur. The other five have 6, 1, 3, 2 and 8 occurrences. One prefix code gives the symbol with 8 occurrences one bit, the one with 6 occurrences two bits, the one with 3 three bits, and the two rarest, with 1 and 2, four bits each: 8 + 12 + 9 + 4 + 8 = 41. No prefix code costs less.
