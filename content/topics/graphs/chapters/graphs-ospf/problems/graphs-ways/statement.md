# Count the cheapest routes

When two routes cost the same, OSPF can use both: "if multiple equal-cost routes to a destination exist, they are all discovered and used" ([RFC 2328, section 2](https://www.rfc-editor.org/rfc/rfc2328.html#section-2)); [OSPF: every router runs Dijkstra](/chapters/graphs-ospf) reads it. This Extra Problem branches off `cost`, and nothing you add here is carried into the Problems after it.

Add:

| Command | What it does | Prints |
|---|---|---|
| `ways A B` | Counts the routes from `A` to `B` whose total weight is the lowest possible. Two routes are different if they pass through different nodes or in a different order. | the number; `1` if `A` and `B` are the same node in the graph; `0` if there is no route or either name is not in the graph |

Every answer in the Tests is below 10^15.

## Example

Input:

```
edge s a 1
edge s b 1
edge a t 2
edge b t 2
edge s t 3
ways s t
ways t s
```

Output:

```
3
0
```

Three routes from `s` to `t` cost 3: through `a`, through `b`, and the edge `s t` itself. Nothing leads from `t` back to `s`.
