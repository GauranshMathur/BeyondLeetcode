# Two numbers instead of a window

Cloudflare's rate limiter does not keep a window. It keeps two numbers per counter: the total of the previous period and the total of this period so far, and it estimates the rate from them. This Problem asks you to replay that rule second by second. The rule below is written for this Problem; it follows the formula in the Chapter.

Add:

| Command | What it does | Prints |
|---|---|---|
| `approx K B` | For every second, computes an estimate (below) and compares it with the limit `B`. | the number of seconds whose estimate is **more than** `B` |

`K` is at least 1 and `B` is 0 or more. The periods are the same blocks as in `blocks K`: seconds `0` to `K - 1` are period 0, seconds `K` to `2K - 1` are period 1, and so on.

**The estimate for second `i`.** Let `b` be the period that second `i` is in, and `elapsed` the number of seconds of that period that have passed, counting second `i` itself, so `elapsed = (i mod K) + 1`. Let `cur` be the total of period `b` up to and including item `i`. Let `prev` be the total of the whole of period `b - 1`, or 0 if `b` is 0. Then

```
estimate = prev * (K - elapsed) / K + cur
```

To avoid fractions, test `prev * (K - elapsed) + cur * K > B * K` instead. The sequence does not change.

## Example

Input:

```
load 4 6 8 3 1 2 9 9 0
approx 3 9
```

Output:

```
7
```

The periods are `4 6 8`, `3 1 2` and `9 9 0`, with totals 18, 6 and 18. The estimates for seconds 0 to 8 are 4, 10, 18, 15, 10, 6, 13, 20 and 18. Seven of them are more than 9. Second 3, for example, has `prev = 18`, `elapsed = 1` and `cur = 3`, so its estimate is 18 × 2/3 + 3 = 15.
