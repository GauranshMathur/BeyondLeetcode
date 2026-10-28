# Match a pattern with alternatives

Python's regex engine matches `a(b|bc)d` by trying the alternatives of a group one after another, and going back when one leads nowhere. This Problem builds a matcher for a tiny pattern language that makes the same moves. The reading is [CPython's regex engine: try an alternative, undo it, try the next](/chapters/backtracking-sre). The pattern language and the output below are written for this Problem; the Chapter says how CPython differs.

The Build for this Topic is a set of search commands. You start from an empty file. Your program reads commands from standard input, one per line, until the input ends. Skip empty lines and lines that start with a word you do not know.

A **pattern** is made of lowercase letters and **groups**. A group is written `(x|yz|...)`: two or more **alternatives** separated by `|`, each one made of one or more letters. Groups do not nest, and `(`, `)` and `|` appear nowhere else. The **text** is one or more lowercase letters. A pattern has at most 60 characters and a text at most 40. Neither contains a space.

Add:

| Command | What it does | Prints |
|---|---|---|
| `match PATTERN TEXT` | Checks whether the pattern matches the **whole** text, from its first letter to its last. A letter matches itself, and a group matches any one of its alternatives. | `no`, or `yes` followed by the position of the alternative used in each group, counting from 0, left to right, each after a single space (just `yes` when the pattern has no group) |

Several ways to match can exist. Print the first one a search finds when it works left to right: at each group it takes the first alternative that fits the text at the current place and goes on, and if what follows fails, it goes back and takes the next alternative of the **most recent** group that has one left.

## Example

Input:

```
match a(b|bc)d abcd
match a(b|bc)d abd
match a(b|bc)d abx
```

Output:

```
yes 1
yes 0
no
```

For `abcd`, the group's first alternative `b` fits at position 1, but then `d` has to match `c`, so the search goes back and takes `bc`: the answer is alternative 1. For `abd`, the first alternative fits and `d` matches the end. For `abx` neither alternative leads to a match.
