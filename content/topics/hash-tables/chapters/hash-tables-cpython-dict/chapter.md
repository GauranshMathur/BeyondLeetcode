# CPython: a dict that probes

A Python `dict` answers `d[key]` in a time that does not grow with the size of `d`. This Chapter reads how CPython 3.13.0 does it with **open addressing**: every entry lives in the table itself, and a key that finds its slot taken goes looking for another one by a fixed rule. In the Problems you build that table and watch where keys land.

## Two arrays, not one

A dict is two arrays. The CPython source says so in the comment above its table layout: "dk_indices is actual hashtable. It holds index in entries, or DKIX_EMPTY(-1) or DKIX_DUMMY(-2)." The entries array holds the keys and values, and "Its length is USABLE_FRACTION(dk_size)." ([Objects/dictobject.c, lines 35 to 45](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L35-L45))

The comment names the three things a slot of `dk_indices` can hold. An **Unused** slot "does not hold an active (key, value) pair now and never did." An **Active** slot holds an index into the entries. A **Dummy** slot "previously held an active (key, value) pair, but that was deleted". ([lines 66 to 83](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L66-L83)) The table's size is stored as a power of two, `1 << dk_log2_size` ([Include/internal/pycore_dict.h, line 206](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Include/internal/pycore_dict.h#L204-L206)), and the starting size is 8: "8 allows dicts with no more than 5 active entries". ([lines 108 to 116](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L108-L116))

## The first slot is the key's low bits

CPython does not scramble the hash of an int. The source says so: "its most important hash functions (for ints) are very regular in common cases", and `[hash(i) for i in range(4)]` is `[0, 1, 2, 3]`. The start slot is then the last bits of the hash: "in a table of size 2**i, taking the low-order i bits as the initial table index is extremely fast, and there are no collisions at all for dicts indexed by a contiguous range of ints." ([lines 289 to 301](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L289-L301)) In C, `hash & mask` where `mask` is the size minus 1. ([do_lookup, lines 1052 to 1058](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L1052-L1058))

The comment bets that the first slot usually works: "the table load factor is kept under 2/3, so the odds are solidly in our favor". ([lines 310 to 315](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L310-L315)) A lookup that finds its key on the first slot costs O(1). That is the expected case, not a guarantee: in the worst case a lookup visits every slot, O(n).

## When the slot is taken

Taking only the low bits has a weakness, and the source shows it: for the keys `[i << 16 for i in range(20000)]`, "the last 15 bits of every hash code are all 0: they *all* map to the same table index." ([lines 303 to 308](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L303-L308)) So the rule for the next slot has two parts. The first is the recurrence `j = ((5*j) + 1) mod 2**i`, which visits every slot of the table exactly once. For a table of 8 the order is `0 -> 1 -> 6 -> 7 -> 4 -> 5 -> 2 -> 3`. ([lines 317 to 331](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L317-L331)) The second part brings in the other bits of the hash: start a variable `perturb` at the whole hash and, before each step, shift it right by 5 and add it in. ([lines 340 to 346](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L340-L346)) The lookup loop does exactly that:

```c
perturb >>= PERTURB_SHIFT;
i = mask & (i*5 + perturb + 1);
```

([do_lookup, lines 1073 to 1074](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L1073-L1074))

The comment explains the choice of 5: it "was 'the best' in minimizing total collisions across experiments Tim Peters ran (on both normal and pathological cases), but 4 and 6 weren't significantly worse." ([lines 357 to 362](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L357-L362))

A worked case in a table of 8. Key 3 goes to slot 3. Key 11 also starts at slot `11 & 7 = 3`, which is taken. `perturb` becomes `11 >> 5 = 0`, so the next slot is `(3*5 + 0 + 1) & 7 = 0`. Key 19 starts at 3 (taken), then 0 (taken), then `(0*5 + 0 + 1) & 7 = 1`. For small keys `perturb` is 0 after the first shift, so only the recurrence matters. For keys with high bits set, `perturb` is not 0 for several steps and moves the key off the path its neighbours take.

A lookup stops at the first Unused slot: the key cannot be further along. That is why "there must be at least one Unused slot (NULL key) in the table" for the search to end. ([lines 142 to 147](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L142-L147))

## Deleting leaves a Dummy

If deleting a key made its slot Unused again, any key that had probed past it would become unreachable. The source states this reason: "Dummy slots cannot be made Unused again else the probe sequence in case of collision would have no way to know they were once active." ([lines 78 to 83](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L78-L83)) So a delete writes the Dummy marker into the slot. ([line 2618](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L2618))

Lookups walk through Dummy slots. Inserting a new key does not have to: the loop that finds a place for it stops at any slot that is not Active, so a Dummy slot is reused. ([find_empty_slot, lines 1657 to 1669](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L1657-L1669), with `is_unusable_slot` at [lines 1643 to 1650](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L1643-L1650)) The comment adds that "in free-threaded builds dummy slots are not re-used", so this holds for the default build the Build follows. ([lines 84 to 85](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L84-L85))

## The order comes from the entries

The slots of `dk_indices` are scattered by the probe rule, so their order means nothing. The keys and values sit in the entries array, which is "mostly append only", so "we can get insertion order by just iterating dk_entries." ([lines 92 to 95](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L92-L95)) A new key is written at row `dk_nentries`, and the count of used rows goes up by one. ([insert_combined_dict, lines 1696 to 1711](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L1696-L1711)) The language documents the visible result: "Dictionaries preserve insertion order. Note that updating a key does not affect the order. Keys added after deletion are inserted at the end." ([Built-in types, Mapping Types, Python 3.13](https://docs.python.org/3.13/library/stdtypes.html#mapping-types-dict))

That gives you three Problems. First the probe rule, then the Dummy slot, then the entries array that keeps the order.
