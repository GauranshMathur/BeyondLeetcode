# Linked lists: sources

Research for the Topic `linked-lists` (card C105, issue #262). Every claim about a real system that the five Chapters make is listed below with its source, quote and status. The Problems follow the same sources: the rules in each statement are the rules in the code quoted here.

Tags, resolved to commit SHAs with `git ls-remote`. Every code link in the Chapters uses the SHA, never a branch or a tag.

| Project | Tag | Commit |
|---|---|---|
| Linux | `v6.6` | `ffc253263a1375a65fa6c9f62a893e9767fbebfa` (annotated tag object `5260836abb7056beed3f3f0d0e4262c11f36f0d0`) |
| CPython | `v3.13.0` | `60403a5409ff2c3f3b07dd2ca91a7a3e096839c7` (annotated tag object `3f27099d916c7b885e3daf1fabedcc119462014d`) |
| Redis | `7.2.0` | `29622276ecd7b74312798e6772744858a8a6f9bf` (lightweight tag) |
| Python docs | `3.13` | `docs.python.org/3.13/` |

Method. Code files were fetched with `curl -fsSL https://raw.githubusercontent.com/<org>/<repo>/<sha>/<path>` and read with `awk 'NR>=a&&NR<=b'`. The Python docs page was fetched with `curl` and its tags stripped with a Python regex, so its quotes carry no line number. Every quote below was then checked mechanically against the lines it cites (whitespace and comment asterisks normalised), and every link in a Chapter was matched to a claim here. Types: 1 source code, 2 official documentation for that version. (Types 3 and 4, a paper or design document and a talk or post by the builders, are not used.)

## Leads that changed

- The issue's first lead, Linux `list_head`, became Chapter 1 as written.
- "Singly versus doubly linked, and where a list beats an array" had no named lead. A search of `include/linux/list.h` found `hlist`, whose own header comment names the trade (one pointer in the head, for hash tables). That is Chapter 2. The case against an array rests on two lines of CPython's `list` source; no claim is made about cache behaviour because no primary source was gathered (the research file `candidates-linear.md` lists that claim as `[NEEDS SOURCE]`).
- "Pointer manipulation: reverse, merge, splice" is Chapter 3. Splice and merge come from Linux (`list_splice*` and `lib/list_sort.c`). Reverse has no source: the Chapter says so and gives it as an argument.
- "Cycle detection with fast and slow pointers" is already Chapter 4 of the Two pointers Topic (`two-pointers-emacs-cycles`, Floyd and Brent via Emacs). Repeating it was ruled out. This Topic's Chapter 4 reads the other way to notice a broken list that the ring allows, Linux's neighbour checks in `lib/list_debug.c`, and links to the Emacs Chapter for the one-way case.
- "An LRU cache from a list plus a hash table" is Chapter 5, from CPython's `functools.lru_cache`; Redis is the counter-example. The research file's memcached lead was not used (one system per Chapter, and the file marks its HOT/WARM/COLD rules `[NEEDS SOURCE]`).

## Candidate Problems from the issue

Reverse Linked List is `linked-lists-reverse`. Merge Two Sorted Lists is `linked-lists-merge`. Remove Nth Node From End is the Extra `linked-lists-nth-from-end`. LRU Cache is `linked-lists-lru` and `linked-lists-info`. **Linked List Cycle** is not in this Topic: it is `two-pointers-cycle` in the Two pointers Topic. **Reorder List** is not in this Topic: it needs a middle, a reverse and a merge together, and no Chapter here reads a system that does it; it is a candidate for a later card.

## Observed, not cited

These were run to check the Build. They are not claims in a Chapter.

- The Python, TypeScript and Go Reference Code give identical output on every Test, and the Python Reference Code was compared with `collections.OrderedDict` (for `cache`, `call`, `order`, `info`, `clear`) and with `sorted` (for `smerge` and `ssort`, including stability) over 300 random sequences each.

## Arguments, not claims about a system

These statements in the Chapters have no source on purpose and say so:

- Chapter 2: removing a node from a singly linked list needs the previous node, which means a walk from the head.
- Chapter 3: reversing a singly linked list by pointer reversal (three variables, one pass).
- Chapter 4: if every step of a walk from the head passes the back-pointer check, the first node to repeat is the head, so the walk ends.
- Chapter 5: the arithmetic comparing a list node's two pointers with Redis' 24-bit field.
- Complexity statements are read off the quoted code and labelled worst, expected or amortised in the text.

## Claims cut for want of a source

- That a linked list is slower or faster than an array on real hardware (cache behaviour). No primary source gathered; not asserted.
- How the Linux dentry or inode LRU is ordered and evicted. Only the field declarations in `dcache.h` were opened, and only they are used.
- memcached's LRU segments (HOT, WARM, COLD, TEMP): not used.

---

### Claim 1. A node is two pointers: `struct list_head { struct list_head *next, *prev; };`.

- Link: [include/linux/types.h, lines 190 to 192 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/types.h#L190-L192)
- Chapter: `linked-lists-linux-list-head`
- Quote: `struct list_head {`; `struct list_head *next, *prev;`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 2. The header describes the structure as a "Circular doubly linked list implementation."

- Link: [include/linux/list.h, line 14 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L14)
- Chapter: `linked-lists-linux-list-head`
- Quote: `Circular doubly linked list implementation.`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 3. `INIT_LIST_HEAD` makes the node point to itself: "If it is a list header, the result is an empty list."

- Link: [include/linux/list.h, lines 28 to 39 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L28-L39)
- Chapter: `linked-lists-linux-list-head`
- Quote: `Initializes the list_head to point to itself.`; `the result is an empty list.`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 4. An empty list is the head pointing at itself: `READ_ONCE(head->next) == head`.

- Link: [include/linux/list.h, lines 367 to 374 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L367-L374)
- Chapter: `linked-lists-linux-list-head`
- Quote: `READ_ONCE(head->next) == head`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 5. `__list_add` links a node between two known neighbours with four writes.

- Link: [include/linux/list.h, lines 140 to 157 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L140-L157)
- Chapter: `linked-lists-linux-list-head`
- Quote: `Insert a new entry between two known consecutive entries.`; `next->prev = new;`; `new->next = next;`; `new->prev = prev;`; `WRITE_ONCE(prev->next, new);`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 6. `list_add` inserts after the head and "is good for implementing stacks".

- Link: [include/linux/list.h, lines 159 to 170 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L159-L170)
- Chapter: `linked-lists-linux-list-head`
- Quote: `Insert a new entry after the specified head.`; `This is good for implementing stacks.`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 7. `list_add_tail` inserts before the head and "is useful for implementing queues".

- Link: [include/linux/list.h, lines 173 to 184 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L173-L184)
- Chapter: `linked-lists-linux-list-head`
- Quote: `Insert a new entry before the specified head.`; `This is useful for implementing queues.`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 8. `__list_del` unlinks by making the neighbours point at each other: `next->prev = prev;` and `WRITE_ONCE(prev->next, next);`.

- Link: [include/linux/list.h, lines 186 to 197 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L186-L197)
- Chapter: `linked-lists-linux-list-head`
- Quote: `Delete a list entry by making the prev/next entries`; `next->prev = prev;`; `WRITE_ONCE(prev->next, next);`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 9. `list_del` ends by writing `LIST_POISON1` and `LIST_POISON2` into the node, and says its state is undefined.

- Link: [include/linux/list.h, lines 221 to 232 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L221-L232)
- Chapter: `linked-lists-linux-list-head`
- Quote: `the entry is in an undefined state`; `entry->next = LIST_POISON1;`; `entry->prev = LIST_POISON2;`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 10. The poison constants are `0x100` and `0x122`, "non-NULL pointers that will result in page faults under normal circumstances".

- Link: [include/linux/poison.h, lines 18 to 24 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/poison.h#L18-L24)
- Chapter: `linked-lists-linux-list-head`
- Quote: `These are non-NULL pointers that will result in page faults`; `non-initialized list entries.`; `0x100`; `0x122`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 11. `POISON_POINTER_DELTA` is 0 when no illegal-pointer value is configured.

- Link: [include/linux/poison.h, lines 12 to 16 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/poison.h#L12-L16)
- Chapter: `linked-lists-linux-list-head`
- Quote: `# define POISON_POINTER_DELTA 0`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 12. `list_del_init` unlinks and then calls `INIT_LIST_HEAD` on the node.

- Link: [include/linux/list.h, lines 281 to 289 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L281-L289)
- Chapter: `linked-lists-linux-list-head`
- Quote: `list_del_init - deletes entry from list and reinitialize it.`; `__list_del_entry(entry);`; `INIT_LIST_HEAD(entry);`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 13. `list_entry(ptr, type, member)` is `container_of(ptr, type, member)`.

- Link: [include/linux/list.h, lines 594 to 601 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L594-L601)
- Chapter: `linked-lists-linux-list-head`
- Quote: `#define list_entry(ptr, type, member)`; `container_of(ptr, type, member)`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 14. `container_of` is "cast a member of a structure out to the containing structure" and subtracts `offsetof(type, member)` from the member's address.

- Link: [include/linux/container_of.h, lines 10 to 23 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/container_of.h#L10-L23)
- Chapter: `linked-lists-linux-list-head`
- Quote: `container_of - cast a member of a structure out to the containing structure`; `(type *)(__mptr - offsetof(type, member))`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 15. `list_for_each_entry` starts from `list_first_entry` and stops when the cursor's member is the head.

- Link: [include/linux/list.h, lines 763 to 772 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L763-L772)
- Chapter: `linked-lists-linux-list-head`
- Quote: `#define list_for_each_entry(pos, head, member)`; `list_first_entry(head, typeof(*pos), member)`; `!list_entry_is_head(pos, head, member)`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 16. `list_first_entry` is `list_entry((ptr)->next, type, member)`.

- Link: [include/linux/list.h, lines 603 to 612 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L603-L612)
- Chapter: `linked-lists-linux-list-head`
- Quote: `list_entry((ptr)->next, type, member)`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 17. `struct dentry` has three list members: `d_lru` ("LRU list"), `d_child` ("child of parent list"), `d_subdirs` ("our children").

- Link: [include/linux/dcache.h, lines 100 to 105 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/dcache.h#L100-L105)
- Chapter: `linked-lists-linux-list-head`
- Quote: `struct list_head d_lru;`; `/* LRU list */`; `struct list_head d_child;`; `/* child of parent list */`; `struct list_head d_subdirs;`; `/* our children */`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 18. The header says the single-pointer head is "Mostly useful for hash tables" and that "You lose the ability to access the tail in O(1)."

- Link: [include/linux/list.h, lines 924 to 928 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L924-L928)
- Chapter: `linked-lists-linux-hlist`
- Quote: `Double linked lists with a single pointer list head.`; `Mostly useful for hash tables where the two pointer list head is`; `too wasteful.`; `You lose the ability to access the tail in O(1).`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 19. `hlist_head` has one pointer, `first`; `hlist_node` has `next` and `pprev`, a pointer to a pointer.

- Link: [include/linux/types.h, lines 194 to 200 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/types.h#L194-L200)
- Chapter: `linked-lists-linux-hlist`
- Quote: `struct hlist_head {`; `struct hlist_node *first;`; `struct hlist_node *next, **pprev;`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 20. `__hlist_del` writes `next` through `pprev` and, if there is a next node, points its `pprev` at the same place.

- Link: [include/linux/list.h, lines 975 to 983 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L975-L983)
- Chapter: `linked-lists-linux-hlist`
- Quote: `struct hlist_node *next = n->next;`; `struct hlist_node **pprev = n->pprev;`; `WRITE_ONCE(*pprev, next);`; `WRITE_ONCE(next->pprev, pprev);`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 21. `hlist_del` then writes `LIST_POISON1` and `LIST_POISON2` into the node.

- Link: [include/linux/list.h, lines 992 to 997 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L992-L997)
- Chapter: `linked-lists-linux-hlist`
- Quote: `n->next = LIST_POISON1;`; `n->pprev = LIST_POISON2;`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 22. `hlist_add_head` sets `n->pprev = &h->first` and points the old first node's `pprev` at `&n->next`.

- Link: [include/linux/list.h, lines 1021 to 1029 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L1021-L1029)
- Chapter: `linked-lists-linux-hlist`
- Quote: `WRITE_ONCE(first->pprev, &n->next);`; `WRITE_ONCE(n->pprev, &h->first);`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 23. `hlist_add_before` copies the `pprev` of the node it goes before.

- Link: [include/linux/list.h, lines 1036 to 1043 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L1036-L1043)
- Chapter: `linked-lists-linux-hlist`
- Quote: `WRITE_ONCE(n->pprev, next->pprev);`; `WRITE_ONCE(*(n->pprev), n);`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 24. `hlist_add_behind` uses `&prev->next` as the new node's `pprev`.

- Link: [include/linux/list.h, lines 1050 to 1059 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L1050-L1059)
- Chapter: `linked-lists-linux-hlist`
- Quote: `WRITE_ONCE(n->pprev, &prev->next);`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 25. Inserting into a CPython list at index `where` moves every later item up one place.

- Link: [Objects/listobject.c, lines 482 to 483 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listobject.c#L482-L483)
- Chapter: `linked-lists-linux-hlist`
- Quote: `for (i = n; --i >= where; )`; `items[i+1] = items[i];`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 26. `list.pop(index)` moves the later items down with `memmove`.

- Link: [Objects/listobject.c, lines 1514 to 1516 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listobject.c#L1514-L1516)
- Chapter: `linked-lists-linux-hlist`
- Quote: `memmove(&items[index], &items[index+1], (size_after_pop - index) * sizeof(PyObject *));`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 27. `__list_splice` ties the first and last nodes of the moved list to the two neighbours with four writes.

- Link: [include/linux/list.h, lines 523 to 535 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L523-L535)
- Chapter: `linked-lists-linux-list-sort`
- Quote: `struct list_head *first = list->next;`; `struct list_head *last = list->prev;`; `first->prev = prev;`; `prev->next = first;`; `last->next = next;`; `next->prev = last;`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 28. `list_splice` is "join two lists, this is designed for stacks" and calls `__list_splice(list, head, head->next)` if the list is not empty.

- Link: [include/linux/list.h, lines 537 to 547 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L537-L547)
- Chapter: `linked-lists-linux-list-sort`
- Quote: `join two lists, this is designed for stacks`; `if (!list_empty(list))`; `__list_splice(list, head, head->next);`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 29. `list_splice_tail` is for queues and calls `__list_splice(list, head->prev, head)`.

- Link: [include/linux/list.h, lines 549 to 559 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L549-L559)
- Chapter: `linked-lists-linux-list-sort`
- Quote: `join two lists, each list being a queue`; `__list_splice(list, head->prev, head);`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 30. The `_init` variants call `INIT_LIST_HEAD(list)` afterwards: "The list at @list is reinitialised".

- Link: [include/linux/list.h, lines 561 to 592 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L561-L592)
- Chapter: `linked-lists-linux-list-sort`
- Quote: `The list at @list is reinitialised`; `INIT_LIST_HEAD(list);`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 31. `merge` works on lists in "an intermediate format": "null-terminated, no reserved or sentinel head node, 'prev' links not maintained."

- Link: [lib/list_sort.c, lines 10 to 14 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/list_sort.c#L10-L14)
- Chapter: `linked-lists-linux-list-sort`
- Quote: `Returns a list organized in an intermediate format suited`; `null-terminated, no reserved or`; `sentinel head node, "prev" links not maintained.`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 32. `list_sort` converts to a null-terminated singly linked list with `head->prev->next = NULL;`.

- Link: [lib/list_sort.c, lines 193 to 194 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/list_sort.c#L193-L194)
- Chapter: `linked-lists-linux-list-sort`
- Quote: `Convert to a null-terminated singly-linked list.`; `head->prev->next = NULL;`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 33. `merge` keeps `tail = &head`, appends the smaller of `a` and `b`, and attaches the rest of the other list when one runs out.

- Link: [lib/list_sort.c, lines 15 to 42 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/list_sort.c#L15-L42)
- Chapter: `linked-lists-linux-list-sort`
- Quote: `struct list_head *head, **tail = &head;`; `*tail = a;`; `tail = &a->next;`; `*tail = b;`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 34. A tie takes `a`: "if equal, take 'a' -- important for sort stability".

- Link: [lib/list_sort.c, line 22 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/list_sort.c#L22)
- Chapter: `linked-lists-linux-list-sort`
- Quote: `if equal, take 'a' -- important for sort stability`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 35. `cmp` is "always called with the element that came first in the input in @a, and list_sort is a stable sort".

- Link: [lib/list_sort.c, lines 107 to 112 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/list_sort.c#L107-L112)
- Chapter: `linked-lists-linux-list-sort`
- Quote: `always called with the element that came first in the input in @a`; `list_sort is a stable sort`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 36. The last merge also rebuilds `prev`; the source says it "runs faster than the tidier alternatives of either a separate final prev-link restoration pass, or maintaining the prev links throughout".

- Link: [lib/list_sort.c, lines 44 to 99 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/list_sort.c#L44-L99)
- Chapter: `linked-lists-linux-list-sort`
- Quote: `Combine final list merge with restoration of standard doubly-linked`; `runs faster than the tidier alternatives of either a separate final`; `prev-link restoration pass, or maintaining the prev links`; `tail->next = head;`; `head->prev = tail;`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 37. The merge order "is as eager as possible while always performing at least 2:1 balanced merges"; the comment claims it avoids cache thrashing while "3*2^k elements can fit into the cache" and uses "0.2*n fewer comparisons" than a fully eager bottom-up sort.

- Link: [lib/list_sort.c, lines 129 to 136 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/list_sort.c#L129-L136)
- Chapter: `linked-lists-linux-list-sort`
- Quote: `This mergesort is as eager as possible while always performing at least`; `2:1 balanced merges.`; `it will avoid cache thrashing as long as 3*2^k elements can`; `0.2*n fewer comparisons`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 38. The file holds "the linked list validation and error reporting for LIST_HARDENED and DEBUG_LIST"; failures "indicate memory corruption (and possibly an exploit attempt)".

- Link: [lib/list_debug.c, lines 1 to 19 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/list_debug.c#L1-L19)
- Chapter: `linked-lists-linux-list-debug`
- Quote: `This file contains the linked list validation and error reporting for`; `LIST_HARDENED and DEBUG_LIST.`; `Failures here indicate memory corruption (and possibly an exploit`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 39. `__list_add_valid_or_report` tests, in order: `prev == NULL`, `next == NULL`, `next->prev != prev`, `prev->next != next`, `new == prev || new == next` ("list_add double add").

- Link: [lib/list_debug.c, lines 21 to 41 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/list_debug.c#L21-L41)
- Chapter: `linked-lists-linux-list-debug`
- Quote: `prev == NULL`; `next == NULL`; `next->prev != prev`; `prev->next != next`; `new == prev || new == next`; `list_add double add`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 40. `__list_del_entry_valid_or_report` tests, in order: `next == NULL`, `prev == NULL`, `next == LIST_POISON1`, `prev == LIST_POISON2`, `prev->next != entry`, `next->prev != entry`.

- Link: [lib/list_debug.c, lines 44 to 71 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/list_debug.c#L44-L71)
- Chapter: `linked-lists-linux-list-debug`
- Quote: `next == NULL`; `prev == NULL`; `next == LIST_POISON1`; `prev == LIST_POISON2`; `prev->next != entry`; `next->prev != entry`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 41. `__list_add` returns without linking if `__list_add_valid` fails.

- Link: [include/linux/list.h, lines 146 to 157 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L146-L157)
- Chapter: `linked-lists-linux-list-debug`
- Quote: `if (!__list_add_valid(new, prev, next))`; `return;`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 42. `__list_del_entry` returns without unlinking if `__list_del_entry_valid` fails.

- Link: [include/linux/list.h, lines 213 to 219 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L213-L219)
- Chapter: `linked-lists-linux-list-debug`
- Quote: `if (!__list_del_entry_valid(entry))`; `return;`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 43. `list_del` calls `__list_del_entry(entry)` and then writes the poison values unconditionally.

- Link: [include/linux/list.h, lines 227 to 232 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L227-L232)
- Chapter: `linked-lists-linux-list-debug`
- Quote: `__list_del_entry(entry);`; `entry->next = LIST_POISON1;`; `entry->prev = LIST_POISON2;`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 44. `list_del_init` calls `__list_del_entry(entry)` and then `INIT_LIST_HEAD(entry)` unconditionally.

- Link: [include/linux/list.h, lines 285 to 289 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L285-L289)
- Chapter: `linked-lists-linux-list-debug`
- Quote: `__list_del_entry(entry);`; `INIT_LIST_HEAD(entry);`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 45. The checks are compiled in under `#ifdef CONFIG_LIST_HARDENED`.

- Link: [include/linux/list.h, line 41 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L41)
- Chapter: `linked-lists-linux-list-debug`
- Quote: `#ifdef CONFIG_LIST_HARDENED`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 46. Otherwise both validators are stubs that return `true`.

- Link: [include/linux/list.h, lines 127 to 138 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/list.h#L127-L138)
- Chapter: `linked-lists-linux-list-debug`
- Quote: `#else`; `return true;`; `#endif`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 47. `DEBUG_LIST` "trades better quality error reports for performance"; "If you care about performance, you should only enable CONFIG_LIST_HARDENED instead."

- Link: [lib/Kconfig.debug, lines 1679 to 1689 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/Kconfig.debug#L1679-L1689)
- Chapter: `linked-lists-linux-list-debug`
- Quote: `config DEBUG_LIST`; `This option trades better quality error reports for performance, and`; `you should only enable CONFIG_LIST_HARDENED instead.`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 48. `LIST_HARDENED` is "Minimal integrity checking in the linked-list manipulation routines" for corruption "not guaranteed to result in an immediate access fault".

- Link: [security/Kconfig.hardening, lines 284 to 291 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/security/Kconfig.hardening#L284-L291)
- Chapter: `linked-lists-linux-list-debug`
- Quote: `config LIST_HARDENED`; `Minimal integrity checking in the linked-list manipulation routines`; `immediate access fault.`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 49. Each cached call is an `lru_list_elem` with `prev`, `next`, `hash`, `key` and `result`.

- Link: [Modules/_functoolsmodule.c, lines 814 to 819 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Modules/_functoolsmodule.c#L814-L819)
- Chapter: `linked-lists-cpython-lru`
- Quote: `typedef struct lru_list_elem {`; `struct lru_list_elem *prev, *next;`; `PyObject *key, *result;`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 50. The cache object holds `lru_list_elem root;`, the dict `cache`, and `hits`, `misses`, `maxsize`.

- Link: [Modules/_functoolsmodule.c, lines 847 to 862 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Modules/_functoolsmodule.c#L847-L862)
- Chapter: `linked-lists-cpython-lru`
- Quote: `lru_list_elem root;`; `PyObject *cache;`; `Py_ssize_t hits;`; `Py_ssize_t maxsize;`; `Py_ssize_t misses;`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 51. The dict lookup returns the link itself.

- Link: [Modules/_functoolsmodule.c, line 1051 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Modules/_functoolsmodule.c#L1051)
- Chapter: `linked-lists-cpython-lru`
- Quote: `link  = (lru_list_elem *)_PyDict_GetItem_KnownHash(self->cache, key, hash);`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 52. `extract_link` unlinks a node, `append_link` inserts it just before `root`, `prepend_link` just after.

- Link: [Modules/_functoolsmodule.c, lines 976 to 1003 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Modules/_functoolsmodule.c#L976-L1003)
- Chapter: `linked-lists-cpython-lru`
- Quote: `lru_cache_extract_link(lru_list_elem *link)`; `last->next = root->prev = link;`; `first->prev = root->next = link;`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 53. A hit extracts the link, appends it, counts a hit and returns the stored result.

- Link: [Modules/_functoolsmodule.c, lines 1051 to 1059 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Modules/_functoolsmodule.c#L1051-L1059)
- Chapter: `linked-lists-cpython-lru`
- Quote: `lru_cache_extract_link(link);`; `lru_cache_append_link(self, link);`; `result = link->result;`; `self->hits++;`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 54. A miss counts a miss and calls the function.

- Link: [Modules/_functoolsmodule.c, lines 1065 to 1066 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Modules/_functoolsmodule.c#L1065-L1066)
- Chapter: `linked-lists-cpython-lru`
- Quote: `self->misses++;`; `PyObject_Call(self->func, args, kwds);`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 55. With room, a miss makes a new link, stores it in the dict and appends it.

- Link: [Modules/_functoolsmodule.c, lines 1092 to 1119 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Modules/_functoolsmodule.c#L1092-L1119)
- Chapter: `linked-lists-cpython-lru`
- Quote: `PyDict_GET_SIZE(self->cache) < self->maxsize`; `Cache is not full, so put the result in a new link`; `lru_cache_append_link(self, link);`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 56. A full cache reuses the oldest link: "we reuse the link for the new key and result and move it to front of the cache".

- Link: [Modules/_functoolsmodule.c, lines 1121 to 1124 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Modules/_functoolsmodule.c#L1121-L1124)
- Chapter: `linked-lists-cpython-lru`
- Quote: `Rather than free the old link and allocate a new one, we reuse the link for the new key and result and move it`; `to front of the cache to mark it as recently used.`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 57. The code takes `link = self->root.next;`, extracts it and pops its key from the dict.

- Link: [Modules/_functoolsmodule.c, lines 1136 to 1143 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Modules/_functoolsmodule.c#L1136-L1143)
- Chapter: `linked-lists-cpython-lru`
- Quote: `link = self->root.next;`; `lru_cache_extract_link(link);`; `_PyDict_Pop_KnownHash`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 58. It overwrites the link's `hash`, `key` and `result`.

- Link: [Modules/_functoolsmodule.c, lines 1175 to 1177 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Modules/_functoolsmodule.c#L1175-L1177)
- Chapter: `linked-lists-cpython-lru`
- Quote: `link->hash = hash;`; `link->key = key;`; `link->result = result;`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 59. It stores the same link in the dict under the new key and appends it.

- Link: [Modules/_functoolsmodule.c, lines 1183 to 1194 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Modules/_functoolsmodule.c#L1183-L1194)
- Chapter: `linked-lists-cpython-lru`
- Quote: `_PyDict_SetItem_KnownHash(self->cache, key, (PyObject *)link,`; `lru_cache_append_link(self, link);`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 60. A negative `maxsize` becomes 0, and 0 selects `uncached_lru_cache_wrapper`.

- Link: [Modules/_functoolsmodule.c, lines 1236 to 1246 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Modules/_functoolsmodule.c#L1236-L1246)
- Chapter: `linked-lists-cpython-lru`
- Quote: `if (maxsize < 0) {`; `maxsize = 0;`; `wrapper = uncached_lru_cache_wrapper;`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 61. `uncached_lru_cache_wrapper` only counts a miss and calls the function.

- Link: [Modules/_functoolsmodule.c, lines 925 to 935 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Modules/_functoolsmodule.c#L925-L935)
- Chapter: `linked-lists-cpython-lru`
- Quote: `uncached_lru_cache_wrapper`; `self->misses++;`; `PyObject_Call(self->func, args, kwds);`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 62. `cache_info` returns hits, misses, maxsize and the dict's size.

- Link: [Modules/_functoolsmodule.c, lines 1353 to 1366 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Modules/_functoolsmodule.c#L1353-L1366)
- Chapter: `linked-lists-cpython-lru`
- Quote: `_self->hits, _self->misses, _self->maxsize,`; `PyDict_GET_SIZE(_self->cache)`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 62b. The documentation says `cache_info` shows "hits, misses, maxsize and currsize".

- Link: [Doc/library/functools.rst, lines 204 to 205 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Doc/library/functools.rst#L204-L205)
- Chapter: `linked-lists-cpython-lru`
- Quote: "hits, misses, maxsize and currsize". reST markup dropped: the source writes `*hits*, *misses*,` at the end of line 204 and `*maxsize* and *currsize*.` on line 205.
- Type 2. Status: sourced, quote checked against the fetched file.

### Claim 63. `cache_clear` ("Clear the cache and cache statistics") sets `hits = misses = 0` and clears the dict and the list.

- Link: [Modules/_functoolsmodule.c, lines 1368 to 1385 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Modules/_functoolsmodule.c#L1368-L1385)
- Chapter: `linked-lists-cpython-lru`
- Quote: `Clear the cache and cache statistics`; `_self->hits = _self->misses = 0;`; `PyDict_Clear(_self->cache);`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 64. Redis "uses an approximation of the LRU algorithm that runs in constant memory", sampling N keys, "usually in around 5".

- Link: [src/evict.c, lines 102 to 107 (Redis 7.2.0)](https://github.com/redis/redis/blob/29622276ecd7b74312798e6772744858a8a6f9bf/src/evict.c#L102-L107)
- Chapter: `linked-lists-cpython-lru`
- Quote: `Redis uses an approximation of the LRU algorithm that runs in constant`; `we sample N keys (with`; `N very small, usually in around 5)`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 65. `#define LRU_BITS 24`.

- Link: [src/server.h, line 892 (Redis 7.2.0)](https://github.com/redis/redis/blob/29622276ecd7b74312798e6772744858a8a6f9bf/src/server.h#L892)
- Chapter: `linked-lists-cpython-lru`
- Quote: `#define LRU_BITS 24`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 66. Each `redisObject` has `unsigned lru:LRU_BITS;`.

- Link: [src/server.h, lines 899 to 905 (Redis 7.2.0)](https://github.com/redis/redis/blob/29622276ecd7b74312798e6772744858a8a6f9bf/src/server.h#L899-L905)
- Chapter: `linked-lists-cpython-lru`
- Quote: `struct redisObject {`; `unsigned lru:LRU_BITS;`
- Type 1. Status: sourced, quote checked against the fetched file.

### Claim 67. The decorator wraps a function "with a memoizing callable that saves up to the maxsize most recent calls"; "An LRU (least recently used) cache works best when the most recent calls are the best predictors of upcoming calls"; `cache_info()` is a named tuple "showing hits, misses, maxsize and currsize".

- Link: [functools.lru_cache, Python 3.13 docs](https://docs.python.org/3.13/library/functools.html#functools.lru_cache)
- Chapter: `linked-lists-cpython-lru`
- Quote: "memoizing callable that saves up to the maxsize most recent calls"; "An LRU (least recently used) cache works best when the most recent calls are the best predictors of upcoming calls"; "showing hits, misses, maxsize and currsize"
- Type 2. Status: sourced, quote checked against the fetched file.
