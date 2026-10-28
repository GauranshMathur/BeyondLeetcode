# Combinations that reach a sum

`combinations_with_replacement` in Python lets an item be taken more than once ([lines 271 to 272](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Doc/library/itertools.rst#L271-L272)), still counting items by position ([lines 283 to 284](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Doc/library/itertools.rst#L283-L284)). This Problem lists the ways of reaching a total that way, and gives up on a path as soon as it has gone past the total. The reading is [Python's itertools: positions, not values](/chapters/backtracking-itertools). This Problem is an Extra: it adds to the Build as it stands after `subsets`, and nothing it adds is in the later Problems.

Add:

| Command | What it does | Prints |
|---|---|---|
| `sums T` | Lists every combination of the list's items, each item usable any number of times, whose total is `T`. | one line per combination: its items separated by single spaces inside square brackets, such as `[2 2 3]`; or the single line `none` when there is no combination |

Every item in the list is a positive integer up to 1,000, the list has at most 12 items, and `T` is between 1 and 40. A **combination** is a list of items whose positions never go down: it takes some item, maybe takes it again, then maybe one at a later position, and so on. The order of the items inside a combination is the order of the positions. Items are told apart by position, so a combination that uses an item at one position and the same value at another position are two combinations, and both are listed.

The combinations are listed in this order. Compare two combinations as lists of positions: at the first place where they differ, the one with the smaller position comes first.

## Example

Input:

```
load 2 3 6 7
sums 7
```

Output:

```
[2 2 3]
[7]
```

`2 + 2 + 3` is 7 and uses the item 2 twice. `7` is 7. The list `[3 2 2]` is not a combination of this list, because the position of 3 is after the position of 2.
