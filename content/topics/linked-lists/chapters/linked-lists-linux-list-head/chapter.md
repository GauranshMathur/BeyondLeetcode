# Linux: a list node that lives inside the object

A textbook linked list allocates a node for each item, and the node points at the item. The Linux kernel's list does something else: the two link fields are a member of the item itself. This Chapter reads how that works in Linux 6.6 (tag `v6.6`, commit `ffc2532`), the file `include/linux/list.h`, and what the kernel gets for it.

## One type for the node, and a ring

A node is two pointers. ([include/linux/types.h, lines 190 to 192](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/types.h#L190-L192))

```c
struct list_head {
	struct list_head *next, *prev;
};
```

The header describes the structure in one line: "Circular doubly linked list implementation." ([include/linux/list.h, line 14](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L14)) Circular means that no pointer is ever `NULL`. A list is a `list_head` that serves as its **head**, and `INIT_LIST_HEAD` makes it point to itself: "Initializes the list_head to point to itself. If it is a list header, the result is an empty list." ([lines 28 to 39](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L28-L39)) So the test for an empty list is the head pointing at itself: `READ_ONCE(head->next) == head`. ([`list_empty`, lines 367 to 374](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L367-L374))

The head is itself a node in the ring. That removes the special cases: an insertion always has a neighbour on each side, even into an empty list, where both neighbours are the head. The function that links a node between two neighbours is "Insert a new entry between two known consecutive entries." ([`__list_add`, lines 140 to 157](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L140-L157))

```c
next->prev = new;
new->next = next;
new->prev = prev;
WRITE_ONCE(prev->next, new);
```

(An `if` before these lines checks the list for corruption; Chapter 4 reads it.) Two public functions choose the neighbours. `list_add` inserts "after the specified head. This is good for implementing stacks." ([lines 159 to 170](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L159-L170)) `list_add_tail` inserts "before the specified head. This is useful for implementing queues." ([lines 173 to 184](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L173-L184)) Before the head in a ring is the last place, which is why that is the queue's tail. Either way the cost is four writes whatever the length of the list: O(1) in the **worst case**.

## Unlinking, and what the kernel writes into the dead node

Removing a node needs its two neighbours, and a node holds both pointers, so it needs nothing else: "Delete a list entry by making the prev/next entries point to each other." ([`__list_del`, lines 186 to 197](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L186-L197)) The body is `next->prev = prev;` and `WRITE_ONCE(prev->next, next);`. The caller does not need the head, and the list is not walked: O(1) in the **worst case**.

What happens to the removed node is a decision. `list_del` ends by overwriting both of its pointers with two odd constants, and says so: "Note: list_empty() on entry does not return true after this, the entry is in an undefined state." ([`list_del`, lines 221 to 232](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L221-L232)) The constants are `LIST_POISON1`, `0x100`, and `LIST_POISON2`, `0x122`: "non-NULL pointers that will result in page faults under normal circumstances, used to verify that nobody uses non-initialized list entries." ([include/linux/poison.h, lines 18 to 24](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/poison.h#L18-L24)) (Those are the values with `POISON_POINTER_DELTA` equal to 0, which is what the file defines when no illegal-pointer value is configured: [lines 12 to 16](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/poison.h#L12-L16).) Code that follows a deleted node's pointers then lands on an address that faults, instead of walking into whatever list the old neighbours are on. If you want the node to be a valid empty list afterwards, there is a second function: `list_del_init` unlinks and then calls `INIT_LIST_HEAD` on the node. ([lines 281 to 289](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L281-L289))

## Why the node lives inside the object

The functions above never mention the item. They take `struct list_head *` and nothing else. How does the kernel get from a node back to the item it belongs to? The item contains the node as a member, and `list_entry` converts: `#define list_entry(ptr, type, member) container_of(ptr, type, member)`. ([lines 594 to 601](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L594-L601)) `container_of` is documented as "cast a member of a structure out to the containing structure", and its result is `((type *)(__mptr - offsetof(type, member)))`. ([include/linux/container_of.h, lines 10 to 23](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/container_of.h#L10-L23)) In words: the address of the object is the address of the node minus the offset of the member inside the object. The loop `list_for_each_entry` is built from it: it starts from `list_first_entry`, which is `list_entry((ptr)->next, type, member)`, and stops when the cursor's member is the head. ([lines 763 to 772](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L763-L772), [lines 603 to 612](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L603-L612))

Two things follow, and both can be read off the code above. First, no function in this file allocates memory: the nodes already exist, inside the objects, so adding an object to a list only writes pointers. Second, an object can be on several lists at once by having several members. The kernel's `struct dentry`, a cached directory entry, has three: `d_lru` ("LRU list"), `d_child` ("child of parent list") and `d_subdirs` ("our children"). ([include/linux/dcache.h, lines 100 to 105](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/dcache.h#L100-L105)) One object is on its parent's list through `d_child` and heads the list of its own children through `d_subdirs`. The same `list_add` and `list_del` serve all three, with no separate list type for each.

The price is the other side of the same fact: a node cannot outlive its object, and a member can be on one list at a time. (That is a consequence of the layout, not a claim in a comment.) This Chapter says nothing about speed on real hardware; the sources above do not measure it.

## What the Problems build

The Build is a small machine whose memory is a table of numbered cells; a cell nobody has written holds 0. A `list_head` is two cells: `next` at its address and `prev` at the address plus one. A pointer is an address, and 0 plays the part of `NULL`. Nodes are the addresses you give the commands; keep them at least 2 apart, since each takes two cells. The first Problem builds `INIT_LIST_HEAD`, `list_add`, `list_add_tail` and `list_empty`. The second builds `list_del` with its poison and `list_del_init`, and a way to read cells. The third builds `container_of`: an object is a block of cells with its value first and its `list_head` members after it, and the subtraction recovers the block from the node.
