# Binary search: sources

Research for the Topic "binary search" (card C102, issue #255). Every claim about a real system that the four Chapters make is listed with its source. The issue's system names were leads; each was checked against the source.

Tags, resolved to commit SHAs with `git ls-remote` (annotated tags peeled with `^{}`):

| Project | Tag | Commit |
|---|---|---|
| OpenJDK | `jdk-21+35` | `890adb6410dab4606a4f26a942aed02fb2f55387` (tag object `07687d169a5e181789869817f10f3e8a4a4c30a9`) |
| Go | `go1.22.0` | `a10e42f219abb9c5bc4e7d86d9464700a42c7d57` |
| GCC (libstdc++) | `releases/gcc-13.2.0` | `c891d8dc23e1a46ad9f3e757d09e57b500d40044` (tag object `13fb0413b5cc8ae50b074f9d83dea2c801863783`) |
| Git | `v2.45.0` | `786a3e4b8d754d2b14b1208b98eeb0a554ef19a8` (tag object `8be58deda2ccce7d036072ec34439f9fad88204f`) |
| C++ working draft | `n4950` (github.com/cplusplus/draft) | `4e4de1df8ee941255b653b61d0a62050b34cf8c9` |

Method. Files were fetched with `curl -fsSL https://raw.githubusercontent.com/<org>/<repo>/<commit>/<path>` and compared byte for byte with the copy fetched by tag; line numbers were read with `awk 'NR>=a&&NR<=b'`. The Bloch post and the JDK issue were fetched with `curl`, HTML tags stripped with a Python regex. Source types: 1 = source code, 2 = official docs or standard for that version, 3 = paper or design doc, 4 = post by the system's engineers. Links in the Chapters are commit permalinks; the commit is the one in the table, not the tag. N4950 is the C++ committee's working draft, not the published standard, and is cited as "C++ working draft N4950".

## Chapter 1: Java, the midpoint that overflowed (`binary-search-jdk-arrays`)

1. `Arrays.binarySearch(int[], int)` requires a sorted array, else "the results are undefined"; "there is no guarantee which one will be found" for repeats. [Arrays.java L1640-L1646](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Arrays.java#L1640-L1646). Type 1/2. Sourced.
2. The return value: "(-(insertion point) - 1)", insertion point is "the index of the first element greater than the key, or a.length if all elements in the array are less than the specified key", and "the return value will be >= 0 if and only if the key is found". [L1650-L1657](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Arrays.java#L1650-L1657). Type 1/2. Sourced.
3. The loop: `int mid = (low + high) >>> 1;`, `return -(low + 1);  // key not found.` [L1702-L1719](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Arrays.java#L1702-L1719). Type 1. Sourced. The same line appears in every primitive overload (L1155, L1350, L1627, L1708, ...).
4. The bug: Joshua Bloch, "Extra, Extra - Read All About It: Nearly All Binary Searches and Mergesorts are Broken", Google Research blog, 2 June 2006. [Link](https://research.google/blog/extra-extra-read-all-about-it-nearly-all-binary-searches-and-mergesorts-are-broken/). Type 4 (author wrote the JDK method). Quotes used: "The version of binary search that I wrote for the JDK contained the same bug. It was reported to Sun recently when it broke someone's program, after lying in wait for nine years or so."; the broken line `int mid = (low + high) / 2;`; "it fails if the sum of low and high is greater than the maximum positive int value (2^31 - 1). The sum overflows to a negative value, and the value stays negative when divided by two."; "In Java, it throws ArrayIndexOutOfBoundsException"; "can manifest itself for arrays whose length (in elements) is 2^30 or greater"; fixes `int mid = low + ((high - low) / 2);` and `int mid = (low + high) >>> 1;`; the 17 February 2008 update that the C/C++ fix "was not guaranteed to work by the relevant C99 standard". Sourced. In the page the exponents are superscripts; the Chapter writes them with `^`.
5. The bug report: [JDK-6412541](https://bugs.openjdk.org/browse/JDK-6412541), summary "Arrays.binarySearch does not work for arrays larger than 1<<30", created 2006-04-12, resolution Duplicate (from `https://bugs.openjdk.org/rest/api/2/issue/JDK-6412541`). Type 4. Sourced for the title and status; the Chapter makes no claim about the fix.

6. Overflow and division in Java: "If an integer addition overflows, then the result is the low-order bits of the mathematical sum as represented in some sufficiently large two's-complement format." [JLS SE 21, 15.18.2](https://docs.oracle.com/javase/specs/jls/se21/html/jls-15.html#jls-15.18.2); "Integer division rounds toward 0." [JLS SE 21, 15.17.2](https://docs.oracle.com/javase/specs/jls/se21/html/jls-15.html#jls-15.17.2). Type 2. Sourced (fetched with `curl`, tags stripped).

Derived by the Chapter, not sourced (arithmetic or a reading of the code, each marked in the text): the worked wrap-around of 1,500,000,000 + 2,000,000,000; why `>>> 1` is exact for two non-negative ints; the inclusive-range invariant; the `floor(log2 n) + 1` pass count (worst case). The Build's tests check the numbers.

## Chapter 2: Go and C++, one search, many questions (`binary-search-bounds`)

1. `sort.Search` doc: "Search uses binary search to find and return the smallest index i in [0, n) at which f(i) is true, assuming that on the range [0, n), f(i) == true implies f(i+1) == true." [search.go L9-L14](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/sort/search.go#L9-L14). Type 1/2. Sourced.
2. Returns n when nothing is true; "(Note that the "not found" return value is not -1 as in, for instance, strings.Index.)" [L14-L16](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/sort/search.go#L14-L16). Sourced.
3. The `data[i] >= 23` example and "If the caller wants to find whether 23 is in the slice, it must test data[i] == 23 separately." [L25-L29](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/sort/search.go#L25-L29). Sourced.
4. The loop and invariant comments: "Invariant: f(i-1) == false, f(j) == true." [L59-L72](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/sort/search.go#L59-L72); `h := int(uint(i+j) >> 1) // avoid overflow when computing h` [L63](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/sort/search.go#L63). Sourced.
5. C++ `lower_bound`: "The furthermost iterator i in the range [first, last] such that for every iterator j in the range [first, i), bool(invoke(comp, invoke(proj, *j), value)) is true." [algorithms.tex L7229-L7233](https://github.com/cplusplus/draft/blob/4e4de1df8ee941255b653b61d0a62050b34cf8c9/source/algorithms.tex#L7229-L7233). `comp` defaults to `less{}` (L7219). Type 2. Sourced.
6. `upper_bound` is defined with `!bool(invoke(comp, value, invoke(proj, e)))`. [L7276-L7280](https://github.com/cplusplus/draft/blob/4e4de1df8ee941255b653b61d0a62050b34cf8c9/source/algorithms.tex#L7276-L7280). Sourced.
7. Complexity of both: "At most log2(last - first) + O(1) comparisons and projections." [L7235-L7237](https://github.com/cplusplus/draft/blob/4e4de1df8ee941255b653b61d0a62050b34cf8c9/source/algorithms.tex#L7235-L7237), [L7282-L7284](https://github.com/cplusplus/draft/blob/4e4de1df8ee941255b653b61d0a62050b34cf8c9/source/algorithms.tex#L7282-L7284). Sourced.
8. libstdc++ `__lower_bound`: `__len = std::distance`, `__half = __len >> 1`, `__middle = __first; std::advance(__middle, __half)`, `__len = __len - __half - 1` / `__len = __half`. [stl_algobase.h L1465-L1481](https://github.com/gcc-mirror/gcc/blob/c891d8dc23e1a46ad9f3e757d09e57b500d40044/libstdc%2B%2B-v3/include/bits/stl_algobase.h#L1465-L1481). Type 1. Sourced.
9. libstdc++ `__upper_bound`: same loop, test `__comp(__val, __middle)`. [stl_algo.h L2028-L2044](https://github.com/gcc-mirror/gcc/blob/c891d8dc23e1a46ad9f3e757d09e57b500d40044/libstdc%2B%2B-v3/include/bits/stl_algo.h#L2028-L2044). Sourced.

Derived, not sourced: "lower is the count of items less than the key" (follows from item 5 on a sorted range); that libstdc++'s loop never adds two positions (a reading of item 8); the pass count of Go's half-open loop.

## Chapter 3: git bisect, searching for the answer (`binary-search-git-bisect`)

1. "This command uses a binary search algorithm to find which commit in your project's history introduced a bug." ... "picks a commit between those two endpoints and asks you whether the selected commit is "good" or "bad". It continues narrowing down the range until it finds the exact commit that introduced the change." [git-bisect.txt L32-L39](https://github.com/git/git/blob/786a3e4b8d754d2b14b1208b98eeb0a554ef19a8/Documentation/git-bisect.txt#L32-L39). Type 2. Sourced.
2. "can be used to find the commit that changed *any* property of your project". [L41-L46](https://github.com/git/git/blob/786a3e4b8d754d2b14b1208b98eeb0a554ef19a8/Documentation/git-bisect.txt#L41-L46). Sourced.
3. Go's `GuessingGame` example: `sort.Search(100, func(i int) bool { fmt.Printf("Is your number <= %d? ", i) ...`. [search.go L46-L57](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/sort/search.go#L46-L57). Sourced.
4. "Note that there could be more than one "first bad commit" in the commit space we are searching." and "to be as efficient as possible, it tries to perform a binary search." [git-bisect-lk2009.txt L40-L47](https://github.com/git/git/blob/786a3e4b8d754d2b14b1208b98eeb0a554ef19a8/Documentation/git-bisect-lk2009.txt#L40-L47). Type 2 (Christian Couder's article, shipped in Git's Documentation directory). Sourced.
5. `best_bisection` keeps the commit with the largest `min(weight, nr - weight)`. [bisect.c L196-L202](https://github.com/git/git/blob/786a3e4b8d754d2b14b1208b98eeb0a554ef19a8/bisect.c#L196-L202). Type 1. Sourced.
6. "zero or positive weight is the number of interesting commits it can reach, including itself". [bisect.c L265-L267](https://github.com/git/git/blob/786a3e4b8d754d2b14b1208b98eeb0a554ef19a8/bisect.c#L265-L267). Sourced. That `nr` is the number of commits considered is read from `find_bisection` (L411-L434), not quoted.
7. `do_find_bisection` returns a commit at once when `approx_halfway(p, nr)` holds ("Does it happen to be at half-way?"). [bisect.c L340-L343](https://github.com/git/git/blob/786a3e4b8d754d2b14b1208b98eeb0a554ef19a8/bisect.c#L340-L343) (same pattern at L382-L385). Sourced.
8. `approx_halfway`: "For large number of commits we are not so strict, it's good enough if it's within ~0.1% of the halfway point, e.g. 5000 is exactly halfway of 10000, but we consider the values [4996, 5004] as halfway as well." [bisect.c L127-L132](https://github.com/git/git/blob/786a3e4b8d754d2b14b1208b98eeb0a554ef19a8/bisect.c#L127-L132). Sourced.

Derived, not sourced: that on a straight line `best_bisection` picks the middle commit; the Build's `ceil(log2 N)` worst-case test count (checked by the Problem's tests); the Problem "Slowest rate that finishes in time", which is original and says in the Chapter that it is not from Git's code.

## Chapter 4: C++, partitioned not sorted (`binary-search-partitioned`)

1. "A sequence [start, finish) is partitioned with respect to an expression f(e) if there exists an integer n such that for all 0 <= i < (finish - start), f(*(start + i)) is true if and only if i < n." [algorithms.tex L6636-L6640](https://github.com/cplusplus/draft/blob/4e4de1df8ee941255b653b61d0a62050b34cf8c9/source/algorithms.tex#L6636-L6640), under `[alg.sorting.general]`. Type 2. Sourced.
2. "All of the algorithms in [alg.binary.search] are versions of binary search and assume that the sequence being searched is partitioned with respect to an expression formed by binding the search key to an argument of the comparison function." [L7181-L7184](https://github.com/cplusplus/draft/blob/4e4de1df8ee941255b653b61d0a62050b34cf8c9/source/algorithms.tex#L7181-L7184). Sourced.
3. `partition_point`: Expects "partitioned with respect to E(e)", Returns "an iterator mid such that E(*i) is true for all iterators i in [first, mid), and false for all iterators i in [mid, last)", Complexity "O(log(last - first)) applications of pred and proj." [L7673-L7688](https://github.com/cplusplus/draft/blob/4e4de1df8ee941255b653b61d0a62050b34cf8c9/source/algorithms.tex#L7673-L7688), under `[alg.partitions]`. Sourced.
4. libstdc++ `partition_point` is the halving loop with `__pred(*__middle)`. [stl_algo.h L572-L588](https://github.com/gcc-mirror/gcc/blob/c891d8dc23e1a46ad9f3e757d09e57b500d40044/libstdc%2B%2B-v3/include/bits/stl_algo.h#L572-L588). Type 1. Sourced.

Derived, not sourced and marked as such in the text: that a rotated strictly increasing array is partitioned by `e >= first`; that repeats break it; the index shift `(p + start) % n`. None of the C++ sources talks about rotated arrays.

## Claims cut for want of a source

- The issue's lead "Binary search on the answer" had no named system. It is told through `git bisect` and Go's `sort.Search` doc example instead.
- The issue's lead for Chapter 4 had no system. The Chapter reads the C++ standard's choice of "partitioned" as the precondition, and applies it to rotated arrays in its own words.
- Candidate Problems not built: "Search a 2D Matrix" and "Median of Two Sorted Arrays". Neither fits the command-line Build without a new input format, and no system in the four Chapters motivates them.
