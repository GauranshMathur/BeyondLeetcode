Build a second stack in the same program, with the operations of Java's `Stack` from OpenJDK jdk-21+35. It is separate from the call stack of the last Chapter: leave that one working.

The stack holds integers. Keep them in a **block** of slots, the way the Dynamic arrays Topic does: the block has a size you choose when you make it and never change. In Python, make a block with `[0] * size`; in TypeScript, `new Array<number>(size).fill(0)`; in Go, `make([]int, size)`. Do not use `append` or `push` on the block to grow it.

Keep the **count** of items and the **capacity** (the size of the block). The block starts with capacity 10, and a **copies** counter starts at 0.

| Command | What it does | Prints |
|---|---|---|
| `push X` | Adds `X` on top. If the block is full, first replace it with a block of twice the capacity, copy the items across, and add the count to `copies`. | nothing |
| `pop` | Removes the top item. | the item, or `error` if the stack is empty |
| `peek` | Reads the top item without removing it. | the item, or `error` if the stack is empty |
| `empty` | Asks whether the stack has no items. | `true` or `false` |
| `search X` | Finds the item equal to `X` nearest the top. | its distance from the top, where the top item is at distance 1; `-1` if there is none |
| `size` | Reads the count. | the count |
| `capacity` | Reads the capacity. | the capacity |
| `copies` | Reads the copies counter. | the counter |

Popping never changes the capacity. Every value of `X` fits between -1,000,000,000 and 1,000,000,000. A stack never holds more than 100,000 items.

## Example

Input:

```
push 5
push 7
push 5
peek
search 5
search 7
search 9
size
capacity
pop
pop
pop
pop
empty
```

Output:

```
5
1
2
-1
3
10
5
7
5
error
true
```

`search 5` finds the nearest 5, the top one, at distance 1. `search 7` is one below it, at distance 2.
