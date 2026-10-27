# The teleporting tortoise

An **Extra Problem**: it branches off after `cycle` and does not affect completing the Topic.

Emacs does not use Floyd's two speeds. Its list loops keep a "tortoise" still, move only a "hare", and let the tortoise jump to the hare after a window of steps that doubles each time. This Problem asks you to count how long that takes. The rule below is written for this Problem; it follows the shape of the macro in the Chapter.

Add:

| Command | What it does | Prints |
|---|---|---|
| `teleport S` | Walks from node `S` with the rule below. | the number of steps taken when the hare lands on the tortoise; `none` if the walk reaches a link of `-1` first |

**The rule.** The tortoise starts at `S` and so does the hare. The window starts at 2, and `left` is 2. Repeat:

1. move the hare to the next node and count one step. If that node is `-1`, print `none` and stop;
2. subtract 1 from `left`;
3. if `left` is not 0: if the hare is on the tortoise's node, print the number of steps and stop;
4. if `left` is 0: double the window, set `left` to the new window, and move the tortoise to the hare's node. Do not compare in this round.

## Example

Input:

```
load 1 2 3 1
teleport 0
teleport 1
teleport 3
```

Output:

```
5
5
5
```

From node 0 the hare goes 1, 2, 3, 1, 2. After step 1 it is on node 1, not on the tortoise (node 0). After step 2, `left` is 0: the window becomes 4 and the tortoise jumps to node 2. The hare goes to 3, then 1, then 2 on step 5, which is the tortoise's node: print 5. Only the first Example Test is shown above.
