Size: `bits = max(64, N * B)`, then `bytes = (bits + 7) / 8` with whole-number division, then `bits = bytes * 8`. Probes: `k = floor(B * 0.69)`, then `min(30, max(1, k))`.

Both are a few operations, so the command is O(1) in the worst case.

**Language notes.** All three Languages multiply a whole number by 0.69 in 64-bit floating point and get the same result for every `B` from 1 to 100, so dropping the fraction (`int` in Python, `Math.floor` in TypeScript, `int(float64(b) * 0.69)` in Go) agrees. For `B` of 44 or more the result is clamped to 30 anyway.

**Edges.** `N` = 0 prints a size of 64. `N * B` of 65 rounds up to 72. `B` = 1 would give 0 probes before the clamp and prints 1. `B` = 100 prints 30.
