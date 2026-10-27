**Why `pprev`.** Every pointer into a node, from the head or from the previous node, is a cell. A node that remembers the address of that cell can rewrite it without knowing which kind of cell it is. That is the whole trick.

**The four operations.**

- `hadd N H`: `first = H`'s cell; `N.next = first`; if `first` is not 0, `first.pprev = N` (the address of `N`'s `next` cell is `N`); then `H` holds `N` and `N.pprev = H`.
- `hadd_before N X`: `N.pprev = X.pprev`; `N.next = X`; `X.pprev = N`; write `N` into the cell at `N.pprev`.
- `hadd_behind N X`: `N.next = X.next`; `X.next = N`; `N.pprev = X`; if `N.next` is not 0, its `pprev` becomes `N`.
- `hdel N`: write `N.next` into the cell at `N.pprev`; if `N.next` is not 0, set its `pprev` to `N.pprev`; then poison both cells of `N`.

None of them takes the head except `hadd`, and none walks the list. Each is O(1) in the worst case. Compare Problem 4, where removing the k-th node stepped over k - 1.

**What is lost.** The head knows only the first node, so if the tail is not known there is no way to add at the end without walking: O(n) in the worst case. If the caller already holds the tail, `hadd_behind` on it adds at the end in O(1).
