Make the cost of the heap visible, and change how `pop` moves an item down.

The heap now counts **comparisons**: every time it asks whether one item is smaller than another, to decide where an item goes. The counter starts at 0 and never resets. Comparisons are counted in two places and nowhere else.

**Moving up** happens in `push` and at the end of `pop`. The item is compared with its parent. If it is smaller, they swap places and the check repeats from the new place. If it is not smaller, or it has reached index 0, it stops. Each check counts 1, and reaching index 0 costs nothing more.

**Moving down** is how `pop` now works, the way CPython's `heapq` does it. Take the last item out of the array and set it aside. The slot at index 0 is now a hole. While the hole has a child, compare the hole's two children with each other (that counts 1; a hole with a single child counts nothing), and move the smaller child up into the hole. The hole is now where that child was. When the hole has no child, put the item you set aside into it and move it up as described above, never higher than index 0.

This changes how a `pop` gets there, not where the items end up: the array after every command is the same as in the previous Problem.

New command:

| Command | What it does | Prints |
|---|---|---|
| `cmp` | Reads the comparison counter. | the counter |

## Example

Input:

```
push 5
push 3
push 8
push 1
cmp
pop
cmp
```

Output:

```
4
1
6
```

The four pushes count 0, 1, 1 and 2 comparisons (the last item is compared with its parent 5, then with 3, and both times it is smaller). The `pop` compares the children 3 and 8 once, moves 3 up, puts the 5 in the leaf and compares it with its new parent 3 once: 4 + 2 = 6.
