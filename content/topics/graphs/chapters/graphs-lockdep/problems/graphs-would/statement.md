# Would this edge close a circle?

This asks the question lockdep asks before it records a dependency, in [Linux lockdep: the shortest way round a cycle](/chapters/graphs-lockdep). It is an Extra Problem: it branches off `path`, and nothing you add here is carried into the Problems after it.

Add:

| Command | What it does | Prints |
|---|---|---|
| `would A B` | Asks whether adding an edge from `A` to `B` would create a circle, that is, a way to leave a node and come back to it by following the edges. It does not add the edge. | `safe` if it would not; otherwise `cycle`, a space, and the circle written as `A`, then the route `path B A` would print, separated by single spaces |

A circle is created exactly when `B` already leads to `A`, or when `A` and `B` are the same name, which would be an edge from a node to itself. In that case the circle is written `A A`. If `B` leads to `A`, the circle is `A`, followed by the shortest route from `B` to `A`, chosen as in `path`. If either name is not in the graph and the names differ, the edge is safe.

## Example

Input:

```
edge a b
edge b c
would c a
would a c
would a a
```

Output:

```
cycle c a b c
safe
cycle a a
```

Adding `c` to `a` would close the circle `c`, `a`, `b`, `c`: `a` already leads to `c`. Adding `a` to `c` is safe, because `c` leads nowhere.
