Make the cost of growing visible, and make the growth rule something the input chooses.

Add a **copies** counter that starts at 0. Every time the Build moves to a new block, add the number of items it copied.

New commands:

| Command | What it does | Prints |
|---|---|---|
| `policy NAME` | Chooses the growth rule. It only ever appears as the first line. Without it the rule is `double`. | nothing |
| `cap` | Reads the capacity. | the capacity |
| `copies` | Reads the copies counter. | the counter |
| `fill N X` | The same as `append X`, done `N` times. `N` can be 0. | nothing |

The two rules, used when `append` finds the block full:

- `double`: the new capacity is twice the old one, or 1 if the old one is 0. This is what your Build already does.
- `exact`: the new capacity is the old one plus 1.

`N` is at most 200,000 under `double` and at most 2,000 under `exact`.

## Example

Input:

```
policy exact
append 10
append 20
append 30
append 40
cap
copies
```

Output:

```
4
6
```

The four appends copy 0, 1, 2 and 3 items.
