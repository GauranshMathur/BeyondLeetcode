# Plus or minus every weight

An **Extra Problem**: it branches off after `keep` and does not affect completing the Topic.

Give every weight a plus or a minus sign. How many ways make the signed weights add up to a target?

| Command | What it does | Prints |
|---|---|---|
| `signs TARGET` | Counts the ways to give every item's weight a plus or a minus sign so that the signed weights add up to `TARGET`. | the number of ways, modulo 1000000007 |

Every item takes part, and the values are ignored. Two ways are different if some item gets a different sign, even if two items have the same weight, and an item of weight 0 gives two ways, one for each sign. With no items there is one way to reach 0, the empty one, and none to reach anything else. When `signs` is used, the weights add up to at most 5000, and `TARGET` is between -5000 and 5000. The answer is the remainder after dividing by 1000000007, the same in every Language. The list does not change.

## Example

Input:

```
items 2 0 3 0 5 0
signs 0
signs 4
signs 10
signs 11
```

Output:

```
2
1
1
0
```

To reach 0 the weights 2, 3 and 5 can be signed `+2 +3 -5` or `-2 -3 +5`. To reach 4, `+2 -3 +5` is the only way. To reach 10 every sign is a plus. Nothing reaches 11, which is more than the weights add up to.
