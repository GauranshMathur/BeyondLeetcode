# Every ordering

Python's `permutations` emits every ordering of its input in lexicographic order of the input's own order ([lines 542 to 543](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Doc/library/itertools.rst#L542-L543)), and counts items by position ([lines 546 to 547](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Doc/library/itertools.rst#L546-L547)). This Problem builds the same list with a search that never takes an item twice. The reading is [Python's itertools: positions, not values](/chapters/backtracking-itertools).

Add:

| Command | What it does | Prints |
|---|---|---|
| `perms` | Lists every ordering of all the items of the list. | one line per ordering: its items separated by single spaces inside square brackets, such as `[7 4 5]` |
| `perms R` | Lists every ordering of `R` of the items: every way to pick `R` different positions and put them in order. `R` is a whole number from 0 up to the number of items. | the same, with `R` items on each line; `R` equal to 0 gives the one line `[]` |

The list has at most 8 items. An ordering of an empty list is `[]`. Items are told apart by position, as in `subsets`: two equal values at different positions give separate orderings, so an ordering can be printed more than once. With n items there are n! / (n - R)! lines.

Print the orderings in this order. Compare two orderings as lists of positions of the list: at the first place where they differ, the one with the smaller position comes first. In other words, the first item is chosen from the earliest position, then the second, and so on, and the search tries positions left to right at every place.

## Example

Input:

```
load 4 7 5
perms
perms 2
```

Output:

```
[4 7 5]
[4 5 7]
[7 4 5]
[7 5 4]
[5 4 7]
[5 7 4]
[4 7]
[4 5]
[7 4]
[7 5]
[5 4]
[5 7]
```

The first six lines are `perms`, the last six are `perms 2`. Order is by position: the first line takes positions 0, 1, 2, and the next takes 0, 2, 1.
