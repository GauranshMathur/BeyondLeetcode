Keep the smaller half of the keys in one heap and the larger half in the other, so that every key in the smaller half is no larger than every key in the larger half. The median is then at the top of one of them. The smaller half is the one that has to give its largest key, but a heap gives its smallest, so it stores negated keys.

For each new key: put it in the smaller half if it is not larger than that half's largest key (the negation of its top), otherwise in the larger half. Then, if the smaller half has two more items than the larger, move its top across. If the larger half has more items than the smaller, move its top across. The smaller half now has the same number of items as the larger, or one more, and its top is the lower median.

Cost: each `track` is O(log n) comparisons in the **worst case** (one push and at most one pop and push), and reading the median is O(1). The two heaps together hold all `n` keys, so the space is O(n).
