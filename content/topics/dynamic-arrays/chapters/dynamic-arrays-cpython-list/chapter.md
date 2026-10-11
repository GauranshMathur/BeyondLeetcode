# CPython: a list that leaves room

A Python `list` has no size limit that you choose. You call `append` and it works, a million times in a row. Underneath, memory is handed out in blocks of a fixed size, so something has to decide what happens when the block is full. This Chapter reads that decision in CPython 3.13.0, the standard Python interpreter. In the Problems you build the same thing and count what it costs.

## A list is one block of slots

CPython's own FAQ says it plainly: "CPython's lists are really variable-length arrays, not Lisp-style linked lists." ([Design and History FAQ, Python 3.13](https://docs.python.org/3.13/faq/design.html#how-are-lists-implemented-in-cpython))

The list object keeps two things: a pointer to a block of slots (`ob_item`), and the number of slots in that block (`allocated`). How many slots are in use is a separate number, `ob_size`. The comment in the struct reads: "ob_item contains space for 'allocated' elements. The number currently in use is ob_size." ([Include/cpython/listobject.h, lines 5 to 22](https://github.com/python/cpython/blob/v3.13.0/Include/cpython/listobject.h#L5-L22))

So a list has a **length** (slots in use) and a **capacity** (slots it owns). The same comment gives the rule between them: `0 <= ob_size <= allocated`.

## Append: the fast path and the full path

When there is a free slot, `append` writes into it and adds one to the length. The check is one line, `if (allocated > len)`. ([Include/internal/pycore_list.h, lines 22 to 40](https://github.com/python/cpython/blob/v3.13.0/Include/internal/pycore_list.h#L22-L40))

When the block is full, `append` calls `list_resize(self, len + 1)` to get a bigger block, then stores the item. ([Objects/listobject.c, lines 503 to 515](https://github.com/python/cpython/blob/v3.13.0/Objects/listobject.c#L503-L515))

## How much bigger?

`list_resize` does not ask for one more slot. It asks for more than it needs:

```c
new_allocated = ((size_t)newsize + (newsize >> 3) + 6) & ~(size_t)3;
```

([Objects/listobject.c, line 119](https://github.com/python/cpython/blob/v3.13.0/Objects/listobject.c#L109-L119))

Read it as: the size needed, plus one eighth of it, plus 6, rounded down to a multiple of 4. `newsize >> 3` is `newsize` divided by 8 with the remainder dropped, and `& ~3` clears the two lowest bits.

Take a list whose 4 slots are all in use. The next `append` needs `newsize = 5`, so the new capacity is `(5 + 0 + 6) & ~3`, which is `11 & ~3 = 8`. The comment above the formula lists what you get if you keep appending: "The growth pattern is:  0, 4, 8, 16, 24, 32, 40, 52, 64, 76, ..." ([same file, line 115](https://github.com/python/cpython/blob/v3.13.0/Objects/listobject.c#L109-L119))

## Why leave room at all

Getting a bigger block can mean moving every item to a new place. In the default build, `list_resize` hands the job to `PyMem_Realloc` ([line 158](https://github.com/python/cpython/blob/v3.13.0/Objects/listobject.c#L154-L171)), and the comment above the function warns that "self->ob_item may change" ([lines 90 to 91](https://github.com/python/cpython/blob/v3.13.0/Objects/listobject.c#L88-L92)). Your Build counts the worst case: every time the block changes, every item is copied once.

Now compare two rules for 1,000 appends, starting from an empty list.

- **Grow by one slot.** The block is full on every append, so the appends copy 0, 1, 2, ... 999 items. That is 499,500 copies in total. Double the appends and the copies go up four times.
- **Grow by a share of the size.** With doubling, the block changes only at lengths 1, 2, 4, 8, ... 512, copying 1 + 2 + 4 + ... + 512 = 1,023 items in total.

One single append can still be slow: the one that fills the block copies every item, which is O(n) in the **worst case**. But the total for n appends stays proportional to n, so the cost per append, averaged over the whole run, is constant. That average over a run is what **amortised** means: append is amortised O(1). CPython's comment says the same about its own rule: "The over-allocation is mild, but is enough to give linear-time amortized behavior over a long sequence of appends()". ([lines 109 to 113](https://github.com/python/cpython/blob/v3.13.0/Objects/listobject.c#L109-L119))

The share matters. If each new block is `g` times the old one, the last move copies fewer than n items, the one before it fewer than n/g, then n/g², and so on. That sum is less than n × g / (g - 1). Doubling (g = 2) gives at most 2 copies per append. CPython adds about one eighth (g is about 1.125), which gives at most 9. CPython pays more copies and wastes less memory: at most about one eighth of the block sits empty.

You will measure these numbers yourself in Problem 2 and Problem 3.

## Giving memory back

`list.pop()` also calls `list_resize`, with the smaller size. ([Objects/listobject.c, lines 1505 to 1518](https://github.com/python/cpython/blob/v3.13.0/Objects/listobject.c#L1505-L1518)) The first thing `list_resize` does is decide whether to keep the block:

```c
if (allocated >= newsize && newsize >= (allocated >> 1)) {
```

([lines 99 to 107](https://github.com/python/cpython/blob/v3.13.0/Objects/listobject.c#L99-L107))

The block is kept while the list is at least half full. Only when the length drops below half the capacity does the list move to a smaller block, sized by the same formula as before. Popping the last item frees the block completely: `pop` calls `list_clear` when the size after the pop is 0 (lines 1508 to 1510, same link as `pop` above).

The gap between "grow when full" and "shrink when under half" is deliberate. Picture a list of 17 items in a block of 24. If it shrank as soon as it could, an append followed by a pop, repeated, could change blocks every time. With the half rule, the list has to lose a lot of items before it shrinks, and then gain a lot before it grows again.

## What the Build leaves out

Your Build stores integers. A CPython list stores pointers to objects, which is why every slot is the same size whatever you put in the list. The struct comment calls `ob_item` a "Vector of pointers to list elements". ([Include/cpython/listobject.h, line 7](https://github.com/python/cpython/blob/v3.13.0/Include/cpython/listobject.h#L5-L22))
