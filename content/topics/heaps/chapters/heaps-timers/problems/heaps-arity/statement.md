Make the number of children a choice. A binary heap gives every item two children. The heap that holds timers in Go's runtime gives every item four ([src/runtime/time.go, line 990](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/time.go#L990)).

| Command | What it does | Prints |
|---|---|---|
| `arity D` | Sets the number of children `D` (from 2 to 8). It only appears while the heap is empty, at most once per input. | nothing |

With arity `D`, the children of index `i` are the indexes `D*i + 1` up to `D*i + D`, and the parent of index `p` above 0 is `(p - 1) / D`, whole-number division. Everything else works as before, with the same rules: moving up compares an item with its parent. Moving down finds the smallest child by comparing the children one after another with the smallest so far (a hole with `c` children counts `c - 1` comparisons), moves it up, and so on to a leaf. `init` starts at the last index that has a child, `(n - 2) / D`, and goes down to 0.

Without `arity` the heap has two children per item.

## Example

Input:

```
arity 4
push 9
push 8
push 7
push 6
push 5
push 4
push 3
push 2
push 1
show
pop
show
```

Output:

```
1 2 8 7 6 9 5 4 3
1
2 3 8 7 6 9 5 4
```

With four children, 9 items fill only 3 rows: index 0, then indexes 1 to 4, then indexes 5 to 8. The first `show` is the array after pushing 9 down to 1.
