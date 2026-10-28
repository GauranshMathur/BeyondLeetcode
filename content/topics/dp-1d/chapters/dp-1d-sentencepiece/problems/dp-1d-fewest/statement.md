# The fewest coins

SentencePiece's Viterbi pass takes the best total where its forward pass takes the sum ([the Chapter](/chapters/dp-1d-sentencepiece) reads both). `ways` counted the ways to reach a total. Now ask for the best way, with the same table and the same step sizes.

The sequence is now a list of **coin values**: distinct positive integers. Each coin value may be used as many times as you like.

Add:

| Command | What it does | Prints |
|---|---|---|
| `fewest A` | Finds the smallest number of coins whose values add up to exactly `A`. | that number; `0` if `A` is 0; `-1` if no coins add up to `A` |

`A` is between 0 and 10000, and there are at most 100 coin values. The sequence does not change.

## Example

Input:

```
load 1 5 6
show
fewest 10
fewest 0
load 4 6
fewest 7
fewest 12
```

Output:

```
1 5 6
2
0
-1
2
```

With coins 1, 5 and 6, the amount 10 is two coins: 5 + 5. Taking the largest coin first would give 6 + 1 + 1 + 1 + 1, which is five. With coins 4 and 6 every total is even, so 7 is impossible, and 12 is 6 + 6.
