# Linux: joining, reversing and sorting without allocating

Moving nodes around is where a linked list earns its keep: when you hold the nodes, you can rearrange them by changing pointers, with no copying and no allocation. This Chapter reads two pieces of Linux 6.6 (commit `ffc2532`) that do it on the ring of Chapter 1, and then reverses a list on its own.

## Joining two lists: four writes

`list_splice` moves every node of one list into another. It does not walk either list. The helper that does the work, `__list_splice`, reads the first and last nodes of the list being moved and ties them to the two neighbours where they will go: ([include/linux/list.h, lines 523 to 535](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L523-L535))

```c
struct list_head *first = list->next;
struct list_head *last = list->prev;

first->prev = prev;
prev->next = first;

last->next = next;
next->prev = last;
```

The whole joined run is stitched in with four writes. Three public functions choose the neighbours. `list_splice` is "join two lists, this is designed for stacks": the moved nodes go right after the head, using `__list_splice(list, head, head->next)`. ([lines 537 to 547](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L537-L547)) `list_splice_tail` is for queues: they go before the head. ([lines 549 to 559](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L549-L559)) Both are guarded with `if (!list_empty(list))`, because an empty list has no first or last node to tie: its `next` and `prev` would be the list's own head. The `_init` variants (`list_splice_init`, `list_splice_tail_init`) then call `INIT_LIST_HEAD(list)`: "The list at @list is reinitialised." ([lines 561 to 592](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L561-L592)) Without that the moved nodes would still be reachable from the old head. The cost is a fixed number of writes whatever the lengths: O(1) in the **worst case**.

## Sorting: drop the second pointer, then rebuild it

`lib/list_sort.c` sorts a ring by merging. The merge step is the interesting part, because of what it ignores. It works on lists in "an intermediate format suited to chaining of merge() calls: null-terminated, no reserved or sentinel head node, 'prev' links not maintained." ([lib/list_sort.c, lines 10 to 14](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/list_sort.c#L10-L14)) That is the singly linked list of Chapter 2. `list_sort` converts to it at the start: "Convert to a null-terminated singly-linked list", with `head->prev->next = NULL;`. ([lines 193 to 194](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/list_sort.c#L193-L194))

The merge keeps a pointer to the place where the next node must be written, starting as `&head`: ([`merge`, lines 15 to 42](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/list_sort.c#L15-L42))

```c
struct list_head *head, **tail = &head;

for (;;) {
	/* if equal, take 'a' -- important for sort stability */
	if (cmp(priv, a, b) <= 0) {
		*tail = a;
		tail = &a->next;
		a = a->next;
		if (!a) {
			*tail = b;
			break;
		}
	} else {
		/* the same, with a and b swapped */
	}
}
```

(This is the `pprev` idea of Chapter 2 again: `tail` is the address of the cell to fill, so the first node needs no special case.) Each step takes whichever of `a` and `b` should come first and appends it; when one list runs out, the rest of the other is attached whole. The comment on the `<=` says why ties take `a`: "important for sort stability", and `list_sort`'s documentation says the comparison is "always called with the element that came first in the input in @a". ([line 22](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/list_sort.c#L22), [lines 107 to 112](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/list_sort.c#L107-L112)) So equal items keep their order. The merge relinks the existing nodes: O(a + b) comparisons in the **worst case** and O(1) extra space.

The `prev` links are rebuilt once, in the last merge, which is a copy of the loop that also writes `prev` and closes the ring. The source gives its reason: "This approach duplicates code from merge(), but runs faster than the tidier alternatives of either a separate final prev-link restoration pass, or maintaining the prev links throughout." ([`merge_final`, lines 44 to 99](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/list_sort.c#L44-L99)) The decision is to do the many pointer writes of a sort on the cheaper structure and pay for the second pointer once.

The order of the merges is its own decision. The comment says the sort "is as eager as possible while always performing at least 2:1 balanced merges", and claims that "it will avoid cache thrashing as long as 3*2^k elements can fit into the cache", using "0.2*n fewer comparisons" than a fully eager bottom-up merge sort. ([lines 129 to 136](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/list_sort.c#L129-L136)) Those are the authors' claims in a source comment; this Chapter does not test them. The Extra Problem uses the simpler order, cutting the list in half until the pieces have one node.

## Reversing: an argument, not a kernel function

Reversing has no source in this Chapter, so what follows is an argument. Walk the singly linked list once, keeping the node you just left. At each node, remember its `next`, point the node at the one you just left, and step on. When the walk ends, the last node is the new first, and the head cell must point at it. Three variables, one pass: O(n) time in the **worst case** and O(1) extra space.

## What the Problems build

The first Problem is `list_splice` and `list_splice_tail` on the ring. The next two work on the singly linked list of Chapter 2: reversing it, and merging two lists that are already sorted. A node of this list has a second cell, at its address plus one, holding its sort key. The Extra Problem sorts a whole list with the merge.
