# Cutting a row of digits into codes

SentencePiece's forward pass adds up every way to cut a text into pieces ([the Chapter](/chapters/dp-1d-sentencepiece)). Here the text is a row of digits and the pieces are the codes 1 to 26, such as the letters of an alphabet.

The sequence is now a row of **digits**: integers from 0 to 9. A **cut** splits the whole row, in order, into **tokens**. A token is either one digit from 1 to 9, or two digits whose number is from 10 to 26. A token never starts with a 0, so a lone 0 is not a token and neither is `06`. Every digit belongs to exactly one token. Two cuts are different if they split the row differently.

Add:

| Command | What it does | Prints |
|---|---|---|
| `decode` | Counts the cuts of the whole row. | the number of cuts, modulo 1000000007; `1` for an empty row (the empty cut); `0` if there is no cut |

The row has at most 3000 digits. The sequence does not change.

## Example

Input:

```
load 1 2 2 6
show
decode
```

Output:

```
1 2 2 6
5
```

The five cuts of `1226` are 1|2|2|6, 12|2|6, 1|22|6, 1|2|26 and 12|26. A second example, `load 1 0 6` then `decode`, has one cut, `10|6`: the `0` cannot stand alone and `06` is not a token. The row `0 7` has no cut, since it starts with a 0.
