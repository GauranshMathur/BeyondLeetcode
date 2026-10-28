The Build for this Topic is a priority queue of integers, which grows into a timer scheduler. You start from an empty file.

Keep the items in one array (a Python list, a TypeScript array, a Go slice) arranged as a **min-heap**: the item at index `i` is not larger than the items at indexes `2i + 1` and `2i + 2`, so index 0 holds the smallest. Write the heap yourself. Do not use `heapq`, `container/heap` or any other built-in priority queue, and do not sort the array.

Every item has a **key**, an integer, and a **ticket**: the number of `push` commands that came before it, so the first push has ticket 0. Items compare by key first and by ticket second, which means that of two items with the same key the one pushed first is the smaller. No two items are ever equal, so every correct heap holds the same items in the same places.

Your program reads commands from standard input, one per line, until the input ends. Skip empty lines.

| Command | What it does | Prints |
|---|---|---|
| `push K` | Adds an item with key `K`. It goes at the end of the array and moves up, swapping with its parent, while it is smaller than its parent. | nothing |
| `pop` | Removes the smallest item. The last item of the array takes the place of index 0 and moves down, swapping with its smaller child, while a child is smaller than it. | the key of the removed item, or `empty` if there are no items |
| `peek` | Reads the smallest item without removing it. | its key, or `empty` |
| `size` | Reads the number of items. | the number |
| `show` | Reads the array. | the keys in array order, separated by single spaces, or `empty` |

When the only item is popped the array is simply empty afterwards.

Every key is between -1,000,000,000 and 1,000,000,000.

## Example

Input:

```
push 5
push 3
push 8
push 1
show
pop
show
size
```

Output:

```
1 3 8 5
1
3 5 8
3
```

The first `show` is `1 3 8 5`: pushing 1 moves it up past 5 and then past 3. The `pop` takes the 5 from the end, puts it at the top, and the smaller child, 3, moves up over it.
