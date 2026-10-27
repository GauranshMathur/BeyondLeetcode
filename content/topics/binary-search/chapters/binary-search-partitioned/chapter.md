# C++: partitioned, not sorted

Every binary search so far has said "sorted array" in its first sentence. The C++ standard does not. This Chapter reads what it requires instead, in the C++ working draft N4950 and in GCC 13.2.0's libstdc++, and uses it to search an array that is sorted only in two pieces.

## The precondition is weaker than "sorted"

The standard defines the word it relies on: "A sequence [start, finish) is partitioned with respect to an expression f(e) if there exists an integer n such that for all 0 <= i < (finish - start), f(*(start + i)) is true if and only if i < n." ([C++ working draft N4950, [alg.sorting.general], lines 6636 to 6640](https://github.com/cplusplus/draft/blob/4e4de1df8ee941255b653b61d0a62050b34cf8c9/source/algorithms.tex#L6636-L6640)) In other words: the test is true for a first stretch of the sequence and false for the rest, with no true after a false.

And the binary search algorithms are written in those terms. "All of the algorithms in [alg.binary.search] are versions of binary search and assume that the sequence being searched is partitioned with respect to an expression formed by binding the search key to an argument of the comparison function." ([[alg.binary.search.general], lines 7181 to 7184](https://github.com/cplusplus/draft/blob/4e4de1df8ee941255b653b61d0a62050b34cf8c9/source/algorithms.tex#L7181-L7184)) For `lower_bound` that expression is `comp(e, value)`, "e is less than the value". A sorted sequence is partitioned by it, because the items less than the value come first. But a sorted sequence is only one kind of sequence that is.

The standard says what that buys. `partition_point` is the same search with the test left open to the caller: it requires that the elements "are partitioned with respect to" the caller's predicate, and returns "an iterator mid such that E(*i) is true for all iterators i in [first, mid), and false for all iterators i in [mid, last)", in "O(log(last - first)) applications of pred". ([[alg.partitions], lines 7673 to 7688](https://github.com/cplusplus/draft/blob/4e4de1df8ee941255b653b61d0a62050b34cf8c9/source/algorithms.tex#L7673-L7688)) libstdc++'s `partition_point` is the loop you saw in the last Chapter, with `__pred(*__middle)` in the place of the comparison. ([bits/stl_algo.h, lines 572 to 588](https://github.com/gcc-mirror/gcc/blob/c891d8dc23e1a46ad9f3e757d09e57b500d40044/libstdc%2B%2B-v3/include/bits/stl_algo.h#L572-L588)) So `lower_bound(value)` is `partition_point` with the predicate "item < value", and your own `lower` can be rewritten as `partition_point` with a predicate.

## A rotated array is partitioned

Take a strictly ascending array and cut it at some place, then move the front part to the back. This is a **rotation**. `[10, 20, 30, 40, 50, 60]` cut after 3 items becomes `[40, 50, 60, 10, 20, 30]`. It is not sorted, so `lower_bound` cannot be used on it as it stands: for a value such as 35, the test "item < 35" gives false, false, false, true, true, true, which is not partitioned.

Yet it has a test that flips once. Ask of each item: "is it at least as large as the first item?" For `[40, 50, 60, 10, 20, 30]` the answers are true, true, true, false, false, false. That is partitioned with `n = 3`, and the first false is the smallest item: the point where the array was cut. So `partition_point` with the predicate `e >= items[0]` finds the rotation in a logarithmic number of tests, with the whole array searched and no sorting. (This is the standard's definition applied to a new predicate, not a claim the standard or libstdc++ makes about rotated arrays.) If every answer is true, there is no cut and the array is simply sorted: report the cut at index 0.

The same test shows why the Problems promise **distinct** values. With repeats, the predicate can stop being partitioned: for `[2, 2, 0, 1, 2]` the answers are true, true, false, false, true, a true after a false, and no `n` fits. A binary search on such an array cannot tell which side it is on, and may go the wrong way.

## Searching the rotated array

Once you know where the cut is, a rotated array is a sorted array read from a shifted start. If the cut is at index `start` and the array has `n` items, then position `p` of the sorted order is index `(p + start) % n` of the array. Run the ordinary search from the first Chapter on positions `0..n-1` and convert each position to an index with that formula before reading the item. Two passes of about `log2 n` steps each is still O(log n) in the **worst case**, and the extra space is constant.

You can also search in one pass by asking at each step which half is sorted. Both work; the two-pass version reuses the primitive you have just built, and it is the one in the Reference Code.
