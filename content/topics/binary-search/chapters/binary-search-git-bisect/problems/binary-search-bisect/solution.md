This is the `sort.Search` shape without a slice: the range of candidates is `low..high`, with the test hidden behind a function. Here the test is `m >= B`, but the search never reads `B` any other way, which is what makes it work for any property that flips once, as in `git bisect`.

The range always contains the first bad commit: a bad test at `m` means `B <= m`, so `high = m` keeps it, and a good test means `B > m`, so `low = m + 1` keeps it. With `s` candidates, a bad result leaves `ceil(s/2)` of them and a good result leaves `floor(s/2)`, so the bigger side has `ceil(s/2)`. The range reaches one candidate after at most `ceil(log2 N)` tests, which is the **worst case**; `N = 1` takes 0 tests and `N = 2` takes 1.

The one risk is overflow at the top of the range. With `N` near 2,147,483,647 the sum `low + high` can pass 2,147,483,647. Python and Go have room, but a TypeScript `(low + high) >> 1` goes negative; use `>>> 1` or the `mid` you already wrote.
