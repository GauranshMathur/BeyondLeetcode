# Every subset

Python's `itertools` documents the order in which `combinations` and `permutations` produce their tuples, and says that items are told apart by position, not by value. This Problem builds the list of every subset with the choose, explore, undo loop, in an order its loop gives. The reading is [Python's itertools: positions, not values](/chapters/backtracking-itertools). The order below is written for this Problem; the Chapter says how it differs from the `powerset` recipe.

From this Problem the Build holds a list of integers.

Add:

| Command | What it does | Prints |
|---|---|---|
| `load X1 X2 ...` | Replaces the list with the given integers, in order. There may be none. | nothing |
| `subsets` | Lists every subset of the list's items. | one line per subset: its items in the order of the list, separated by single spaces, inside square brackets, such as `[1 3]`; the empty subset is `[]` |

The list has at most 12 items, each between -1,000,000,000 and 1,000,000,000. Items are told apart by **position**: two equal values at different positions are different items, so a subset that uses one of them is not the same as a subset that uses the other, and both are listed. A list of n items has 2^n subsets.

Print the subsets in this order. Compare two subsets as lists of positions of the list. A subset that is the start of another one comes first; otherwise, at the first place where the two differ, the one with the smaller position comes first. That is the order in which a search meets them if it prints at every step and then tries each later position, left to right.

## Example

Input:

```
load 1 2 3
subsets
```

Output:

```
[]
[1]
[1 2]
[1 2 3]
[1 3]
[2]
[2 3]
[3]
```

Another one, with a repeated value:

```
load 2 2
subsets
```

```
[]
[2]
[2 2]
[2]
```

The two `[2]` lines are the subsets that use the first item and the second item.
