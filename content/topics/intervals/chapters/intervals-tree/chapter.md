# Linux interval tree: skip what cannot overlap

Given a set of ranges, which of them overlap this one? The Linux kernel answers that with an interval tree, written once as a template in `include/linux/interval_tree_generic.h` and used by `lib/interval_tree.c` ([interval_tree.c, lines 10 to 12](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/interval_tree.c#L10-L12)), at the commit of the tag v6.6 (`ffc253263a1375a65fa6c9f62a893e9767fbebfa`). A scan of every range would work, but the kernel's code skips whole parts of its tree that cannot hold an answer. This Chapter reads how, and in the Problem `find` you do the same on a sorted list.

## A node is an interval, ordered by its start

The tree's node is a range with a start and a last number:

```c
struct interval_tree_node {
	struct rb_node rb;
	unsigned long start;	/* Start of interval */
	unsigned long last;	/* Last location _in_ interval */
	unsigned long __subtree_last;
};
```

([interval_tree.h, lines 7 to 12](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/interval_tree.h#L7-L12)) The comment on `last` says "Last location _in_ interval" ([interval_tree.h, line 10](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/interval_tree.h#L10)), so both ends belong to the interval, the same as the intervals in these Problems. The template's insert walks down from the root, going left when the new start is smaller and right otherwise (the trailing `\` of each line, which continues the macro, is left out):

```c
	while (*link) {
		rb_parent = *link;
		parent = rb_entry(rb_parent, ITSTRUCT, ITRB);
		if (parent->ITSUBTREE < last)
			parent->ITSUBTREE = last;
		if (start < ITSTART(parent))
			link = &parent->ITRB.rb_left;
		else {
			link = &parent->ITRB.rb_right;
			leftmost = false;
		}
	}
```

([interval_tree_generic.h, lines 46 to 57](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/interval_tree_generic.h#L46-L57)) Two things follow from these lines (the Chapter's own reading). The tree is ordered by start. And when a new start equals one already in the tree, the new node goes right, so among equal starts a later insertion comes later in the order. The same loop does something else on its way down: `if (parent->ITSUBTREE < last) parent->ITSUBTREE = last;` raises a stored number in every node it passes.

## What each node remembers

That stored number is declared in the template's parameter list: "ITSUBTREE:  name of ITTYPE field within ITSTRUCT holding last-in-subtree" ([interval_tree_generic.h, line 18](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/interval_tree_generic.h#L18)), and in the node it is `unsigned long __subtree_last;` ([interval_tree.h, line 11](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/interval_tree.h#L11)). The kernel's red-black tree documentation says what it holds: "Interval tree is an example of augmented rb tree." ([rbtree.rst, line 283](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/Documentation/core-api/rbtree.rst#L283)) It adds that the extra information "is the maximum hi (max_hi) value among all the nodes that are its descendants." ([rbtree.rst, lines 294 to 295](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/Documentation/core-api/rbtree.rst#L294-L295)) So every node knows the largest end anywhere below it.

## How a search uses it

The template's comment says when a node's interval overlaps the one asked about: "Note that a node's interval intersects [start;last] iff:", "Cond1: ITSTART(node) <= last" and "Cond2: start <= ITLAST(node)" ([interval_tree_generic.h, lines 74 to 77](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/interval_tree_generic.h#L74-L77)). In words: the node starts no later than the query ends, and ends no earlier than the query starts.

The search wants the leftmost match. At each node it first asks whether the left subtree can hold one. A subtree whose largest end is below the query's start cannot, so it is skipped without a look. If it can, the search goes in. The comment explains why the first node it finds there decides everything: "Some nodes in left subtree satisfy Cond2. Iterate to find the leftmost such node N. If it also satisfies Cond1, that's the match we are looking for. Otherwise, there is no matching interval as nodes to the right of N can't satisfy Cond1 either." ([interval_tree_generic.h, lines 93 to 98](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/interval_tree_generic.h#L93-L98)) The code for it is in [interval_tree_generic.h, lines 88 to 114](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/interval_tree_generic.h#L88-L114). Nodes to the right of N start no earlier than N does, so if N starts too late for the query, so do they. The same two tests prune the walk to the next match in `interval_tree_iter_next` ([interval_tree_generic.h, lines 152 to 187](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/interval_tree_generic.h#L152-L187)).

**Cost.** The kernel documents the lookup: "this will be used in O(log n) lookup for lowest match (lowest start address among all possible matches)" ([rbtree.rst, lines 297 to 298](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/Documentation/core-api/rbtree.rst#L297-L298)). That holds because the tree stays balanced: "Red-black trees are a type of self-balancing binary search tree" ([rbtree.rst, line 12](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/Documentation/core-api/rbtree.rst#L12)), with "(but still O(log n)) lookup time." ([rbtree.rst, line 22](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/Documentation/core-api/rbtree.rst#L22)). Each call to `interval_tree_iter_first` or `interval_tree_iter_next` goes up and down at most one path of the tree, so by the Chapter's own analysis a call is O(log n) in the **worst case**, and listing k matches is O((k + 1) log n) in the **worst case**.

## What the Problem builds

The Build does not need the kernel's tree, but it can use the same rule. `find lo hi` keeps every interval that `add` and `place` put in, as given and not merged, in a list sorted by `lo`. Equal `lo` keep the order they were added in, as the kernel's insert does. Each part of the list is a tree: its middle item is the root, the left and right halves are its children, and `sub[m]` holds the largest `hi` in the part that item `m` is the middle of. No pointers are needed, because the positions say who the children are. When `add` or `place` has changed the intervals, the next `find` sorts again and recomputes `sub`: O(n log n) in the **worst case**, and the sort is the dominant cost. The kernel updates its tree one insert at a time instead; this Build does not. A search skips a part when `sub` is below the query's `lo`, goes left first, and goes right only when the middle item starts no later than the query's `hi`. Because the list is balanced, a search is O((k + 1) log n) in the **worst case** when it reports k intervals (the Chapter's own analysis). Merged intervals would lose which interval was where, which is why `find` reads the intervals as they were given, and `merged` from the earlier Chapters stays separate.
