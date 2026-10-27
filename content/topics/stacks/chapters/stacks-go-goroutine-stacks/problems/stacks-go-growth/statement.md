Give the stack a size, and grow it the way Go 1.22.0 grows a goroutine stack. The frames from the last Problem stay as they are.

The stack owns a **segment** of bytes. It starts with a segment of 2,048 bytes. `used` is still the total size of the frames. Keep the **moved** counter too: the number of bytes copied when the stack changed segment. It starts at 0.

New behaviour of `call N`, before the frame is pushed:

1. If `used + N` is not more than the segment, do nothing extra.
2. Otherwise let `size` be twice the segment. While `size` is less than `used + N`, double `size` again.
3. If `size` is more than the **limit**, print `stack overflow` and stop: ignore the rest of the input.
4. Otherwise add `used` to `moved` (the frames in use are copied; the new frame is not), make the segment `size`, and push the frame.

The limit starts at 1,000,000,000.

| Command | What it does | Prints |
|---|---|---|
| `segment` | Reads the segment size. | the size in bytes |
| `moved` | Reads the moved counter. | the number of bytes |
| `limit X` | Sets the limit to `X`. | nothing |

`N` is still between 1 and 1,000,000 for `call`, and `X` is between 1 and 4,000,000,000.

## Example

Input:

```
call 1000
call 1000
segment
moved
call 100
segment
moved
```

Output:

```
2048
0
4096
2000
```

Two frames of 1,000 bytes use 2,000 bytes, which fits in 2,048. The next call needs 2,100, so the segment doubles to 4,096 and the 2,000 bytes in use are copied.
