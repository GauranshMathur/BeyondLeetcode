# Does the walk loop?

Brent's paper describes Floyd's cycle-finding algorithm as moving one value one step per round and another two steps per round until they meet. Here you use that on the table of links.

Add:

| Command | What it does | Prints |
|---|---|---|
| `cycle S` | Starts at node `S` and follows the links. If a link of `-1` is reached, the walk ends. Otherwise the walk loops. | `none` if it ends; if it loops, `m n`, where `m` is the number of nodes on the path before the first node that is part of the loop, and `n` is the number of nodes in the loop |

Every link is `-1` or a valid node number.

## Example

Input:

```
load 1 2 3 1
cycle 0
cycle 1
cycle 3
```

Output:

```
1 3
0 3
0 3
```

The links are 0 to 1, 1 to 2, 2 to 3, 3 to 1. From node 0 the walk goes 0, 1, 2, 3, 1, 2, 3, ... Node 0 is before the loop, and the loop holds nodes 1, 2, 3, so the answer is `1 3`. Starting at node 1 or node 3 is already inside the loop, so `m` is 0: `0 3`. Only the first Example Test is shown above.
