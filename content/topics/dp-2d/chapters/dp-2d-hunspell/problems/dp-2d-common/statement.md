# Letters two words share

Hunspell uses the length of the longest common subsequence of the typed word and a guess when it scores the guess ([the Chapter](/chapters/dp-2d-hunspell) reads how). You start the Build that holds the programs of this Topic, and the first one finds that length with a table.

The Build reads commands from standard input, one per line, and works on two **words**, the **first** and the **second**. Blank lines are ignored. Both start empty. A word is 0 to 1000 lowercase letters (`a` to `z`), and an **empty word** is written `-`, both when you read it and when you print it. Commands that print, print one line.

| Command | What it does | Prints |
|---|---|---|
| `words X Y` | Replaces the first word with `X` and the second with `Y`. | nothing |
| `show` | Writes the two words. | the first word, a space, the second word |
| `common` | Finds the length of the longest common subsequence of the two words. | that length |

A **subsequence** of a word keeps some of its letters, in their original order, and drops the rest. The dropped letters need not be next to each other, and the empty word is a subsequence of every word. The two words do not change.

A recursion that tries keeping and dropping every letter does work that grows exponentially with the length of the words, and the Tests include words of 1000 letters. Fill a table instead.

## Example

Input:

```
words marble ramble
show
common
words - ramble
show
common
```

Output:

```
marble ramble
4
- ramble
0
```

`marble` and `ramble` share `mble`: the letters `m`, `b`, `l` and `e` come in that order in both words. Four is the most, so the answer is 4. When the first word is empty, nothing can be shared.
