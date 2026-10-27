The Build for this Topic is a set of stacks, one Chapter at a time. You start from an empty file. This Chapter's stack is the call stack of a Go goroutine, and this first Problem is its simplest form: frames go on, frames come off.

Your program reads commands from standard input, one per line, until the input ends. Skip empty lines.

A **frame** is a number of bytes. Keep the frames in a stack, last in, first out, and keep track of how many bytes are in use in total.

| Command | What it does | Prints |
|---|---|---|
| `call N` | Pushes a frame of `N` bytes. | nothing |
| `ret` | Pops the newest frame. | the size of the frame, or `error` if there is none |
| `depth` | Counts the frames on the stack. | the count |
| `used` | Adds up the sizes of the frames on the stack. | the total |

`N` is between 1 and 1,000,000. A stack never holds more than 100,000 frames.

## Example

Input:

```
call 100
call 250
depth
used
ret
ret
ret
depth
```

Output:

```
2
350
250
100
error
0
```
