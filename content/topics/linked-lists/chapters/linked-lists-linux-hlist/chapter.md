# Linux: a list head with one pointer

A list can be singly linked, with one pointer per node, or doubly linked, with two. The last Chapter read the doubly linked ring. This one reads what Linux 6.6 (commit `ffc2532`) does in between, in the same `include/linux/list.h`, for one use: the chains of a hash table. The [Hash tables Topic](/chapters/hash-tables-java-hashmap) chains the keys of one bin in a list; the kernel's header names the same use.

## What a singly linked list cannot do cheaply

Take a list where each node has only a `next` pointer. To remove a node you must make the *previous* node's `next` skip it, and the node does not know its previous node. You find it by walking from the head. If the node is the first, nothing is walked; if it is the k-th, k - 1 nodes are stepped over; if it is not in the list at all, the whole list is. So an unlink costs O(1) at the front and O(n) in the **worst case**. This is an argument from the layout, not a claim about any one system. Doubly linked nodes, as in the last Chapter, avoid the walk because each node holds its previous node.

## What the kernel did about the cost of two pointers

The price of the second pointer is paid for every node, and also for every head. The kernel's header says where that matters: "Double linked lists with a single pointer list head. Mostly useful for hash tables where the two pointer list head is too wasteful. You lose the ability to access the tail in O(1)." ([include/linux/list.h, lines 924 to 928](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L924-L928)) A hash table is an array of heads, one per bin. With `struct list_head` as the head, each bin costs two pointers. With the `hlist` types it costs one. ([include/linux/types.h, lines 194 to 200](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/types.h#L194-L200))

```c
struct hlist_head {
	struct hlist_node *first;
};

struct hlist_node {
	struct hlist_node *next, **pprev;
};
```

The head has only `first`. The node still has two fields, but the second is odd: `pprev` has two stars. It is not a pointer to the previous *node*. It is a pointer to the *pointer that points at this node*: for the first node that is the head's `first` field, and for every other node it is the previous node's `next` field.

That one level of indirection gives back the O(1) unlink. `__hlist_del` reads the node's two fields and writes through `pprev`: ([lines 975 to 983](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L975-L983))

```c
struct hlist_node *next = n->next;
struct hlist_node **pprev = n->pprev;

WRITE_ONCE(*pprev, next);
if (next)
	WRITE_ONCE(next->pprev, pprev);
```

The same code removes the first node and a node in the middle, because both have a pointer to "the thing that points at me". It does not take the head and it does not walk: O(1) in the **worst case**. `hlist_del` then poisons the node with the same two constants as `list_del`. ([lines 992 to 997](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L992-L997)) Insertion keeps `pprev` right. `hlist_add_head` sets `n->pprev = &h->first` and, if there was a first node, points its `pprev` at `&n->next` ([lines 1021 to 1029](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L1021-L1029)). `hlist_add_before` copies the `pprev` of the node it goes before ([lines 1036 to 1043](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L1036-L1043)), and `hlist_add_behind` uses `&prev->next` ([lines 1050 to 1059](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L1050-L1059)). The cost is the sentence from the header: with only `first` in the head, the tail is not reachable in O(1), so a tail insertion would have to walk the list first.

## Where a list beats an array

A hash table that finds a node by its key and then removes it is the case this serves: the table gives you the node, and the node knows how to leave. Compare an array, which CPython's `list` is. Inserting at index `where` moves every later item up one place: `for (i = n; --i >= where; ) items[i+1] = items[i];` ([Objects/listobject.c, lines 482 to 483, CPython 3.13.0](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listobject.c#L482-L483)). Removing by index, `list.pop(index)`, moves them down with `memmove`. ([lines 1514 to 1516](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listobject.c#L1514-L1516)) So an insert or a delete in the middle of an array of n items costs O(n) in the **worst case**, where the unlink above is a few writes. The list has a price too: it has no index, so reaching "the k-th node" is a walk. A list wins when you already hold the node. This Chapter makes no claim about speed on real hardware: neither source measures it.

## What the Problems build

The Build keeps the memory of the last Chapter. The first Problem builds the plain singly linked list and counts what removing a node costs. The second builds `hlist`: a head is one cell, a node is two cells, `next` and `pprev`, and `pprev` is an address, the address of the cell that points at the node. The Extra Problem is a classic singly linked puzzle that two pointers solve.
