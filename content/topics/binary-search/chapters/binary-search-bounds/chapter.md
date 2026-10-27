# Go and C++: one search, many questions

Java's search stops the moment it finds the key, and a miss comes back as a coded number. Two other standard libraries made a different choice: they never stop early, and they never say "not found". They answer one question, "where does the answer start?", and let the caller ask everything else. This Chapter reads Go 1.22.0's `sort.Search` and the C++ standard's `lower_bound` and `upper_bound`, together with how GCC 13.2.0's libstdc++ writes them.

## Go: the first index where a test turns true

`sort.Search` is documented as: "Search uses binary search to find and return the smallest index i in [0, n) at which f(i) is true, assuming that on the range [0, n), f(i) == true implies f(i+1) == true." ([src/sort/search.go, lines 9 to 14, Go 1.22.0](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/sort/search.go#L9-L14)) The caller supplies `f`, a function that is false for some prefix and true for the rest. If no index is true it returns `n`, and the doc stresses that "the 'not found' return value is not -1 as in, for instance, strings.Index." ([lines 14 to 16](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/sort/search.go#L14-L16))

To search a sorted slice for 23, the doc has you pass `func(i int) bool { return data[i] >= 23 }`. The result is the smallest index whose item is at least 23, and the doc continues: "If the caller wants to find whether 23 is in the slice, it must test data[i] == 23 separately." ([lines 25 to 29](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/sort/search.go#L25-L29)) The search does not know about slices at all. It only knows about an index range and a yes/no test, and the sorted slice is hidden inside the test.

The loop is short, and its comments state the invariant:

```go
// Define f(-1) == false and f(n) == true.
// Invariant: f(i-1) == false, f(j) == true.
i, j := 0, n
for i < j {
	h := int(uint(i+j) >> 1) // avoid overflow when computing h
	// i ≤ h < j
	if !f(h) {
		i = h + 1 // preserves f(i-1) == false
	} else {
		j = h // preserves f(j) == true
	}
}
// i == j, f(i-1) == false, and f(j) (= f(i)) == true  =>  answer is i.
return i
```

([lines 59 to 72](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/sort/search.go#L59-L72))

Compare it with Java's loop. The range is **half-open**: `[i, j)`, where `j` is one past the last candidate. It starts at `j = n`, the imagined index after the end, and the comments treat `f(n)` as true without ever calling it. Because `j` is always a position where the answer may be, a "miss" needs no special return: when the loop ends, `i == j` and that is the answer, which may be `n`. The midpoint is the same Java fix as in the last Chapter, written with an unsigned shift and a comment: "avoid overflow when computing h". ([line 63](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/sort/search.go#L63))

## C++: the same question, asked of a standard

C++ names the two common questions. `lower_bound` returns "the furthermost iterator i in the range [first, last] such that for every iterator j in the range [first, i), bool(invoke(comp, invoke(proj, *j), value)) is true", where `comp` is `less` unless you pass another. ([C++ working draft N4950, [lower.bound], lines 7229 to 7233](https://github.com/cplusplus/draft/blob/4e4de1df8ee941255b653b61d0a62050b34cf8c9/source/algorithms.tex#L7229-L7233)) In plain words: it is the first position whose item is not less than the value. `upper_bound` uses the test `!comp(value, e)`, so it is the first position whose item is greater than the value. ([[upper.bound], lines 7276 to 7280](https://github.com/cplusplus/draft/blob/4e4de1df8ee941255b653b61d0a62050b34cf8c9/source/algorithms.tex#L7276-L7280))

For a sorted range, "the number of items less than the value" is the same thing as "the index of the first item not less than the value", so `lower` is also a count. `upper` is the number of items less than or equal to the value. Their difference is the number of copies of the value, which is how you count duplicates with two searches. The C++ standard promises, for each, "at most log2(last - first) + O(1) comparisons". ([lines 7235 to 7237](https://github.com/cplusplus/draft/blob/4e4de1df8ee941255b653b61d0a62050b34cf8c9/source/algorithms.tex#L7235-L7237)) That is a **worst-case** bound, and the same doc line holds for `upper_bound` ([lines 7282 to 7284](https://github.com/cplusplus/draft/blob/4e4de1df8ee941255b653b61d0a62050b34cf8c9/source/algorithms.tex#L7282-L7284)).

GCC's libstdc++ writes it differently from Java and from Go:

```cpp
_DistanceType __len = std::distance(__first, __last);

while (__len > 0)
  {
    _DistanceType __half = __len >> 1;
    _ForwardIterator __middle = __first;
    std::advance(__middle, __half);
    if (__comp(__middle, __val))
      {
        __first = __middle;
        ++__first;
        __len = __len - __half - 1;
      }
    else
      __len = __half;
  }
return __first;
```

([libstdc++ bits/stl_algobase.h, `__lower_bound`, lines 1465 to 1481, GCC 13.2.0](https://github.com/gcc-mirror/gcc/blob/c891d8dc23e1a46ad9f3e757d09e57b500d40044/libstdc%2B%2B-v3/include/bits/stl_algobase.h#L1465-L1481))

It keeps a start and a **length** instead of two ends, so the midpoint is "start plus half the length", and no line adds two positions. There is nothing to overflow, because `__first + __half` never goes past `__last`. (This is a reading of the code, not a claim libstdc++ makes.) The `upper_bound` twin is the same loop with one change: the test is `__comp(__val, __middle)` and its branches are swapped. ([bits/stl_algo.h, `__upper_bound`, lines 2028 to 2044](https://github.com/gcc-mirror/gcc/blob/c891d8dc23e1a46ad9f3e757d09e57b500d40044/libstdc%2B%2B-v3/include/bits/stl_algo.h#L2028-L2044))

## What to take into the Build

Three loops, three ways to hold the range, and one idea: find where a yes/no test changes from false to true. Your Build uses Go's half-open form with the invariant written down. On `lower`, every item before `low` is less than the key and every item from `high` on is not. On `upper`, replace "less than" with "less than or equal to". Each pass sets `high` to `mid` or `low` to `mid + 1`, and either way the range `[low, high)` of size `s` shrinks to at most `s / 2` (rounded down). So a search over `n` items makes at most `floor(log2 n) + 1` passes in the **worst case**.

With duplicates, `lower` and `upper` are well defined where Java's "any match" is not: the first copy, and the position after the last copy.
