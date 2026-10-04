The change to `append` is small: where it used to compute "twice the capacity", it now asks a function for the next capacity, and that function looks at the policy. The copies counter goes in the one place where a block is replaced, so every rule is counted the same way.

`fill` is a loop around the same `append` code. It must not take a shortcut such as making one big block, because the capacity and the copies would then differ from `N` separate appends.

Try the two rules on 1,000 appends. `exact` copies 0 + 1 + ... + 999 = 499,500 items: the block is full on every append. `double` changes blocks only at lengths 1, 2, 4, ... 512 and copies 1,023 items.

Cost of n appends, counted in copies: `exact` is n(n - 1)/2, which is O(n²) in the worst case and also on every run, so each append costs O(n) amortised. `double` is fewer than 2n, so each append costs O(1) amortised, although a single append that has to copy is still O(n) in the worst case.
