# Go regexp: sort the ranges, then merge

A regular expression can say `[a-zA-Z0-9_]`: any character from a list of ranges. Before Go's regexp package can use such a class, its parser has to turn what was typed into a clean list: ranges in order, none overlapping, none touching. This Chapter reads how the parser does that, in `regexp/syntax/parse.go` ([parse.go, lines 1832 to 1862](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/regexp/syntax/parse.go#L1832-L1862)) at the commit of Go 1.22.0 (`a10e42f219abb9c5bc4e7d86d9464700a42c7d57`). In the Problems you build the same step on intervals of whole numbers. An interval `lo-hi` holds every whole number from `lo` to `hi`, both ends included.

## Two ways to collect ranges

While it reads a class, the parser adds each range it meets with `appendRange` ([parse.go, lines 1813 to 1817](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/regexp/syntax/parse.go#L1813-L1817)). The comment says what that does: "Expand last range or next to last range if it overlaps or abuts." ([parse.go, line 1890](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/regexp/syntax/parse.go#L1890)) It looks back at only two ranges, and the comment gives the reason: "Checking two ranges helps when appending case-folded alphabets, so that one range can be expanding A-Z and the other expanding a-z." ([parse.go, lines 1891 to 1893](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/regexp/syntax/parse.go#L1891-L1893))

That is a cheap, local merge, and it cannot be the whole job. Trace the code in [parse.go, lines 1889 to 1911](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/regexp/syntax/parse.go#L1889-L1911) on the ranges `x-z`, `a-c` and `b-y`, added in that order. `x-z` goes in. `a-c` does not touch the last range `x-z`, so it is appended. `b-y` touches the last range `a-c`, so that one grows to `a-y` and the function returns. The range `x-z` is still there, and it overlaps `a-y`. (This is the Chapter's own reading of the code, not a claim the source makes.) After the last range of a class has been read, the parser calls `cleanClass`: `class = cleanClass(&re.Rune)` ([parse.go, line 1823](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/regexp/syntax/parse.go#L1823)).

## Sort first, then one pass

The comment on `cleanClass` says what it does: "cleanClass sorts the ranges (pairs of elements of r), merges them, and eliminates duplicates." ([parse.go, lines 1832 to 1833](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/regexp/syntax/parse.go#L1832-L1833)) The sort comes first, with its rule for ties: "Sort by lo increasing, hi decreasing to break ties." ([parse.go, line 1836](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/regexp/syntax/parse.go#L1836)) Then a single loop merges, and the comment above it names the two cases: "Merge abutting, overlapping." ([parse.go, line 1844](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/regexp/syntax/parse.go#L1844))

```go
	w := 2 // write index
	for i := 2; i < len(r); i += 2 {
		lo, hi := r[i], r[i+1]
		if lo <= r[w-1]+1 {
			// merge with previous range
			if hi > r[w-1] {
				r[w-1] = hi
			}
			continue
		}
		// new disjoint range
		r[w] = lo
		r[w+1] = hi
		w += 2
	}
```

([parse.go, lines 1845 to 1859](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/regexp/syntax/parse.go#L1845-L1859)) Here `r` holds the ranges as pairs `lo, hi`, `w` is where the next kept range goes, and `r[w-1]` is the end of the last range kept. The test `lo <= r[w-1]+1` is true when the new range starts at or before the number right after the last range's end. That covers an overlap, and it covers ranges that only abut: `a-c` and `d-f` leave no character between them, so they become `a-f`. For whole-number intervals, `3-5` and `6-8` become `3-8`.

Why can one comparison with the last kept range be enough? The ranges arrive in order of `lo`, so a new range never starts before the last kept range starts. Every earlier kept range ended with a gap before the last kept range began, or the loop would have merged them. So a new range that does not touch the last kept range touches nothing at all. And if it does touch it, only the end of the kept range can change. The loop never has to take a merge back. That is the same kind of choice, made now and never undone, as in [CPython: the biggest block that fits](/chapters/greedy-cidr), and the sort is what makes it safe. (The argument is the Chapter's own.)

**Cost.** `cleanClass` calls `sort.Sort` ([parse.go, line 1837](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/regexp/syntax/parse.go#L1837)), whose documentation says: "It makes one call to data.Len to determine n and O(n*log(n)) calls to data.Less and data.Swap." ([sort.go, lines 40 to 41](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/sort/sort.go#L40-L41)) The merging pass is O(n). So cleaning n ranges is O(n log n) in the **worst case**. The pass writes the kept ranges back into the slice it was given (`r[w] = lo`), so it needs no second slice. The Reference Code in the Problems builds a new list instead, so its extra space is O(n).

## What a clean list buys

The parser cleans the list once because other code relies on the result. The lookup says so in its comment: "It assumes the class has been cleaned by cleanClass." ([parse.go, line 1865](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/regexp/syntax/parse.go#L1865)) It searches with `sort.Find` ([parse.go, line 1867](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/regexp/syntax/parse.go#L1867)), which is documented this way: "Find uses binary search to find and return the smallest index i in \[0, n) at which cmp(i) <= 0." ([search.go, lines 75 to 76](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/sort/search.go#L75-L76)) Binary search needs a list in order, and on a clean list one comparison says whether a character lies left of a range, inside it or right of it. Each step throws away half of the ranges that are left, so a lookup is O(log n) in the **worst case**. (The cost is the Chapter's own analysis.)

Negating a class works because of the same assumption. Its comments say: "negateClass overwrites r and returns r's negation." and "It assumes the class r is already clean." ([parse.go, lines 2055 to 2056](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/regexp/syntax/parse.go#L2055-L2056))

```go
	for i := 0; i < len(r); i += 2 {
		lo, hi := r[i], r[i+1]
		if nextLo <= lo-1 {
			r[w] = nextLo
			r[w+1] = lo - 1
			w += 2
		}
		nextLo = hi + 1
	}
```

([parse.go, lines 2060 to 2068](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/regexp/syntax/parse.go#L2060-L2068)) `nextLo` is the first number that no range seen so far has taken. A range starting at `lo` leaves a gap from `nextLo` to `lo-1`, unless `nextLo <= lo-1` is false, which is when the ranges abut. Then `nextLo` moves past the range. The numbers that are left after the last range need one more range, and the code says so: "It's possible for the negation to have one more range - this one - than the original class" ([parse.go, lines 2071 to 2072](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/regexp/syntax/parse.go#L2071-L2072)). The gaps of a clean list are exactly the pieces between its neighbours. On a list that was not cleaned, ranges that overlap would make this loop produce wrong gaps. (This last sentence is the Chapter's own reasoning about the code.)

## What the Problems build

You start one program that reads commands on stdin and writes to stdout, and you keep growing it through the Topic. Here intervals are whole numbers, `0 <= lo <= hi <= 1000000000`. `add lo hi` stores an interval and `merged` prints the clean list, as `cleanClass` would leave it. The Extra Problem `gaps` is the negation step on a window of numbers.
