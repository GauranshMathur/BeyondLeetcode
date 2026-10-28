# Linux memblock: keep the ranges merged as they arrive

Early in boot, the Linux kernel has to keep track of memory before its usual allocators exist. It does that with memblock, in `mm/memblock.c` at the commit of the tag v6.6 (`ffc253263a1375a65fa6c9f62a893e9767fbebfa`). The file's overview says what memblock is for: "Memblock is a method of managing memory regions during the early boot period when the usual kernel memory allocators are not up and running." ([memblock.c, lines 39 to 41](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/mm/memblock.c#L39-L41)) And how it sees memory: "Memblock views the system memory as collections of contiguous regions." ([memblock.c, lines 43 to 44](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/mm/memblock.c#L43-L44)) Where the last Chapter cleaned a list once at the end, memblock keeps its list clean after every single addition. This Chapter reads how, and what that costs.

## A sorted array and two counters

The overview says what holds the regions: "Every memory type is described by the struct memblock_type which contains an array of memory regions along with the allocator metadata." ([memblock.c, lines 57 to 59](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/mm/memblock.c#L57-L59))

```c
struct memblock_type {
	unsigned long cnt;
	unsigned long max;
	phys_addr_t total_size;
	struct memblock_region *regions;
	char *name;
};
```

([memblock.h, lines 76 to 82](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/memblock.h#L76-L82)) The header documents the fields: "@cnt: number of regions", "@total_size: size of all regions" and "@regions: array of regions" ([memblock.h, lines 70 to 73](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/memblock.h#L70-L73)). The array is kept in order. A comment in `__next_mem_range` relies on it: "As both region arrays are sorted" ([memblock.c, line 1057](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/mm/memblock.c#L1057)). A region is a `base` and a `size` ([memblock.h, lines 59 to 62](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/memblock.h#L59-L62)), and the documentation writes a region as "[@base, @base + @size)" ([memblock.c, line 579](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/mm/memblock.c#L579)), which leaves out the first number after the region. So two regions abut when one's `base + size` equals the next one's `base`. The Problems use intervals that hold both of their ends, so they abut when `hi + 1` equals the next `lo`. The Problem `place` prints the same two numbers memblock keeps, how many regions there are and how much they hold in all.

## Adding a range

The comment on `memblock_add_range` states the promise: "Add new memblock region [@base, @base + @size) into @type." "The new region is allowed to overlap with existing ones - overlaps don't affect already existing regions." "@type is guaranteed to be minimal (all neighbouring compatible regions are merged) after the addition." ([memblock.c, lines 579 to 582](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/mm/memblock.c#L579-L582)) So the array never holds two regions that could be one.

It does the work in two steps. First it walks the array in order and adds only the pieces of the new range that no region already holds:

```c
	for_each_memblock_type(idx, type, rgn) {
		phys_addr_t rbase = rgn->base;
		phys_addr_t rend = rbase + rgn->size;

		if (rbase >= end)
			break;
		if (rend <= base)
			continue;
```

([memblock.c, lines 630 to 637](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/mm/memblock.c#L630-L637)) The walk stops at the first region that starts at or after the end of the new range, and skips the regions that end at or before its start. (That `break` is right only because the array is in order. The reading is the Chapter's own.) The function says it runs this walk twice: "The following is executed twice. Once with %false @insert and then with %true. The first counts the number of regions needed to accommodate the new area. The second actually inserts them." ([memblock.c, lines 623 to 625](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/mm/memblock.c#L623-L625)) Between the two rounds the array is resized if it needs room, and after the second round the new pieces are merged: "If this was the first round, resize array and repeat for actual insertions; otherwise, merge and return." ([memblock.c, lines 677 to 678](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/mm/memblock.c#L677-L678))

The merge looks only around the part that changed. Its comment says: "Scan @type and merge neighboring compatible regions in [@start_rgn - 1, @end_rgn)" ([memblock.c, line 510](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/mm/memblock.c#L510)). Two neighbours become one when one ends exactly where the next begins:

```c
		if (this->base + this->size != next->base ||
		    memblock_get_region_node(this) !=
		    memblock_get_region_node(next) ||
		    this->flags != next->flags) {
			BUG_ON(this->base + this->size > next->base);
			i++;
			continue;
		}

		this->size += next->size;
```

([memblock.c, lines 524 to 533](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/mm/memblock.c#L524-L533)) The other tests in the condition compare a node number and flags that each region carries. The Problems have neither, so for them the only test is that the regions abut.

**Cost.** Inserting a region in the middle shifts every later one: `memmove(rgn + 1, rgn, (type->cnt - idx) * sizeof(*rgn));` ([memblock.c, line 562](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/mm/memblock.c#L562)), and merging two regions shifts the rest again ([memblock.c, line 535](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/mm/memblock.c#L535)). A shift of n regions is O(n) in the **worst case**. The walk above also starts at the first region every time ([memblock.c, lines 147 to 150](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/mm/memblock.c#L147-L150)), so one addition is O(n) in the **worst case** (the Chapter's own reading of the code). The Reference Code of `place` finds the spot with a binary search, which is O(log n) in the **worst case**, but it still has to shift the array when it replaces the regions it absorbs, so one `place` is O(n) in the **worst case**. A range that absorbs k regions removes them all at once, and each region is absorbed at most once after it was added.

## Taking a range out

Removing works from the other side. The function that does the first half says: "Walk @type and ensure that regions don't cross the boundaries defined by [@base, @base + @size). Crossing regions are split at the boundaries, which may create at most two more regions." ([memblock.c, lines 745 to 747](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/mm/memblock.c#L745-L747)) `memblock_remove_range` isolates the range that way and then drops the regions that lie inside it ([memblock.c, lines 813 to 826](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/mm/memblock.c#L813-L826)). A cut can therefore turn one region into two, and the count in `@cnt` can go up. The Extra Problem `cut` is that step.

## What the Problems build

`place lo hi` adds an interval exactly like `add`, keeps the merged list in order as it goes, and prints how many merged intervals there are and how many numbers they hold. The command `merged` from the last Chapter still prints the same list. It is the classic step of inserting an interval into a sorted list of disjoint intervals, with the counters memblock keeps. `cut` (Extra) takes numbers back out.
