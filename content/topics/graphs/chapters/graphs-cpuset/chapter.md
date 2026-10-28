# Linux cpusets: merging overlapping sets

Sometimes the question about a graph is not a route but a group: are these two nodes connected at all, if you ignore the direction of the edges? And the graph keeps growing while you ask. A search from scratch answers it each time. This Chapter reads a structure that answers it while edges arrive: **union-find**, in the Linux kernel at v6.12, where it merges overlapping sets of CPUs.

## What union-find is

The kernel's document for it says: "Union-find is a data structure used to handle the merging and querying of disjoint sets." Its find operation answers the question above: "This operation is used to check if two elements are in the same set." ([Documentation/core-api/union_find.rst, lines 14 to 22 (Linux v6.12)](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/Documentation/core-api/union_find.rst#L14-L22)) Every node starts in a set of its own. Each set is a tree of parent pointers, and the root of the tree stands for the set. The structure is two fields:

```c
struct uf_node {
	struct uf_node *parent;
	unsigned int rank;
};
```

([include/linux/union_find.h, lines 14 to 17](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/include/linux/union_find.h#L14-L17)) Two nodes are in one set when following their parents ends at the same root: "If they have the same root, they are in the same set." ([union_find.rst, line 85](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/Documentation/core-api/union_find.rst#L85))

## Find, and flatten as you go

The comment on `uf_find` says what it does: "Find the root of a node and perform path compression", and "This function returns the root of the node by following the parent pointers. It also performs path compression, making the tree shallower." ([lib/union_find.c, lines 5 to 9](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/lib/union_find.c#L5-L9)) The loop is short:

```c
while (node->parent != node) {
	parent = node->parent;
	node->parent = parent->parent;
	node = parent;
}
return node;
```

([lines 17 to 22](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/lib/union_find.c#L17-L22)) On each step the node is pointed at its grandparent, so the next find along that path is shorter.

## Union, with the shorter tree underneath

The comment on `uf_union` says "Merge two sets, using union by rank" ([line 26](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/lib/union_find.c#L26)). It finds both roots and does nothing if they are one, then hangs the lower tree under the higher:

```c
if (root1 == root2)
	return;

if (root1->rank < root2->rank) {
	root1->parent = root2;
} else if (root1->rank > root2->rank) {
	root2->parent = root1;
} else {
	root2->parent = root1;
	root1->rank++;
}
```

([lines 38 to 48](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/lib/union_find.c#L38-L48)) The document explains the field: "The rank field represents the height of the current tree. During a union operation, the tree with the smaller rank is attached under the tree with the larger rank to maintain balance." ([union_find.rst, lines 63 to 65](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/Documentation/core-api/union_find.rst#L63-L65)) Because find shortens paths and never touches `rank`, I read rank as an upper bound on the height, not the height itself. The cost, as the document puts it: "These optimizations reduce the average time complexity of each find and union operation to O(α(n)), where α(n) is the inverse Ackermann function. This can be roughly considered a constant time complexity for practical purposes." ([lines 38 to 41](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/Documentation/core-api/union_find.rst#L38-L41)) The document says average. Over a sequence of operations the cost per operation is **amortised**: one find can still walk a long path, and it pays for itself by shortening the paths for the finds that follow. The space is "O(n), where n is the number of nodes." ([line 34](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/Documentation/core-api/union_find.rst#L34))

## Where the kernel uses it

The function `generate_sched_domains` in `kernel/cgroup/cpuset.c` explains its job: "This function builds a partial partition of the systems CPUs" and "A 'partial partition' is a set of non-overlapping subsets whose union is a subset of that set." ([lines 671 to 673](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/kernel/cgroup/cpuset.c#L671-L673)) A helper asks whether two cpusets touch: "Do cpusets a, b have overlapping effective cpus_allowed masks?" ([line 626](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/kernel/cgroup/cpuset.c#L626)) The cpusets are the nodes, and two cpusets that overlap are joined by an edge. The code merges the ends of every such edge, then counts the roots:

```c
/* Merge overlapping cpusets */
for (i = 0; i < csn; i++) {
	for (j = i + 1; j < csn; j++) {
		if (cpusets_overlap(csa[i], csa[j])) {
			...
			uf_union(&csa[i]->node, &csa[j]->node);
		}
	}
}

/* Count the total number of domains */
for (i = 0; i < csn; i++) {
	if (uf_find(&csa[i]->node) == &csa[i]->node)
		ndoms++;
}
```

([kernel/cgroup/cpuset.c, lines 823 to 841](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/kernel/cgroup/cpuset.c#L823-L841); the `...` stands for a comment and a warning check that have nothing to do with the merging.) A root is a node that is its own parent, so the loop counts one node for every set. The Problems do the same two things: `same` is the find, and `groups` is the count of roots. The kernel checks every pair of cpusets, which is O(n²) pair checks in the **worst case** for n cpusets, and unions the overlapping ones. The Problems union as each edge arrives.

## An edge that joins nothing new

The kernel's `uf_union` returns early when both roots are the same node. In graph terms, the two ends were already connected, so this edge closes a loop in the undirected graph. The Problem `redundant` reports exactly those edges.

## Extra: labelling a picture

OpenCV, the image library, uses the same structure to find the connected parts of an image. Its documentation: "computes the connected components labeled image of boolean image", "image with 4 or 8 way connectivity - returns N, the total number of labels [0, N-1] where 0 represents the background label." ([modules/imgproc/include/opencv2/imgproc.hpp, lines 3920 to 3923 (OpenCV 4.9.0)](https://github.com/opencv/opencv/blob/dad8af6b17f8e60d7b95a1203a1b4d22f56574cf/modules/imgproc/include/opencv2/imgproc.hpp#L3920-L3923)) A pixel touches its neighbours at 4 sides or at 8, and the parameter says which: "8 or 4 for 8-way or 4-way connectivity respectively" ([line 3934](https://github.com/opencv/opencv/blob/dad8af6b17f8e60d7b95a1203a1b4d22f56574cf/modules/imgproc/include/opencv2/imgproc.hpp#L3934)). Its source has a find whose comment says "Find the root of the tree of the node i and compress the path in the process" ([modules/imgproc/src/connectedcomponents.cpp, line 221](https://github.com/opencv/opencv/blob/dad8af6b17f8e60d7b95a1203a1b4d22f56574cf/modules/imgproc/src/connectedcomponents.cpp#L221)), and a different rule for a union: it has no rank, and it makes the smaller of the two roots the new root.

```cpp
if (root > rootj){
    root = rootj;
}
```

([lines 237 to 239](https://github.com/opencv/opencv/blob/dad8af6b17f8e60d7b95a1203a1b4d22f56574cf/modules/imgproc/src/connectedcomponents.cpp#L237-L239)) The Extra Problem `islands` counts the groups of land cells in a grid with that connectivity parameter.
