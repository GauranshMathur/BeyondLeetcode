# Run the ready tasks together

`graphlib` hands out the ready tasks in batches, and its documentation says it is "designed to easily support parallel processing of the nodes as they become ready" ([graphlib, Python 3.13 documentation](https://docs.python.org/3.13/library/graphlib.html)); [Python graphlib: tasks that are ready](/chapters/graphs-graphlib) reads it. You print the batches.

Add:

| Command | What it does | Prints |
|---|---|---|
| `waves` | Splits the nodes into **waves**. The first wave is every node that has no edge coming into it. Each next wave is every node that was not in an earlier wave and whose incoming edges all start in earlier waves. | one line per wave, in order, with the wave's names sorted as in `order` and separated by single spaces; nothing if the graph is empty |

If the waves stop before every node is in one, the rest wait for each other: after the last wave, print one more line, `cycle`.

## Example

Input:

```
edge core util
edge core net
edge net app
edge util app
waves
edge app core
waves
```

Output:

```
core
net util
app
cycle
```

`core` is the first wave. Once it is done `net` and `util` are free together, and then `app`. After `edge app core` every node has an edge coming into it, so there is no first wave, and the output is just `cycle`.
