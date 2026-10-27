Add the two questions that Go's `sort.Search` and C++'s `lower_bound` and `upper_bound` answer. Keep every earlier command working.

For this Problem, `array` may list values that repeat, in non-decreasing order. (`search` from the last Problem is only used on arrays without repeats.) The array has at most 5,000 values, and every value is between -1,000,000,000 and 1,000,000,000.

| Command | What it does | Prints |
|---|---|---|
| `lower X` | Finds the first index whose item is greater than or equal to `X`. | that index, or the length of the array if every item is below `X` |
| `upper X` | Finds the first index whose item is greater than `X`. | that index, or the length of the array if no item is above `X` |
| `count X` | Counts how many items equal `X`. | the count |

`X` can be any integer from -1,000,000,000 to 1,000,000,000, whether or not it is in the array. Build `count` from the other two, not by looking at every item: the tests send up to 3,000 commands to a 5,000-item array.

## Example

Input:

```
array 1 2 2 2 5 8
lower 2
upper 2
count 2
lower 3
upper 3
count 3
lower 9
upper 0
```

Output:

```
1
4
3
4
4
0
6
0
```

The three 2s sit at indexes 1, 2 and 3: `lower 2` is 1, `upper 2` is 4, and the difference is the count, 3. Nothing equals 3, so `lower 3` and `upper 3` are both 4, where a 3 would go. Everything is below 9, so `lower 9` is the length, 6. Nothing is below 0, so `upper 0` is 0.
