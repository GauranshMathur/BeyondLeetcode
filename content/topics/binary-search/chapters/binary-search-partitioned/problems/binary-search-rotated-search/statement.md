Use the cut to search a rotated array for a value. Keep every earlier command working.

| Command | What it does | Prints |
|---|---|---|
| `rsearch X` | Looks for `X` in the array loaded by the last `array` command. | the index of `X` in that array, or `-1` if `X` is not there or the array is empty |

For this command, the array is a rotation of a strictly increasing sequence, as in the last Problem: at most 20,000 values, none repeated, each between -1,000,000,000 and 1,000,000,000. The index printed is the index in the array as given, not in the sorted order. Do not scan every item. Note the answer for a miss is `-1`, not Java's `-(insertion point) - 1`.

## Example

Input:

```
array 40 50 60 10 20 30
rsearch 10
rsearch 60
rsearch 35
```

Output:

```
3
2
-1
```
