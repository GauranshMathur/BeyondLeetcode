Add the first half of searching a rotated array: find where it was cut. Keep every earlier command working.

An array is **rotated** when it started as a strictly increasing sequence and its first `k` items, for some `k` from 0 to its length minus 1, were moved to the end in order. For example, `10 20 30 40 50 60` with its first 3 items moved becomes `40 50 60 10 20 30`. With `k = 0` the array is not changed.

| Command | What it does | Prints |
|---|---|---|
| `rotation` | Looks at the array loaded by the last `array` command and finds its smallest item. | the index of the smallest item, or `-1` if the array is empty |

For this command, the array is always a rotation of a strictly increasing sequence (so no value appears twice), it has at most 20,000 values, and every value is between -1,000,000,000 and 1,000,000,000. Do not read every item: use a binary search, and compare against the first item.

## Example

Input:

```
array 40 50 60 10 20 30
rotation
```

Output:

```
3
```

Another run, with an array that was not changed, an empty one and a single item:

```
array 1 2 3
rotation
array
rotation
array 8
rotation
```

prints `0`, `-1` and `0`.
