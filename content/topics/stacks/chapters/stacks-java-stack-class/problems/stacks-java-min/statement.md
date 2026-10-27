Java's `Stack` has no operation for the smallest item. Add `min` to the stack from the last Problem, so that it answers in constant time without looking through the block.

| Command | What it does | Prints |
|---|---|---|
| `min` | Reads the smallest item on the stack. | the item, or `error` if the stack is empty |

Every `push`, `pop` and `peek` behaves as before. `min` must take O(1) time in the worst case: do not loop over the items.

## Example

Input:

```
push 5
push 3
push 8
min
pop
min
pop
pop
min
pop
```

Output:

```
3
8
3
3
5
error
error
```

The first `min` prints 3. The first `pop` removes the 8 and the second `min` prints 3 again. The second `pop` removes the 3 and prints it, and the stack now holds only 5. The last `min` and `pop` find the stack empty.
