Keep `pieces`, the pieces chosen so far. A function `go(start)`:

1. if `start` is the end of the word, print `pieces` joined by `|`, and stop;
2. for each `end` from `start + 1` to the length of the word: let `piece` be the word from `start` to `end`; if it reads the same reversed: add it to `pieces` (**choose**), call `go(end)` (**explore**), remove it (**undo**).

Call `go(0)`.

**Why it is right.** Every way is a list of lengths that sum to the word's length, and the calls follow exactly those lists whose pieces are palindromes. Trying `end` from the smallest makes a way with a shorter first piece come first, and the same holds for the rest, which is the order required. A word always has at least one way, all single letters, so something is always printed.

**Cost.** A word of n letters has 2^(n - 1) ways to cut it, so the search visits up to that many paths in the **worst case**, which happens for a word of one repeated letter, where every cut is allowed. Each piece check is O(n), and printing a way is O(n). Space is O(n) for the pieces and the recursion.
