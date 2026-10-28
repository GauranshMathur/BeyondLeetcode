# CPython: a heap in a plain list

A priority queue answers one question again and again: which item comes next? A heap gives up the full sorted order and keeps just enough of it to know the smallest item. This Chapter reads how CPython 3.13.0 does that in its `heapq` module. In the Problems you build the same queue, and count what its choices cost.

## The heap is the list

CPython's module has no heap type. Its usage notes start with `heap = []`, which "creates an empty heap" ([Lib/heapq.py, line 10](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/heapq.py#L10)) A heap is a list that follows one rule, and the file states it at the top: "Heaps are arrays for which a[k] <= a[2*k+1] and a[k] <= a[2*k+2] for all k, counting elements from 0." ([Lib/heapq.py, lines 3 to 4](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/heapq.py#L3-L4)) Read it as a tree laid out in rows: item `k` sits above items `2k+1` and `2k+2`, and so the parent of a position `p` above 0 is `(p - 1) // 2` (arithmetic on that rule). Nothing stores the tree. There are no pointers, only index arithmetic.

The rule gives one fact for free: "The interesting property of a heap is that a[0] is always its smallest element." ([Lib/heapq.py, lines 5 to 6](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/heapq.py#L5-L6)) Looking at the smallest item is a read of index 0, O(1) in the **worst case**. The module keeps the heap a plain list on purpose, and says why: "heap[0] is the smallest item, and heap.sort() maintains the heap invariant!" ([Lib/heapq.py, lines 29 to 30](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/heapq.py#L29-L30))

## Push: add at the end, move up

To add an item, `heappush` appends it to the list and then fixes the one place the rule may now be broken, the new item against its parent:

```python
def heappush(heap, item):
    """Push item onto heap, maintaining the heap invariant."""
    heap.append(item)
    _siftdown(heap, 0, len(heap)-1)
```

([Lib/heapq.py, lines 132 to 135](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/heapq.py#L132-L135)) The fixing function is below. It starts at the new item and, as long as the item is smaller than its parent, moves the parent down and climbs one row:

```python
def _siftdown(heap, startpos, pos):
    newitem = heap[pos]
    # Follow the path to the root, moving parents down until finding a place
    # newitem fits.
    while pos > startpos:
        parentpos = (pos - 1) >> 1
        parent = heap[parentpos]
        if newitem < parent:
            heap[pos] = parent
            pos = parentpos
            continue
        break
    heap[pos] = newitem
```

([Lib/heapq.py, lines 207 to 219](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/heapq.py#L207-L219)) The name is the other way round from what you may expect: this function moves an item up toward the root, as its own comment says: "Follow the path to the root, moving parents down until finding a place newitem fits." ([Lib/heapq.py, lines 209 to 210](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/heapq.py#L209-L210)) This Chapter says "sift up" for a move toward the root and "sift down" for a move toward the leaves.

The climb makes one comparison per row and a heap of `n` items has at most ⌊log2 n⌋ rows above the last one, so a push costs O(log n) comparisons in the **worst case**. The `append` inside it is amortised O(1), the growth rule you read in the Dynamic arrays Topic.

## Pop: the last item goes to the root

Removing the smallest item leaves a hole at index 0. `heappop` fills it with the last item of the list, so the list stays one slot shorter without a gap, and then lets that item find its place:

```python
def heappop(heap):
    """Pop the smallest item off the heap, maintaining the heap invariant."""
    lastelt = heap.pop()    # raises appropriate IndexError if heap is empty
    if heap:
        returnitem = heap[0]
        heap[0] = lastelt
        _siftup(heap, 0)
        return returnitem
    return lastelt
```

([Lib/heapq.py, lines 137 to 145](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/heapq.py#L137-L145)) The documentation describes the same idea: "move some loser (let’s say cell 30 in the diagram above) into the 0 position, and then percolate this new 0 down the tree, exchanging values, until the invariant is re-established. This is clearly logarithmic on the total number of items in the tree." ([heapq documentation, Theory](https://docs.python.org/3.13/library/heapq.html#theory))

## Go to the leaf first

The textbook way to let the item sink compares it with its smaller child and stops as soon as it is not larger. `heapq` does something else:

```python
def _siftup(heap, pos):
    endpos = len(heap)
    startpos = pos
    newitem = heap[pos]
    # Bubble up the smaller child until hitting a leaf.
    childpos = 2*pos + 1    # leftmost child position
    while childpos < endpos:
        # Set childpos to index of smaller child.
        rightpos = childpos + 1
        if rightpos < endpos and not heap[childpos] < heap[rightpos]:
            childpos = rightpos
        # Move the smaller child up.
        heap[pos] = heap[childpos]
        pos = childpos
        childpos = 2*pos + 1
    # The leaf at pos is empty now.  Put newitem there, and bubble it up
    # to its final resting place (by sifting its parents down).
    heap[pos] = newitem
    _siftdown(heap, startpos, pos)
```

([Lib/heapq.py, lines 260 to 278](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/heapq.py#L260-L278)) It moves the smaller child up, over and over, all the way to a leaf, puts the item in the hole and then sifts it up from there. The comment above the function explains the choice: "We *could* break out of the loop as soon as we find a pos where newitem <= both its children, but turns out that's not a good idea, and despite that many books write the algorithm that way." ([Lib/heapq.py, lines 226 to 228](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/heapq.py#L226-L228)) The reason follows right after: "During a heap pop, the last array element is sifted in, and that tends to be large, so that comparing it against values starting from the root usually doesn't pay (= usually doesn't get us out of the loop early)." ([Lib/heapq.py, lines 228 to 231](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/heapq.py#L228-L231))

Count it on a heap of 7 items, `1 3 2 7 4 5 6`, after a pop (worked by hand). The last item, 6, goes to the root. The textbook way compares the two children (3 and 2), then 6 with 2, moves 2 up, and at the next row compares 6 with its only child 5: 3 comparisons. `heapq`'s way compares 3 with 2 and moves 2 up, moves 5 up without a comparison because it is the only child, puts 6 in the leaf and compares it with its new parent 5: 2 comparisons. Both end with `2 3 5 7 4 6`. Your Build prints this count as `cmp`: 6 pushes plus 2 is 8.

Why count comparisons at all? The same comment answers: "Comparisons are thus potentially expensive." ([Lib/heapq.py, lines 237 to 238](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/heapq.py#L237-L238)) A comparison may run code you wrote. The comment measured the saving on random arrays of 1000 items: "On random arrays of length 1000, making this change cut the number of comparisons made by heapify() a little, and those made by exhaustive heappop() a lot, in accord with theory." Its table, under the heading "Compares needed by 1000 heappops", has "14996 cut to 8680" on its first row. ([Lib/heapq.py, lines 240 to 247](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/heapq.py#L240-L247)) In the **worst case** a pop is still O(log n) either way, since the walk down and the walk back up are each at most ⌊log2 n⌋ rows; the saving is in the typical case, not the bound.

## Equal keys

Two items with the same key have no order, so which one leaves first is not decided by the heap. The documentation names this as a challenge: "Sort stability: how do you get two tasks with equal priorities to be returned in the order they were originally added?" ([heapq documentation, Priority Queue Implementation Notes](https://docs.python.org/3.13/library/heapq.html#priority-queue-implementation-notes)) And it gives the fix it uses: "The entry count serves as a tie-breaker so that two tasks with the same priority are returned in the order they were added." ([heapq documentation, Priority Queue Implementation Notes](https://docs.python.org/3.13/library/heapq.html#priority-queue-implementation-notes)) Your Build does the same. Each item gets a **ticket**, the number of pushes before it, and items compare by key first and ticket second. Then no two items are equal, and every correct heap holds the same items in the same places.

## What the Problems build

The Build is a priority queue that reads commands. Problem 1 adds `push`, `pop`, `peek`, `size` and `show` (the array, in order). Problem 2 adds `cmp` and makes `pop` go to the leaf first, so you can measure what you just read.
