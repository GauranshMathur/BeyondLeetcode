# Cut a word into palindromes

A cut is a choice, as taking an alternative is. Here a word is cut from the left into pieces, each of which reads the same backwards and forwards, and every way of doing so is listed. The loop of choose, explore and undo is the one in [CPython's regex engine: try an alternative, undo it, try the next](/chapters/backtracking-sre). This Problem is an Extra: it adds to the Build as it stands after `match`, and nothing it adds is in the later Problems.

Add:

| Command | What it does | Prints |
|---|---|---|
| `cuts WORD` | Lists every way to cut `WORD` into pieces that are each a palindrome. | one line per way: the pieces in order, with a vertical bar between neighbours and no spaces, such as `aa\|b` |

The word has 1 to 14 lowercase letters. A **palindrome** reads the same from either end, and a single letter is one. A way cuts the word into one or more pieces that, written one after another, give the word back. The ways are listed in this order: a way whose first piece is shorter comes first, and for equal first pieces the same rule is applied to the rest. That is the order a search meets them if, at each place, it tries the shortest piece first.

## Example

Input:

```
cuts aab
```

Output:

```
a|a|b
aa|b
```

`aab` can be cut into `a`, `a`, `b`, or into `aa` and `b`. The cut `a` and `ab` is not allowed because `ab` is not a palindrome. The whole word is not one either.
