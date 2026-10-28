# Paying an amount with the weights

An **Extra Problem**: it branches off after `keep` and does not affect completing the Topic.

In `keep` each item is used at most once, and the table reads only the row above. If the table may read its own row, an item can be used again and again. Read the weights as the values of coins, and count how many ways there are to pay.

| Command | What it does | Prints |
|---|---|---|
| `ways AMOUNT` | Counts the ways to pay exactly `AMOUNT` with the items' weights as coin values, using each kind of coin any number of times. | the number of ways, modulo 1000000007 |

Every item is its own kind of coin, worth its weight, and the values are ignored. Two items with the same weight are two kinds of coin, so a way that uses one of them differs from a way that uses the other. An item of weight 0 is not a coin and is skipped. Two ways are the same if they use the same number of coins of each kind, whatever the order in which you hand them over. There is one way to pay 0: no coins. `AMOUNT` is between 0 and 5000. The answer is the remainder after dividing by 1000000007, the same in every Language. The list does not change.

## Example

Input:

```
items 2 0 3 0 7 0
ways 12
ways 5
ways 0
```

Output:

```
4
1
1
```

The four ways to pay 12 with coins of 2, 3 and 7 are six 2s; three 2s and two 3s; four 3s; and one each of 2, 3 and 7. The only way to pay 5 is a 2 and a 3, and the only way to pay 0 is to pay nothing.
