# Linux e820: sweep the edges

When the machine starts, the firmware describes the memory it has as a list of ranges, and the list can contradict itself: ranges may overlap. The Linux kernel cleans such a list up in `e820__update_table`, in `arch/x86/kernel/e820.c` at the commit of the tag v6.6 (`ffc253263a1375a65fa6c9f62a893e9767fbebfa`). It does not compare every range with every other. It walks the edges of the ranges from left to right, a **sweep line**, and this Chapter reads how, and what the order of the edges has to be.

## The job

The comment on the function says what it is for: "Some E820 layouts include overlapping entries." "The following replaces the original E820 map with a new one, removing overlaps, and resolving conflicting memory types in favor of highest numbered type." ([e820.c, lines 221 to 224](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/arch/x86/kernel/e820.c#L221-L224)) Every entry has a type, and where two entries overlap, the larger type wins. This Chapter follows the sweep and ignores the types, because the Problem only counts.

## Two edges for every range

First it records the edges: "Record all known change-points (starting and ending addresses), omitting empty memory regions:" ([e820.c, lines 348 to 349](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/arch/x86/kernel/e820.c#L348-L349)). Then it puts them in order: "Sort change-point list by memory addresses (low -> high):" ([e820.c, line 362](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/arch/x86/kernel/e820.c#L362)). Each range is now two points on a line.

The walk keeps the set of ranges it is inside of, adding a range at its start and dropping it at its end:

```c
		/* Keep track of all overlapping entries */
		if (change_point[chg_idx]->addr == change_point[chg_idx]->entry->addr) {
			/* Add map entry to overlap list (> 1 entry implies an overlap) */
			overlap_list[overlap_entries++] = change_point[chg_idx]->entry;
		} else {
			/* Remove entry from list (order independent, so swap with last): */
			for (i = 0; i < overlap_entries; i++) {
				if (overlap_list[i] == change_point[chg_idx]->entry)
					overlap_list[i] = overlap_list[overlap_entries-1];
			}
			overlap_entries--;
		}
```

([e820.c, lines 373 to 384](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/arch/x86/kernel/e820.c#L373-L384)) The comments say "Keep track of all overlapping entries" and "Add map entry to overlap list (> 1 entry implies an overlap)" ([e820.c, lines 373 to 375](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/arch/x86/kernel/e820.c#L373-L375)). A point that starts a range adds it to `overlap_list`; any other point is an end, and the comment on that branch says "Remove entry from list (order independent, so swap with last):" ([e820.c, line 378](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/arch/x86/kernel/e820.c#L378)). After each point the code decides what to write: "If there are overlapping entries, decide which "type" to use (larger value takes precedence -- 1=usable, 2,3,4,4+=unusable)" ([e820.c, lines 386 to 388](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/arch/x86/kernel/e820.c#L386-L388)), and a new entry is begun only when the answer changes: "Continue building up new map based on this information:" ([e820.c, line 396](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/arch/x86/kernel/e820.c#L396)).

## What happens when two edges share a point

Ranges can start or end at the same address, so the order of such edges has to be decided. The comparison function says so: "If the addresses are equal, then consider one that represents the end of its region to be greater than one that does not." ([e820.c, lines 298 to 300](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/arch/x86/kernel/e820.c#L298-L300)) So at one address, starts are handled before ends. An entry here is a start address and a size, so its end is the address of the first byte after it ([e820.c, lines 352 to 358](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/arch/x86/kernel/e820.c#L352-L358)). Under that rule a range that ends at 100 and one that starts at 100 are, for a moment, in the list together. That is harmless for the kernel, which writes a map and not a count: the piece between those two handlings has no length, and the code drops it: "Move forward only if the new size was non-zero:" ([e820.c, line 400](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/arch/x86/kernel/e820.c#L400)).

A count would be fooled. If you want the most ranges that overlap at once, starts first would count a range that ends at 100 together with one that starts at 100 even when they share no address. For counting, an end has to be handled before a start at the same point. The Problem `depth` does this on intervals that hold both ends: an interval `lo-hi` opens at `lo` and closes at `hi + 1`, the first number it does not hold, and at the same number closes sort before opens. (This is the Chapter's own reasoning, not the kernel's rule.) With that, `3-5` and `6-8` close and open at 6 and never count together, while `3-6` and `6-8` do.

**Cost.** Sorting the 2n edges is O(n log n) in the **worst case** for a comparison sort, and counting is one step per edge, so `depth` is O(n log n) in the **worst case**, with O(n) extra space for the edges. The kernel's walk does more per edge. It loops over the whole `overlap_list` to remove an entry and again to find the winning type ([e820.c, lines 378 to 394](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/arch/x86/kernel/e820.c#L378-L394)), so one edge costs as much as the list is long, and many overlapping entries make the walk O(n²) in the **worst case** (the Chapter's own reading of the code).

## Counting is not assigning

The same question can be put as meeting rooms: given meetings with start and end times, how many rooms are needed? That is `depth`. No real system with published source was found for the room-assigning half of the question, so it lives in this section and in the Extra Problem `rooms`, not in a Chapter of its own.

`rooms` asks for more than a count: which room does each interval get? Go through the intervals by start. Keep two heaps. One holds the rooms that are free, lowest number first. The other holds the rooms in use, soonest to end first. Before an interval is placed, every room whose interval ended before this one starts moves from the second heap to the first. Then the interval takes the lowest free room, or a new one when none is free. A heap fits because both questions ask for the smallest one, and [CPython: a heap in a plain list](/chapters/heaps-heapq) reads one. Python's `heapq` documentation describes it this way: "Heaps are binary trees for which every parent node has a value less than or equal to any of its children." ([Python 3.13 `heapq`](https://docs.python.org/3.13/library/heapq.html)), and the Go `container/heap` package says "A heap is a tree with the property that each node is the minimum-valued node in its subtree." ([heap.go, lines 6 to 7](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/container/heap/heap.go#L6-L7)) The TypeScript Reference Code writes its own small heap.

Each interval is pushed once and popped at most once from each heap, and a push or a pop is O(log n) in the **worst case**, so after the sort the whole pass is O(n log n) in the **worst case**. The number of the highest room that is used equals what `depth` prints, because a new room is opened only when every room in use is still busy.

## What the Problems build

`depth` prints the most intervals that hold one number, from the intervals `add` and `place` put in. `rooms` (Extra) prints the room each interval gets, in the order the intervals were added.
