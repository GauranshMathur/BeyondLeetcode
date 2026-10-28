`keep` stores a limit. A `push` always takes a ticket. If the heap is below the limit, or there is no limit, it pushes. Otherwise it looks at the smallest item. A key that is not larger is ignored. A larger one replaces the smallest: it goes into the hole at index 0 and moves down, which is the move `pop` uses, so the heap stays full and in order.

The smallest of the `N` kept items is the `N`-th largest of all the keys pushed, because anything smaller than it has been thrown out and the `N - 1` items above it are the ones larger.

Cost, for `m` pushes with a limit `N`: each push compares with the smallest key in O(1), and a replace is O(log N) comparisons in the **worst case**, so the stream costs O(m log N) in the **worst case**, which happens when every key is larger than the one before it. The heap never holds more than `N` items, so the space is O(N), not O(m).
