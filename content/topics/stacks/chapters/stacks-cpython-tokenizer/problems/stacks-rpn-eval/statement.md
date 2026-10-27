Add the other stack from this Chapter: the value stack of a stack machine. `rpn` evaluates a program of numbers and operators in postfix order, and reports the deepest the stack got, which is what a code object stores as `co_stacksize`.

| Command | What it does | Prints |
|---|---|---|
| `rpn T1 T2 ... Tn` | Runs the tokens from left to right. | one line, below |
| `rpn` | A program with no tokens. | `error not one value` |

A token is an integer such as `7` or `-3`, or one of the operators `+`, `-`, `*` and `//`.

- **An integer** is pushed. Remember the deepest the stack has been (its largest number of entries).
- **An operator** pops two values: the right operand first, then the left. It pushes `left op right`. `//` is floor division (rounds towards minus infinity: `-7 // 2` is `-4`). If the stack holds fewer than two values, stop and print `error stack underflow`. If the operator is `//` and the right operand is 0, stop and print `error divide by zero`.

When all the tokens have run: if the stack does not hold exactly one value, print `error not one value`. Otherwise print the value, a space, and the deepest stack size.

Each integer token fits between -1,000,000,000 and 1,000,000,000, and every value during the run stays between -1,000,000,000,000 and 1,000,000,000,000. A program has at most 100,000 tokens. Print exactly one line for each `rpn`.

## Example

Input:

```
rpn 3 4 + 2 *
rpn 1 2 3 4 + + +
rpn -7 2 //
rpn 5 0 //
rpn +
rpn 1 2
rpn
```

Output:

```
14 2
10 4
-4 2
error divide by zero
error stack underflow
error not one value
error not one value
```

In the first program the stack holds 3, then 3 and 4 (two entries), then 7 after the add, then 7 and 2, then 14. Its deepest is 2. In the second all four numbers are loaded before any operator runs, so the deepest is 4.
