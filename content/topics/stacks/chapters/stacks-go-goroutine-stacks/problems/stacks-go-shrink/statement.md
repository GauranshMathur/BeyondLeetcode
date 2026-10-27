Add the shrink rule, which Go runs when the garbage collector scans a goroutine's stack. The garbage collector is not part of this Build; the command `gc` stands for one scan of this stack.

| Command | What it does | Prints |
|---|---|---|
| `gc` | Shrinks the stack by half when little of it is in use. | nothing |

On `gc`, let `half` be the segment divided by 2 (rounded down).

- If `half` is less than 2,048, do nothing.
- If `used` is at least the segment divided by 4 (rounded down), do nothing.
- Otherwise the stack moves: add `used` to `moved`, as in growing, and make the segment `half`.

One `gc` shrinks the segment at most once, however empty the stack is.

## Example

Input:

```
call 2000
call 2000
ret
ret
call 500
segment
moved
gc
segment
moved
gc
segment
```

Output:

```
2000
2000
4096
2000
2048
2500
2048
```

The second `call` grows the segment to 4,096 and moves 2,000 bytes. After both returns and a call of 500 bytes, 500 is less than 4,096 / 4 = 1,024, so `gc` halves the segment to 2,048 and moves 500 more bytes, 2,500 in all. The second `gc` finds that half of 2,048 is 1,024, below the minimum, and does nothing.
