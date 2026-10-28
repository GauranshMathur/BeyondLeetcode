# Go: a heap built in one pass

Go's standard library has a heap too, in the package `container/heap`. This Chapter reads it in Go 1.22.0 and sets it beside `heapq`. In the Problem you build a heap from all its keys at once, the way both libraries do.

## A heap for any slice

The package comment says what it means by a heap: "A heap is a tree with the property that each node is the minimum-valued node in its subtree." It adds where the smallest item is: "The minimum element in the tree is the root, at index 0." ([src/container/heap/heap.go, lines 6 to 9](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/container/heap/heap.go#L6-L9))

The package never touches your slice. You write the methods on your own type, and the package's functions call them (`h.Len`, `h.Less` and `h.Swap` in the code below). The interface is:

```go
type Interface interface {
	sort.Interface
	Push(x any) // add x as element Len()
	Pop() any   // remove and return element Len() - 1.
}
```

([src/container/heap/heap.go, lines 31 to 35](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/container/heap/heap.go#L31-L35)) The rule the methods must produce is written as a formula: "!h.Less(j, i) for 0 <= i < h.Len() and 2*i+1 <= j <= 2*i+2 and j < h.Len()" ([src/container/heap/heap.go, line 26](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/container/heap/heap.go#L26)) It says that the children of `i` are `2i+1` and `2i+2`, the same layout as `heapq`'s.

## Down: stop early

Moving an item down is a function named `down`:

```go
func down(h Interface, i0, n int) bool {
	i := i0
	for {
		j1 := 2*i + 1
		if j1 >= n || j1 < 0 { // j1 < 0 after int overflow
			break
		}
		j := j1 // left child
		if j2 := j1 + 1; j2 < n && h.Less(j2, j1) {
			j = j2 // = 2*i + 2  // right child
		}
		if !h.Less(j, i) {
			break
		}
		h.Swap(i, j)
		i = j
	}
	return i > i0
}
```

([src/container/heap/heap.go, lines 100 to 118](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/container/heap/heap.go#L100-L118)) It takes the smaller of the two children (`h.Less(j2, j1)`), stops if the item is not larger than it (`!h.Less(j, i)`), and swaps otherwise. That is the shape that the comment in `heapq` describes: "We *could* break out of the loop as soon as we find a pos where newitem <= both its children, but turns out that's not a good idea, and despite that many books write the algorithm that way." ([Lib/heapq.py, lines 226 to 228](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/heapq.py#L226-L228)) Go stops as soon as it can; `heapq` does not. A row of this loop costs at most 2 comparisons, one between the children and one against the item (arithmetic on the lines above).

## Init: heapify

Say you already have all the keys in a slice. `Init` makes it a heap:

```go
// Init establishes the heap invariants required by the other routines in this package.
// Init is idempotent with respect to the heap invariants
// and may be called whenever the heap invariants may have been invalidated.
// The complexity is O(n) where n = h.Len().
func Init(h Interface) {
	// heapify
	n := h.Len()
	for i := n/2 - 1; i >= 0; i-- {
		down(h, i, n)
	}
}
```

([src/container/heap/heap.go, lines 37 to 47](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/container/heap/heap.go#L37-L47)) It runs `down` on every item that has a child, from the last of them back to index 0. The comment states the cost: "The complexity is O(n) where n = h.Len()." ([src/container/heap/heap.go, line 40](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/container/heap/heap.go#L40)) CPython's `heapify` is the same loop, `for i in reversed(range(n//2))`:

```python
def heapify(x):
    """Transform list into a heap, in-place, in O(len(x)) time."""
    n = len(x)
    # Transform bottom-up.  The largest index there's any point to looking at
    # is the largest with a child index in-range, so must have 2*i + 1 < n,
    # or i < (n-1)/2.  If n is even = 2*j, this is (2*j-1)/2 = j-1/2 so
    # j-1 is the largest, which is n//2 - 1.  If n is odd = 2*j+1, this is
    # (2*j+1-1)/2 = j so j-1 is the largest, and that's again n//2-1.
    for i in reversed(range(n//2)):
        _siftup(x, i)
```

([Lib/heapq.py, lines 170 to 179](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/heapq.py#L170-L179)) Its docstring says: "Transform list into a heap, in-place, in O(len(x)) time." ([Lib/heapq.py, line 171](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/heapq.py#L171))

Why is it linear? Item `i` has a child only when `2i + 1 < n`, so the loop starts at `n/2 - 1` and the leaves, about half of the items, cost nothing. The rest move down at most as many rows as lie between them and a leaf, which is the item's height. About `n / 2^(h+1)` items have height `h`, and adding up `h × n / 2^(h+1)` over all heights gives `n`, rounding aside. So `Init` moves items down about `n` rows in total at most, and with at most 2 comparisons a row it is O(n) comparisons in the **worst case**. This is the standard argument, and it is arithmetic, not something the source says.

Pushing the same `n` keys one by one costs more. If they arrive from largest to smallest, every push climbs to the root, which is O(log n) each and O(n log n) in the **worst case** for all of them. The `heapq` comment measured it for 1000 random items: "Building the heap by using heappush() 1000 times instead required 2198, 2148, and 2219 compares:  heapify() is more efficient, when you can use it." ([Lib/heapq.py, lines 251 to 253](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/heapq.py#L251-L253)) Its table has heapify under the heading "Compares needed by heapify" with "1837 cut to 1663" on the first row. ([Lib/heapq.py, lines 245 to 247](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/heapq.py#L245-L247)) Your Build lets you see the difference in the `cmp` counter.

## Pop and Remove: swap with the last

The same package removes the smallest item, or any item by index, by moving the last item into the gap:

```go
// Pop removes and returns the minimum element (according to Less) from the heap.
// The complexity is O(log n) where n = h.Len().
// Pop is equivalent to [Remove](h, 0).
func Pop(h Interface) any {
	n := h.Len() - 1
	h.Swap(0, n)
	down(h, 0, n)
	return h.Pop()
}

// Remove removes and returns the element at index i from the heap.
// The complexity is O(log n) where n = h.Len().
func Remove(h Interface, i int) any {
	n := h.Len() - 1
	if n != i {
		h.Swap(i, n)
		if !down(h, i, n) {
			up(h, i)
		}
	}
	return h.Pop()
}
```

([src/container/heap/heap.go, lines 56 to 77](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/container/heap/heap.go#L56-L77)) `Pop` swaps the first and the last item, moves the first down within the shortened heap, and takes the old first off the end. `Remove(h, i)` does the same at index `i`, with one more step: the item that comes from the end can be smaller than its new parent as well as larger than its new children, so if it did not move down, `down` returns false and `up` tries the other direction. The comment gives the cost: "Remove removes and returns the element at index i from the heap. The complexity is O(log n) where n = h.Len()." ([src/container/heap/heap.go, lines 66 to 67](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/container/heap/heap.go#L66-L67)) Chapter 5 uses `Remove` and `Fix` on timers.

## What the Problem builds

Problem 3 adds `init K1 K2 ... Kn`: put the keys in the array as given, then repair it from index `n/2 - 1` down to 0. It moves items down the way `pop` does in your Build, going to a leaf first as `heapq` does, so that `cmp` stays comparable with Problem 2.
