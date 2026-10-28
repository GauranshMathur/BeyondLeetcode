# Count the states, with and without memory

Go's regexp package has a backtracker that never enters the same (position, instruction) state twice, which keeps its time linear in the text. This Problem measures what that memory saves on the matcher you have. The reading is [Go: never enter the same state twice](/chapters/backtracking-go-regexp). The rules below are written for this Problem; the Chapter says how Go differs.

A **state** is a pair of numbers: the step the search is at (steps are as in `match`: a run of letters or a group) and the position in the text. The **plain search** is the search of `match`. It enters the state (0, 0). Entering a state, it tries the options of that step in order, and for each one that fits it enters the state after it, step plus 1 and position plus the length of the option. It stops at the first success. The state `(S, p)`, where S is the number of steps, is the end: it succeeds exactly when `p` is the length of the text, and it is entered like any other state. Every entry counts, including the ones that fail at once.

The **visited search** is the same search with a memory. It remembers every state it has entered. When it would enter a state it remembers, it fails at once instead, and that is **not** counted as an entry.

Add:

| Command | What it does | Prints |
|---|---|---|
| `cost PATTERN TEXT` | Runs both searches on the pattern and text. | `plain A visited B`, where `A` is the number of states the plain search enters and `B` the number the visited search enters |

The patterns and texts follow the rules of `match`. The `match` command keeps working as before.

## Example

Input:

```
cost (a|aa)(a|aa)b aaaa
```

Output:

```
plain 7 visited 6
```

The pattern has three steps. The plain search enters `(0,0)`. Taking `a` it enters `(1,1)`; from there `a` enters `(2,2)` and `aa` enters `(2,3)`, and neither lets `b` match. Back at the start, `aa` enters `(1,2)`, from which `a` enters `(2,3)` again and `aa` enters `(2,4)`. That is 7 entries. The visited search skips the second entry of `(2,3)`, so it makes 6.
