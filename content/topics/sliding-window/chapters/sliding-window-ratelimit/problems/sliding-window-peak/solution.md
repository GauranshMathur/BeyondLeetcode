Set `K` to the smaller of `K` and the length `n`. Add up the first `K` items as `window` and set `best` to it. Then, for `i` from `K` to `n - 1`, do `window += values[i] - values[i - K]` and update `best`. An empty sequence prints `0`.

Each step moves the window by one item: one item enters on the right and one leaves on the left. The other `K - 1` items are the ones already counted, so the total is updated in constant time. That is O(n) in the worst case and O(1) extra space. Adding every window from scratch is O(n × K) in the worst case. The largest Hidden Test has thousands of items and a window of thousands.

Because every item is a count (never negative), every block of `blocks K` is inside some window, so `peak K` is never smaller than `blocks K`. The example is the case where it is twice as big.
