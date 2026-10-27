# Human review queue

`docs/content-standards.md` holds every claim a learner reads to a primary source that a person has opened and checked. Agents draft content and list every link it cites here. A person opens each one, confirms it says what the sentence says for the version named, and ticks it.

Each Topic has its own section, written by its card. Agents add entries only to their own Topic's section, never to another's.

One line per cited link, grouped by Chapter:

```
- [ ] [what the link is](https://pinned/permalink) · chapters/<chapter-id>/chapter.md: the claim it supports
```

A link that doesn't hold up gets a note under its line, and the claim goes back to `[NEEDS SOURCE]`.

## Hash tables

## Two pointers

## Binary search

- [ ] [Arrays.java, lines 1640 to 1646, OpenJDK jdk-21+35 (src/java.base/share/classes/java/util/Arrays.java)](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Arrays.java#L1640-L1646) · chapters/binary-search-jdk-arrays/chapter.md: Arrays.binarySearch requires a sorted array; results are undefined otherwise
- [ ] [Arrays.java, lines 1650 to 1657, OpenJDK jdk-21+35 (src/java.base/share/classes/java/util/Arrays.java)](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Arrays.java#L1650-L1657) · chapters/binary-search-jdk-arrays/chapter.md: a miss returns -(insertion point) - 1, and the insertion point is the index of the first greater element
- [ ] [Arrays.java, lines 1644 to 1646, OpenJDK jdk-21+35 (src/java.base/share/classes/java/util/Arrays.java)](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Arrays.java#L1644-L1646) · chapters/binary-search-jdk-arrays/chapter.md: with duplicates, no guarantee which match is found
- [ ] [Arrays.java, lines 1702 to 1719, OpenJDK jdk-21+35 (src/java.base/share/classes/java/util/Arrays.java)](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Arrays.java#L1702-L1719) · chapters/binary-search-jdk-arrays/chapter.md: the loop in binarySearch0 (inclusive low/high, mid by unsigned shift, -(low + 1) on a miss)
- [ ] [Extra, Extra - Read All About It: Nearly All Binary Searches and Mergesorts are Broken, Google Research blog, 2 June 2006](https://research.google/blog/extra-extra-read-all-about-it-nearly-all-binary-searches-and-mergesorts-are-broken/) · chapters/binary-search-jdk-arrays/chapter.md: Bloch: the same midpoint bug sat in the JDK for about nine years; the overflow, the fixes, and the 2008 C99 note
- [ ] [JDK-6412541](https://bugs.openjdk.org/browse/JDK-6412541) · chapters/binary-search-jdk-arrays/chapter.md: the bug report JDK-6412541 (closed as a duplicate)
- [ ] [search.go, lines 9 to 14, Go 1.22.0 (src/sort/search.go)](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/sort/search.go#L9-L14) · chapters/binary-search-bounds/chapter.md: sort.Search returns the smallest index at which f is true, given f is false then true
- [ ] [search.go, lines 14 to 16, Go 1.22.0 (src/sort/search.go)](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/sort/search.go#L14-L16) · chapters/binary-search-bounds/chapter.md: sort.Search returns n, not -1, when nothing is true
- [ ] [search.go, lines 25 to 29, Go 1.22.0 (src/sort/search.go)](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/sort/search.go#L25-L29) · chapters/binary-search-bounds/chapter.md: searching a sorted slice with data[i] >= x, and testing equality separately
- [ ] [search.go, lines 59 to 72, Go 1.22.0 (src/sort/search.go)](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/sort/search.go#L59-L72) · chapters/binary-search-bounds/chapter.md: sort.Search's loop and its invariant comments
- [ ] [search.go, line 63, Go 1.22.0 (src/sort/search.go)](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/sort/search.go#L63) · chapters/binary-search-bounds/chapter.md: line 63 of sort.Search: the unsigned shift that avoids overflow when computing h
- [ ] [algorithms.tex, lines 7229 to 7233, C++ working draft N4950 (source/algorithms.tex)](https://github.com/cplusplus/draft/blob/4e4de1df8ee941255b653b61d0a62050b34cf8c9/source/algorithms.tex#L7229-L7233) · chapters/binary-search-bounds/chapter.md: C++ lower_bound returns the furthermost iterator before which every item is less than the value
- [ ] [algorithms.tex, lines 7276 to 7280, C++ working draft N4950 (source/algorithms.tex)](https://github.com/cplusplus/draft/blob/4e4de1df8ee941255b653b61d0a62050b34cf8c9/source/algorithms.tex#L7276-L7280) · chapters/binary-search-bounds/chapter.md: C++ upper_bound is defined by the test !comp(value, e)
- [ ] [algorithms.tex, lines 7235 to 7237, C++ working draft N4950 (source/algorithms.tex)](https://github.com/cplusplus/draft/blob/4e4de1df8ee941255b653b61d0a62050b34cf8c9/source/algorithms.tex#L7235-L7237) · chapters/binary-search-bounds/chapter.md: lower_bound makes at most log2(last - first) + O(1) comparisons
- [ ] [algorithms.tex, lines 7282 to 7284, C++ working draft N4950 (source/algorithms.tex)](https://github.com/cplusplus/draft/blob/4e4de1df8ee941255b653b61d0a62050b34cf8c9/source/algorithms.tex#L7282-L7284) · chapters/binary-search-bounds/chapter.md: the same complexity bound for upper_bound
- [ ] [stl_algobase.h, lines 1465 to 1481, GCC 13.2.0 (libstdc++-v3/include/bits/stl_algobase.h)](https://github.com/gcc-mirror/gcc/blob/c891d8dc23e1a46ad9f3e757d09e57b500d40044/libstdc%2B%2B-v3/include/bits/stl_algobase.h#L1465-L1481) · chapters/binary-search-bounds/chapter.md: libstdc++ __lower_bound keeps a start and a length and halves the length
- [ ] [stl_algo.h, lines 2028 to 2044, GCC 13.2.0 (libstdc++-v3/include/bits/stl_algo.h)](https://github.com/gcc-mirror/gcc/blob/c891d8dc23e1a46ad9f3e757d09e57b500d40044/libstdc%2B%2B-v3/include/bits/stl_algo.h#L2028-L2044) · chapters/binary-search-bounds/chapter.md: libstdc++ __upper_bound is the same loop with the comparison arguments swapped
- [ ] [git-bisect.txt, lines 32 to 39, Git 2.45.0 (Documentation/git-bisect.txt)](https://github.com/git/git/blob/786a3e4b8d754d2b14b1208b98eeb0a554ef19a8/Documentation/git-bisect.txt#L32-L39) · chapters/binary-search-git-bisect/chapter.md: git bisect uses a binary search to find the commit that introduced a bug
- [ ] [git-bisect.txt, lines 41 to 46, Git 2.45.0 (Documentation/git-bisect.txt)](https://github.com/git/git/blob/786a3e4b8d754d2b14b1208b98eeb0a554ef19a8/Documentation/git-bisect.txt#L41-L46) · chapters/binary-search-git-bisect/chapter.md: git bisect can find the commit that changed any property
- [ ] [search.go, lines 46 to 57, Go 1.22.0 (src/sort/search.go)](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/sort/search.go#L46-L57) · chapters/binary-search-git-bisect/chapter.md: sort.Search's GuessingGame example searches with a test and no data
- [ ] [git-bisect-lk2009.txt, lines 40 to 47, Git 2.45.0 (Documentation/git-bisect-lk2009.txt)](https://github.com/git/git/blob/786a3e4b8d754d2b14b1208b98eeb0a554ef19a8/Documentation/git-bisect-lk2009.txt#L40-L47) · chapters/binary-search-git-bisect/chapter.md: there could be more than one first bad commit
- [ ] [bisect.c, lines 196 to 202, Git 2.45.0 (bisect.c)](https://github.com/git/git/blob/786a3e4b8d754d2b14b1208b98eeb0a554ef19a8/bisect.c#L196-L202) · chapters/binary-search-git-bisect/chapter.md: best_bisection picks the commit whose smaller side is largest
- [ ] [bisect.c, lines 265 to 267, Git 2.45.0 (bisect.c)](https://github.com/git/git/blob/786a3e4b8d754d2b14b1208b98eeb0a554ef19a8/bisect.c#L265-L267) · chapters/binary-search-git-bisect/chapter.md: weight is the number of interesting commits a commit can reach, including itself
- [ ] [bisect.c, lines 340 to 343, Git 2.45.0 (bisect.c)](https://github.com/git/git/blob/786a3e4b8d754d2b14b1208b98eeb0a554ef19a8/bisect.c#L340-L343) · chapters/binary-search-git-bisect/chapter.md: Git returns a commit at once when it is approximately halfway
- [ ] [bisect.c, lines 127 to 132, Git 2.45.0 (bisect.c)](https://github.com/git/git/blob/786a3e4b8d754d2b14b1208b98eeb0a554ef19a8/bisect.c#L127-L132) · chapters/binary-search-git-bisect/chapter.md: approx_halfway accepts a commit within about 0.1% of the middle
- [ ] [algorithms.tex, lines 6636 to 6640, C++ working draft N4950 (source/algorithms.tex)](https://github.com/cplusplus/draft/blob/4e4de1df8ee941255b653b61d0a62050b34cf8c9/source/algorithms.tex#L6636-L6640) · chapters/binary-search-partitioned/chapter.md: the standard's definition of a sequence partitioned with respect to an expression
- [ ] [algorithms.tex, lines 7181 to 7184, C++ working draft N4950 (source/algorithms.tex)](https://github.com/cplusplus/draft/blob/4e4de1df8ee941255b653b61d0a62050b34cf8c9/source/algorithms.tex#L7181-L7184) · chapters/binary-search-partitioned/chapter.md: the binary search algorithms assume the sequence is partitioned, not sorted
- [ ] [algorithms.tex, lines 7673 to 7688, C++ working draft N4950 (source/algorithms.tex)](https://github.com/cplusplus/draft/blob/4e4de1df8ee941255b653b61d0a62050b34cf8c9/source/algorithms.tex#L7673-L7688) · chapters/binary-search-partitioned/chapter.md: partition_point's precondition, result and O(log) complexity
- [ ] [stl_algo.h, lines 572 to 588, GCC 13.2.0 (libstdc++-v3/include/bits/stl_algo.h)](https://github.com/gcc-mirror/gcc/blob/c891d8dc23e1a46ad9f3e757d09e57b500d40044/libstdc%2B%2B-v3/include/bits/stl_algo.h#L572-L588) · chapters/binary-search-partitioned/chapter.md: libstdc++ partition_point is the same halving loop with a predicate

## Stacks

## Sliding window

## Linked lists
