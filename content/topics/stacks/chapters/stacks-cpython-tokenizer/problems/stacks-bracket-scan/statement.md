Add the bracket stack from CPython 3.13.0's tokenizer. The source text is given on the command line, with `/` standing for a line break.

| Command | What it does | Prints |
|---|---|---|
| `scan S` | Checks the brackets in `S`. | one line, below |
| `scan` | The same for an empty source. | `ok` |

`S` has no spaces and contains only the characters `(`, `)`, `[`, `]`, `{`, `}` and `/`. It is at most 1,000,000 characters long. The first line is line 1, and each `/` starts the next line.

Read `S` from the first character to the last, with a stack of opening brackets. Each entry holds the bracket and the line it was on.

- **An opening bracket** (`(`, `[` or `{`): if the stack already holds 200 entries, stop and print `too many nested parentheses`. Otherwise push it.
- **A closing bracket**: if the stack is empty, stop and print `unmatched 'C'`, where `C` is the closing bracket. Otherwise pop the top. If it does not pair with the closing bracket (`(` with `)`, `[` with `]`, `{` with `}`), stop and print `closing parenthesis 'C' does not match opening parenthesis 'O'`, where `O` is the popped bracket. If the popped bracket was on an earlier line than the closing one, add ` on line N` to the end, where `N` is the line of `O`.
- **A line break** (`/`): the line number goes up by one.

When all of `S` is read without stopping: if the stack still holds entries, print `'O' was never closed`, where `O` is the bracket on top (the innermost one still open). Otherwise print `ok`.

Print exactly one line for each `scan`.

## Example

Input:

```
scan ([]{})
scan (]
scan )
scan [(
scan (/[/)
scan
```

Output:

```
ok
closing parenthesis ']' does not match opening parenthesis '('
unmatched ')'
'(' was never closed
closing parenthesis ')' does not match opening parenthesis '[' on line 2
ok
```

In the fifth source the `[` is on line 2 and the `)` is on line 3, so the message names line 2.
