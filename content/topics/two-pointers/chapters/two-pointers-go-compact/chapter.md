# Go: one pointer reads, one pointer writes

A sequence can be rewritten without a second sequence if one pointer reads ahead and another writes behind it. The write pointer never passes the read pointer, so nothing unread is overwritten. This Chapter reads two pieces of the Go 1.22.0 standard library that work that way: `slices.Compact`, which removes repeated items, and the partition step inside the sort.

## Compact: collapse runs in place

The doc comment on `slices.Compact` reads: "Compact replaces consecutive runs of equal elements with a single copy. This is like the uniq command found on Unix. Compact modifies the contents of the slice s and returns the modified slice, which may have a smaller length." ([src/slices/slices.go, lines 346 to 350](https://github.com/golang/go/blob/go1.22.0/src/slices/slices.go#L346-L350)) The body is:

```go
if len(s) < 2 {
	return s
}
i := 1
for k := 1; k < len(s); k++ {
	if s[k] != s[k-1] {
		if i != k {
			s[i] = s[k]
		}
		i++
	}
}
clear(s[i:]) // zero/nil out the obsolete elements, for GC
return s[:i]
```

([lines 351 to 366](https://github.com/golang/go/blob/go1.22.0/src/slices/slices.go#L351-L366))

`k` is the read pointer and goes through every position once. `i` is the write pointer: the next slot to fill. It starts at 1 because the first item is always kept. When the item under `k` differs from the one before it, a new run has started, so the item is copied to `i` and `i` moves on. When they are equal, `k` moves and `i` does not, so the write pointer falls behind. It can only be at or behind `k`, so a write never lands on an item that has not been read. The guard `i != k` skips copying an item onto itself.

The function compares with `s[k-1]`, so it removes only **consecutive** repeats. That is the contract from the comment ("consecutive runs"), and it is why the Problem gives you sorted input: on a sorted sequence all equal items are consecutive.

After the loop the slice is cut to the first `i` items, and `clear(s[i:])` sets the leftover slots to the zero value. The comment gives the reason: "for GC", so the garbage collector can free what those slots used to point to.

The cost is O(n) time in the **worst case**, one pass with one comparison per item, and O(1) extra space.

## Partition: two pointers from the ends, swapping

`slices.Sort` hands the work to `pdqsortOrdered` ([src/slices/sort.go, lines 16 to 19](https://github.com/golang/go/blob/go1.22.0/src/slices/sort.go#L16-L19)), which the source describes as "based on pattern-defeating quicksort(pdqsort)". ([src/slices/zsortordered.go, line 58](https://github.com/golang/go/blob/go1.22.0/src/slices/zsortordered.go#L58)) Its partition step, in the source's words, "does one quicksort partition." For a slice `data[a:b]` and a chosen pivot, it "moves elements in data[a:b] around, so that data[i]<p and data[j]>=p for i<newpivot and j>newpivot." ([`partitionOrdered`, lines 133 to 136](https://github.com/golang/go/blob/go1.22.0/src/slices/zsortordered.go#L133-L136)) `pdqsortOrdered` calls it. ([line 116](https://github.com/golang/go/blob/go1.22.0/src/slices/zsortordered.go#L116))

The function first swaps the pivot to `data[a]`, sets `i, j := a+1, b-1`, and runs one round of the scan below by itself ([lines 138 to 153](https://github.com/golang/go/blob/go1.22.0/src/slices/zsortordered.go#L138-L153)). Then it loops, with `i` at the left end and `j` at the right end:

```go
for {
	for i <= j && cmp.Less(data[i], data[a]) {
		i++
	}
	for i <= j && !cmp.Less(data[j], data[a]) {
		j--
	}
	if i > j {
		break
	}
	data[i], data[j] = data[j], data[i]
	i++
	j--
}
```

([lines 155 to 168](https://github.com/golang/go/blob/go1.22.0/src/slices/zsortordered.go#L155-L168))

This is the first Chapter's converging pointers with a new rule. The left pointer skips items that already belong on the left (smaller than the pivot). The right pointer skips items that already belong on the right (not smaller). When both stop, each holds an item on the wrong side, so the function swaps them and moves both inward. When the pointers cross, every item left of `i` is smaller than the pivot and every item from `i` on is not. The cost is O(n) in the **worst case**: each pointer only moves toward the other, and the swaps are at most n/2.

Two details of the loop matter. An item equal to the pivot is treated as "not smaller", so it goes to the right side. And the swap is one exchange per pair, not a shift: the partition does not keep the order of the items within a side.

## What the Problems build

The first Problem, `compact`, is the read and write pointers: collapse runs of equal items in a sorted sequence, in place, and say the new length. The second, `partition`, is the loop above, without setting a pivot item aside: you give the pivot as a value and get back where the two sides meet.
