Add the search that goes around the midpoint, with the answer shaped like Java's `Arrays.binarySearch`. Keep `naive` and `mid` working.

Your program now holds one array of integers, empty at the start.

| Command | What it does | Prints |
|---|---|---|
| `array V1 V2 ... Vn` | Replaces the array with the given values, in the order given. With no values, the array becomes empty. | nothing |
| `search X` | Looks for `X` in the array, where `X` is between -1,000,000,000 and 1,000,000,000. | the index of `X`, counting from 0; or, when `X` is absent, `-(p) - 1` where `p` is the index at which `X` would have to be inserted to keep the array in order: the index of the first item greater than `X`, or the length of the array when no item is. |

For this Problem, every `array` command lists values in strictly increasing order, so no value appears twice. The array has at most 5,000 values, and every value is between -1,000,000,000 and 1,000,000,000. `search` does not change the array. Your `search` must take about log2 of the array's length steps, not a pass over every item.

## Example

Input:

```
array 2 5 9 14
search 9
search 1
search 6
search 20
```

Output:

```
2
-1
-3
-5
```

`1` would go at index 0, so the answer is `-0 - 1 = -1`. `6` would go at index 2, between 5 and 9, so the answer is `-3`. `20` would go after the last item, at index 4, so the answer is `-5`.
