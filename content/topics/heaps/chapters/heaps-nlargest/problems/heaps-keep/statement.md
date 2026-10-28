Make the heap keep only the best few items of a stream.

| Command | What it does | Prints |
|---|---|---|
| `keep N` | Limits the heap to `N` items (`N` is at least 1). It only appears while the heap is empty, and at most once per input. | nothing |

Once `keep` has been given, `push K` changes. It still takes a ticket. Then:

- If the heap has fewer than `N` items, the push works as before.
- If it has `N` items, compare `K` with the key of the smallest item, the one at index 0. If `K` is **larger**, the smallest item is replaced: the new item goes into the hole at index 0 and moves down exactly as in a `pop` (hole, smaller children up to a leaf, item in, move up no higher than index 0). If `K` is equal or smaller, the new item is ignored and the heap does not change.

That comparison of `K` with the smallest key is not counted by `cmp`. The moves inside the heap are.

Without `keep` nothing changes. With it, once `N` keys have been pushed `peek` is the `N`-th largest key pushed so far. Before that, `peek` is the smallest key, as always.

## Example

Input:

```
keep 3
push 4
push 5
push 8
push 2
peek
push 9
peek
size
```

Output:

```
4
5
3
```

After `4 5 8` the heap is full and its smallest key, 4, is the 3rd largest of what has come. The 2 is not larger than 4 and is ignored. The 9 is larger, so it replaces the 4, and the smallest key is now 5.
