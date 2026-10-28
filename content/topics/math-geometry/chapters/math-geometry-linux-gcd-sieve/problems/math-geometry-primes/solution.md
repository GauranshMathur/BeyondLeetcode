Keep a table of flags, one for each number below `sz`, and `last`. One function builds the table for a given size with the sieve of Eratosthenes:

```
build(size):
    flags[n] = true for 2 <= n < size, false below 2
    for p from 2 while p < size:
        if flags[p]:
            last = p
            for m = 2p, 3p, ... below size: flags[m] = false
    sz = size
```

The program starts with `build(64)`, which gives `sz` = 64 and `last` = 61. For `nextprime X`:

```
while X >= last: build(round up (2 * X) to a multiple of 64)
n = X + 1
while not flags[n]: n = n + 1
print n
```

The loop ends because the new `last` is greater than `X`: by the theorem the Chapter quotes, there is a prime between `X` and `2 * X`, and it is below the new size. For the same reason the scan for `n` stops at `last` at the latest.

The kernel copies the old table into the new one and crosses out multiples only from the old size onward. The Reference Code rebuilds from scratch, which gives the same answers.

Cost: every rebuild is O(sz log log sz) in the worst case, since each prime crosses out `sz / p` numbers. After it, a lookup scans from `X + 1` to the next prime, which is within the table. Extra space is O(sz) for the flags.
