# Hash tables: sources

Research for the Topic "hash tables" (card C100, issue #259). Every claim about a real system that the four Chapters make is listed below with its source. The Problems follow the same sources: the rules in each statement are the rules in the code quoted here.

Tags, resolved to commit SHAs with `git ls-remote`. Every code link in the Chapters uses the SHA, never a branch or a tag.

| Project | Tag | Commit |
|---|---|---|
| CPython | `v3.13.0` | `60403a5409ff2c3f3b07dd2ca91a7a3e096839c7` (annotated tag object `3f27099d916c7b885e3daf1fabedcc119462014d`) |
| CPython | `v3.13.18` | `0d4bd512fc429e3d4eacdd113c975e161f21644d` (annotated tag object `c4aea32388690378deb747cd4afe01e3253f0696`) |
| OpenJDK | `jdk-21+35` | `890adb6410dab4606a4f26a942aed02fb2f55387` (tag object `07687d169a5e181789869817f10f3e8a4a4c30a9`) |
| Rust docs | `1.80.0` | the docs.rs-style path `doc.rust-lang.org/1.80.0/` |
| Python docs | `3.13` | `docs.python.org/3.13/` |

Method. Code files were fetched with `curl -fsSL https://raw.githubusercontent.com/<org>/<repo>/<sha>/<path>` and read with `awk 'NR>=a&&NR<=b'`. Docs pages were fetched with `curl` and the HTML tags stripped with a Python regex, so docs quotes carry an anchor, not a line number. Nothing was fetched through a summariser. Types: 1 source code, 2 official documentation, 3 original design document, 4 a talk or post by the system's own engineers or the people who reported the problem.

Types 1 to 4 are the four allowed kinds in `docs/content-standards.md` (permalink, docs, paper or design doc, builders' talk or post).

## Observed, not cited

These were run to check the Build against the real systems. They are not claims in a Chapter, and no learner is asked to trust them.

- **CPython 3.13.0, table size.** Using the `python:3.13.0-slim` image (Python 3.13.0), 300 random sequences of up to 80 `d[k] = 1` and `del d[k]` operations were replayed against a real `dict`, reading the size with `sys.getsizeof`, which takes the values 224, 352, 632, 1168 and 2264 for tables of 8, 16, 32, 64 and 128 slots. The same sequences were run through the Reference Code (Python) with `resize on` and the `cap` after every operation: the two agreed at every step. This includes the 16-slot rebuild of a dict with 1 or 2 live keys; the 3.13.18 image (`python:3.13-slim`) rebuilds to 8 slots, as its fixed source says.
- **Hash of a multiple of P.** `hash(2**61 - 1)` is `0` on a 64-bit build (run on Python 3.14.7 locally; the reduction rule is in `Python/pyhash.c`, cited).
- **Java.** No JDK was installed on the build machine, so the Java-style Reference Code was not compared with a real `HashMap`. It was written from the quoted source lines and is checked by the Codex review (see the PR).

---

### Claim 1. The entries array holds the keys and values, and "Its length is USABLE_FRACTION(dk_size).

- Link: [Objects/dictobject.c, lines 35 to 45 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L35-L45)
- Chapter: `hash-tables-cpython-dict`
- Quote:

Lines 35 to 45, fetched from the pinned commit with `curl` and read with `awk`:

```
35: dk_indices is actual hashtable.  It holds index in entries, or DKIX_EMPTY(-1)
36: or DKIX_DUMMY(-2).
37: Size of indices is dk_size.  Type of each index in indices is vary on dk_size:
38: 
39: * int8  for          dk_size <= 128
40: * int16 for 256   <= dk_size <= 2**15
41: * int32 for 2**16 <= dk_size <= 2**31
42: * int64 for 2**32 <= dk_size
43: 
44: dk_entries is array of PyDictKeyEntry when dk_kind == DICT_KEYS_GENERAL or
45: PyDictUnicodeEntry otherwise. Its length is USABLE_FRACTION(dk_size).
```

- Type: 1
- Status: sourced

### Claim 2. A **Dummy** slot "previously held an active (key, value) pair, but that was deleted".

- Link: [Objects/dictobject.c, lines 66 to 83 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L66-L83)
- Chapter: `hash-tables-cpython-dict`
- Quote:

Lines 66 to 83, fetched from the pinned commit with `curl` and read with `awk`:

```
66: There are four kinds of slots in the table (slot is index, and
67: DK_ENTRIES(keys)[index] if index >= 0):
68: 
69: 1. Unused.  index == DKIX_EMPTY
70:    Does not hold an active (key, value) pair now and never did.  Unused can
71:    transition to Active upon key insertion.  This is each slot's initial state.
72: 
73: 2. Active.  index >= 0, me_key != NULL and me_value != NULL
74:    Holds an active (key, value) pair.  Active can transition to Dummy or
75:    Pending upon key deletion (for combined and split tables respectively).
76:    This is the only case in which me_value != NULL.
77: 
78: 3. Dummy.  index == DKIX_DUMMY  (combined only)
79:    Previously held an active (key, value) pair, but that was deleted and an
80:    active pair has not yet overwritten the slot.  Dummy can transition to
81:    Active upon key insertion.  Dummy slots cannot be made Unused again
82:    else the probe sequence in case of collision would have no way to know
83:    they were once active.
```

- Type: 1
- Status: sourced

### Claim 3. The table's size is stored as a power of two, `1 << dk_log2_size` , and the starting size is 8: "8 allows dicts with no more than 5 active entries".

- Link: [Include/internal/pycore_dict.h, lines 204 to 206 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Include/internal/pycore_dict.h#L204-L206)
- Chapter: `hash-tables-cpython-dict`
- Quote:

Lines 204 to 206, fetched from the pinned commit with `curl` and read with `awk`:

```
204: #define DK_LOG_SIZE(dk)  _Py_RVALUE((dk)->dk_log2_size)
205: #if SIZEOF_VOID_P > 4
206: #define DK_SIZE(dk)      (((int64_t)1)<<DK_LOG_SIZE(dk))
```

- Type: 1
- Status: sourced

### Claim 4. The table's size is stored as a power of two, `1 << dk_log2_size` , and the starting size is 8: "8 allows dicts with no more than 5 active entries".

- Link: [Objects/dictobject.c, lines 108 to 116 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L108-L116)
- Chapter: `hash-tables-cpython-dict`
- Quote:

Lines 108 to 116, fetched from the pinned commit with `curl` and read with `awk`:

```
108: /* PyDict_MINSIZE is the starting size for any new dict.
109:  * 8 allows dicts with no more than 5 active entries; experiments suggested
110:  * this suffices for the majority of dicts (consisting mostly of usually-small
111:  * dicts created to pass keyword arguments).
112:  * Making this 8, rather than 4 reduces the number of resizes for most
113:  * dictionaries, without any significant extra memory use.
114:  */
115: #define PyDict_LOG_MINSIZE 3
116: #define PyDict_MINSIZE 8
```

- Type: 1
- Status: sourced

### Claim 5. The start slot is then the last bits of the hash: "in a table of size 2**i, taking the low-order i bits as the initial table index is extremely fast, and there are no collisions at all for dicts indexed by a contiguous range of ints.

- Link: [Objects/dictobject.c, lines 289 to 301 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L289-L301)
- Chapter: `hash-tables-cpython-dict`
- Quote:

Lines 289 to 301, fetched from the pinned commit with `curl` and read with `awk`:

```
289: Major subtleties ahead:  Most hash schemes depend on having a "good" hash
290: function, in the sense of simulating randomness.  Python doesn't:  its most
291: important hash functions (for ints) are very regular in common
292: cases:
293: 
294:   >>>[hash(i) for i in range(4)]
295:   [0, 1, 2, 3]
296: 
297: This isn't necessarily bad!  To the contrary, in a table of size 2**i, taking
298: the low-order i bits as the initial table index is extremely fast, and there
299: are no collisions at all for dicts indexed by a contiguous range of ints. So
300: this gives better-than-random behavior in common cases, and that's very
301: desirable.
```

- Type: 1
- Status: sourced

### Claim 6. In C, `hash & mask` where `mask` is the size minus 1.

- Link: [Objects/dictobject.c, lines 1052 to 1058 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L1052-L1058)
- Chapter: `hash-tables-cpython-dict`
- Quote:

Lines 1052 to 1058, fetched from the pinned commit with `curl` and read with `awk`:

```
1052: do_lookup(PyDictObject *mp, PyDictKeysObject *dk, PyObject *key, Py_hash_t hash,
1053:           int (*check_lookup)(PyDictObject *, PyDictKeysObject *, void *, Py_ssize_t ix, PyObject *key, Py_hash_t))
1054: {
1055:     void *ep0 = _DK_ENTRIES(dk);
1056:     size_t mask = DK_MASK(dk);
1057:     size_t perturb = hash;
1058:     size_t i = (size_t)hash & mask;
```

- Type: 1
- Status: sourced

### Claim 7. The comment bets that the first slot usually works: "the table load factor is kept under 2/3, so the odds are solidly in our favor".

- Link: [Objects/dictobject.c, lines 310 to 315 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L310-L315)
- Chapter: `hash-tables-cpython-dict`
- Quote:

Lines 310 to 315, fetched from the pinned commit with `curl` and read with `awk`:

```
310: But catering to unusual cases should not slow the usual ones, so we just take
311: the last i bits anyway.  It's up to collision resolution to do the rest.  If
312: we *usually* find the key we're looking for on the first try (and, it turns
313: out, we usually do -- the table load factor is kept under 2/3, so the odds
314: are solidly in our favor), then it makes best sense to keep the initial index
315: computation dirt cheap.
```

- Type: 1
- Status: sourced

### Claim 8. Taking only the low bits has a weakness, and the source shows it: for the keys `[i << 16 for i in range(20000)]`, "the last 15 bits of every hash code are all 0: they *all* map to the same table index.

- Link: [Objects/dictobject.c, lines 303 to 308 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L303-L308)
- Chapter: `hash-tables-cpython-dict`
- Quote:

Lines 303 to 308, fetched from the pinned commit with `curl` and read with `awk`:

```
303: OTOH, when collisions occur, the tendency to fill contiguous slices of the
304: hash table makes a good collision resolution strategy crucial.  Taking only
305: the last i bits of the hash code is also vulnerable:  for example, consider
306: the list [i << 16 for i in range(20000)] as a set of keys.  Since ints are
307: their own hash codes, and this fits in a dict of size 2**15, the last 15 bits
308:  of every hash code are all 0:  they *all* map to the same table index.
```

- Type: 1
- Status: sourced

### Claim 9. For a table of 8 the order is `0 -> 1 -> 6 -> 7 -> 4 -> 5 -> 2 -> 3`.

- Link: [Objects/dictobject.c, lines 317 to 331 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L317-L331)
- Chapter: `hash-tables-cpython-dict`
- Quote:

Lines 317 to 331, fetched from the pinned commit with `curl` and read with `awk`:

```
317: The first half of collision resolution is to visit table indices via this
318: recurrence:
319: 
320:     j = ((5*j) + 1) mod 2**i
321: 
322: For any initial j in range(2**i), repeating that 2**i times generates each
323: int in range(2**i) exactly once (see any text on random-number generation for
324: proof).  By itself, this doesn't help much:  like linear probing (setting
325: j += 1, or j -= 1, on each loop trip), it scans the table entries in a fixed
326: order.  This would be bad, except that's not the only thing we do, and it's
327: actually *good* in the common cases where hash keys are consecutive.  In an
328: example that's really too small to make this entirely clear, for a table of
329: size 2**3 the order of indices is:
330: 
331:     0 -> 1 -> 6 -> 7 -> 4 -> 5 -> 2 -> 3 -> 0 [and here it's repeating]
```

- Type: 1
- Status: sourced

### Claim 10. The second part brings in the other bits of the hash: start a variable `perturb` at the whole hash and, before each step, shift it right by 5 and add it in.

- Link: [Objects/dictobject.c, lines 340 to 346 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L340-L346)
- Chapter: `hash-tables-cpython-dict`
- Quote:

Lines 340 to 346, fetched from the pinned commit with `curl` and read with `awk`:

```
340: The other half of the strategy is to get the other bits of the hash code
341: into play.  This is done by initializing a (unsigned) vrbl "perturb" to the
342: full hash code, and changing the recurrence to:
343: 
344:     perturb >>= PERTURB_SHIFT;
345:     j = (5*j) + 1 + perturb;
346:     use j % 2**i as the next table index;
```

- Type: 1
- Status: sourced

### Claim 11. The lookup loop that follows the recurrence reads `perturb >>= PERTURB_SHIFT; i = mask & (i*5 + perturb + 1);`.

- Link: [Objects/dictobject.c, lines 1073 to 1074 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L1073-L1074)
- Chapter: `hash-tables-cpython-dict`
- Quote:

Lines 1073 to 1074, fetched from the pinned commit with `curl` and read with `awk`:

```
1073:         perturb >>= PERTURB_SHIFT;
1074:         i = mask & (i*5 + perturb + 1);
```

- Type: 1
- Status: sourced

### Claim 12. The comment explains the choice of 5: it "was 'the best' in minimizing total collisions across experiments Tim Peters ran (on both normal and pathological cases), but 4 and 6 weren't significantly worse.

- Link: [Objects/dictobject.c, lines 357 to 362 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L357-L362)
- Chapter: `hash-tables-cpython-dict`
- Quote:

Lines 357 to 362, fetched from the pinned commit with `curl` and read with `awk`:

```
357: Selecting a good value for PERTURB_SHIFT is a balancing act.  You want it
358: small so that the high bits of the hash code continue to affect the probe
359: sequence across iterations; but you want it large so that in really bad cases
360: the high-order hash bits have an effect on early iterations.  5 was "the
361: best" in minimizing total collisions across experiments Tim Peters ran (on
362: both normal and pathological cases), but 4 and 6 weren't significantly worse.
```

- Type: 1
- Status: sourced

### Claim 13. That is why "there must be at least one Unused slot (NULL key) in the table" for the search to end.

- Link: [Objects/dictobject.c, lines 142 to 147 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L142-L147)
- Chapter: `hash-tables-cpython-dict`
- Quote:

Lines 142 to 147, fetched from the pinned commit with `curl` and read with `awk`:

```
142: /*
143: To ensure the lookup algorithm terminates, there must be at least one Unused
144: slot (NULL key) in the table.
145: To avoid slowing down lookups on a near-full table, we resize the table when
146: it's USABLE_FRACTION (currently two-thirds) full.
147: */
```

- Type: 1
- Status: sourced

### Claim 14. The source states this reason: "Dummy slots cannot be made Unused again else the probe sequence in case of collision would have no way to know they were once active.

- Link: [Objects/dictobject.c, lines 78 to 83 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L78-L83)
- Chapter: `hash-tables-cpython-dict`
- Quote:

Lines 78 to 83, fetched from the pinned commit with `curl` and read with `awk`:

```
78: 3. Dummy.  index == DKIX_DUMMY  (combined only)
79:    Previously held an active (key, value) pair, but that was deleted and an
80:    active pair has not yet overwritten the slot.  Dummy can transition to
81:    Active upon key insertion.  Dummy slots cannot be made Unused again
82:    else the probe sequence in case of collision would have no way to know
83:    they were once active.
```

- Type: 1
- Status: sourced

### Claim 15. So a delete writes the Dummy marker into the slot.

- Link: [Objects/dictobject.c, line 2618 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L2618)
- Chapter: `hash-tables-cpython-dict`
- Quote:

Lines 2618 to 2618, fetched from the pinned commit with `curl` and read with `awk`:

```
2618:         dictkeys_set_index(mp->ma_keys, hashpos, DKIX_DUMMY);
```

- Type: 1
- Status: sourced

### Claim 16. Inserting a new key does not have to: the loop that finds a place for it stops at any slot that is not Active, so a Dummy slot is reused.

- Link: [Objects/dictobject.c, lines 1657 to 1669 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L1657-L1669)
- Chapter: `hash-tables-cpython-dict`
- Quote:

Lines 1657 to 1669, fetched from the pinned commit with `curl` and read with `awk`:

```
1657: find_empty_slot(PyDictKeysObject *keys, Py_hash_t hash)
1658: {
1659:     assert(keys != NULL);
1660: 
1661:     const size_t mask = DK_MASK(keys);
1662:     size_t i = hash & mask;
1663:     Py_ssize_t ix = dictkeys_get_index(keys, i);
1664:     for (size_t perturb = hash; is_unusable_slot(ix);) {
1665:         perturb >>= PERTURB_SHIFT;
1666:         i = (i*5 + perturb + 1) & mask;
1667:         ix = dictkeys_get_index(keys, i);
1668:     }
1669:     return i;
```

- Type: 1
- Status: sourced

### Claim 17. The comment adds that "in free-threaded builds dummy slots are not re-used", so this holds for the default build the Build follows.

- Link: [Objects/dictobject.c, lines 1643 to 1650 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L1643-L1650)
- Chapter: `hash-tables-cpython-dict`
- Quote:

Lines 1643 to 1650, fetched from the pinned commit with `curl` and read with `awk`:

```
1643: static inline int
1644: is_unusable_slot(Py_ssize_t ix)
1645: {
1646: #ifdef Py_GIL_DISABLED
1647:     return ix >= 0 || ix == DKIX_DUMMY;
1648: #else
1649:     return ix >= 0;
1650: #endif
```

- Type: 1
- Status: sourced

### Claim 18. The comment adds that "in free-threaded builds dummy slots are not re-used", so this holds for the default build the Build follows.

- Link: [Objects/dictobject.c, lines 84 to 85 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L84-L85)
- Chapter: `hash-tables-cpython-dict`
- Quote:

Lines 84 to 85, fetched from the pinned commit with `curl` and read with `awk`:

```
84:    In free-threaded builds dummy slots are not re-used to allow lock-free
85:    lookups to proceed safely.
```

- Type: 1
- Status: sourced

### Claim 19. The keys and values sit in the entries array, which is "mostly append only", so "we can get insertion order by just iterating dk_entries.

- Link: [Objects/dictobject.c, lines 92 to 95 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L92-L95)
- Chapter: `hash-tables-cpython-dict`
- Quote:

Lines 92 to 95, fetched from the pinned commit with `curl` and read with `awk`:

```
92: Preserving insertion order
93: 
94: It's simple for combined table.  Since dk_entries is mostly append only, we can
95: get insertion order by just iterating dk_entries.
```

- Type: 1
- Status: sourced

### Claim 20. A new key is written at row `dk_nentries`, and the count of used rows goes up by one.

- Link: [Objects/dictobject.c, lines 1696 to 1711 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L1696-L1711)
- Chapter: `hash-tables-cpython-dict`
- Quote:

Lines 1696 to 1711, fetched from the pinned commit with `curl` and read with `awk`:

```
1696:     if (DK_IS_UNICODE(mp->ma_keys)) {
1697:         PyDictUnicodeEntry *ep;
1698:         ep = &DK_UNICODE_ENTRIES(mp->ma_keys)[mp->ma_keys->dk_nentries];
1699:         STORE_KEY(ep, key);
1700:         STORE_VALUE(ep, value);
1701:     }
1702:     else {
1703:         PyDictKeyEntry *ep;
1704:         ep = &DK_ENTRIES(mp->ma_keys)[mp->ma_keys->dk_nentries];
1705:         STORE_KEY(ep, key);
1706:         STORE_VALUE(ep, value);
1707:         STORE_HASH(ep, hash);
1708:     }
1709:     mp->ma_version_tag = new_version;
1710:     STORE_KEYS_USABLE(mp->ma_keys, mp->ma_keys->dk_usable - 1);
1711:     STORE_KEYS_NENTRIES(mp->ma_keys, mp->ma_keys->dk_nentries + 1);
```

- Type: 1
- Status: sourced

### Claim 21. Keys added after deletion are inserted at the end.

- Link: [Built-in types, Mapping Types, Python 3.13](https://docs.python.org/3.13/library/stdtypes.html#mapping-types-dict)
- Chapter: `hash-tables-cpython-dict`
- Quote:

Page text from `curl`, tags stripped:

> Dictionaries preserve insertion order.  Note that updating a key does not
> affect the order.  Keys added after deletion are inserted at the end.
> >>> d = {"one": 1, "two": 2, "three": 3, "four": 4}
> >>> d
> {'one': 1, 'two': 2, 'three': 3, 'four': 4}
> >>> list(d)
> ['one', 'two', 'three', 'four']
> >>> list(d.values())
> [1, 2, 3, 4]
> >>> d["one"] = 42
> >>> d
> {'one': 42, 'two': 2, 'three': 3, 'four': 4}
> >>> del d["two"]
> >>> d["two"] = None
> >>> d
> {'one': 42, 'three': 3, 'four': 4, 'two': None}
> Changed in version 3.7: Dictionary o

- Type: 2
- Status: sourced

### Claim 22. The implementation notes in `HashMap.java` start with the whole idea: "This map usually acts as a binned (bucketed) hash table, but when bins get too large, they are transformed into bins of TreeNodes".

- Link: [java/util/HashMap.java, lines 148 to 151 (OpenJDK jdk-21+35)](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L148-L151)
- Chapter: `hash-tables-java-hashmap`
- Quote:

Lines 148 to 151, fetched from the pinned commit with `curl` and read with `awk`:

```
148:      * This map usually acts as a binned (bucketed) hash table, but
149:      * when bins get too large, they are transformed into bins of
150:      * TreeNodes, each structured similarly to those in
151:      * java.util.TreeMap. Most methods try to use normal bins, but
```

- Type: 1
- Status: sourced

### Claim 23. If not, the code walks the list and either finds the key (and replaces the value) or reaches the last node and links the new one after it.

- Link: [java/util/HashMap.java, lines 631 to 666 (OpenJDK jdk-21+35)](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L631-L666)
- Chapter: `hash-tables-java-hashmap`
- Quote:

Lines 631 to 666, fetched from the pinned commit with `curl` and read with `awk`:

```
631:     final V putVal(int hash, K key, V value, boolean onlyIfAbsent,
632:                    boolean evict) {
633:         Node<K,V>[] tab; Node<K,V> p; int n, i;
634:         if ((tab = table) == null || (n = tab.length) == 0)
635:             n = (tab = resize()).length;
636:         if ((p = tab[i = (n - 1) & hash]) == null)
637:             tab[i] = newNode(hash, key, value, null);
638:         else {
639:             Node<K,V> e; K k;
640:             if (p.hash == hash &&
641:                 ((k = p.key) == key || (key != null && key.equals(k))))
642:                 e = p;
643:             else if (p instanceof TreeNode)
644:                 e = ((TreeNode<K,V>)p).putTreeVal(this, tab, hash, key, value);
645:             else {
646:                 for (int binCount = 0; ; ++binCount) {
647:                     if ((e = p.next) == null) {
648:                         p.next = newNode(hash, key, value, null);
649:                         if (binCount >= TREEIFY_THRESHOLD - 1) // -1 for 1st
650:                             treeifyBin(tab, hash);
651:                         break;
652:                     }
653:                     if (e.hash == hash &&
654:                         ((k = e.key) == key || (key != null && key.equals(k))))
655:                         break;
656:                     p = e;
657:                 }
658:             }
659:             if (e != null) { // existing mapping for key
660:                 V oldValue = e.value;
661:                 if (!onlyIfAbsent || oldValue == null)
662:                     e.value = value;
663:                 afterNodeAccess(e);
664:                 return oldValue;
665:             }
666:         }
```

- Type: 1
- Status: sourced

### Claim 24. Table lengths are powers of two: "The default initial capacity - MUST be a power of two.

- Link: [java/util/HashMap.java, lines 235 to 238 (OpenJDK jdk-21+35)](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L235-L238)
- Chapter: `hash-tables-java-hashmap`
- Quote:

Lines 235 to 238, fetched from the pinned commit with `curl` and read with `awk`:

```
235:     /**
236:      * The default initial capacity - MUST be a power of two.
237:      */
238:     static final int DEFAULT_INITIAL_CAPACITY = 1 << 4; // aka 16
```

- Type: 1
- Status: sourced

### Claim 25. The default is 16: `1 << 4`.

- Link: [java/util/HashMap.java, line 238 (OpenJDK jdk-21+35)](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L238)
- Chapter: `hash-tables-java-hashmap`
- Quote:

Lines 238 to 238, fetched from the pinned commit with `curl` and read with `awk`:

```
238:     static final int DEFAULT_INITIAL_CAPACITY = 1 << 4; // aka 16
```

- Type: 1
- Status: sourced

### Claim 26. The code that answers it is one line, `(h = key.hashCode()) ^ (h >>> 16)`: XOR the top 16 bits of the hash into the bottom 16.

- Link: [java/util/HashMap.java, lines 320 to 339 (OpenJDK jdk-21+35)](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L320-L339)
- Chapter: `hash-tables-java-hashmap`
- Quote:

Lines 320 to 339, fetched from the pinned commit with `curl` and read with `awk`:

```
320:     /**
321:      * Computes key.hashCode() and spreads (XORs) higher bits of hash
322:      * to lower.  Because the table uses power-of-two masking, sets of
323:      * hashes that vary only in bits above the current mask will
324:      * always collide. (Among known examples are sets of Float keys
325:      * holding consecutive whole numbers in small tables.)  So we
326:      * apply a transform that spreads the impact of higher bits
327:      * downward. There is a tradeoff between speed, utility, and
328:      * quality of bit-spreading. Because many common sets of hashes
329:      * are already reasonably distributed (so don't benefit from
330:      * spreading), and because we use trees to handle large sets of
331:      * collisions in bins, we just XOR some shifted bits in the
332:      * cheapest possible way to reduce systematic lossage, as well as
333:      * to incorporate impact of the highest bits that would otherwise
334:      * never be used in index calculations because of table bounds.
335:      */
336:     static final int hash(Object key) {
337:         int h;
338:         return (key == null) ? 0 : (h = key.hashCode()) ^ (h >>> 16);
339:     }
```

- Type: 1
- Status: sourced

### Claim 27. For an `Integer` the hash code is the value itself: `hashCode()` returns `Integer.hashCode(value)`, which returns `value`.

- Link: [java/lang/Integer.java, lines 1196 to 1198 (OpenJDK jdk-21+35)](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/lang/Integer.java#L1196-L1198)
- Chapter: `hash-tables-java-hashmap`
- Quote:

Lines 1196 to 1198, fetched from the pinned commit with `curl` and read with `awk`:

```
1196:     public int hashCode() {
1197:         return Integer.hashCode(value);
1198:     }
```

- Type: 1
- Status: sourced

### Claim 28. For an `Integer` the hash code is the value itself: `hashCode()` returns `Integer.hashCode(value)`, which returns `value`.

- Link: [java/lang/Integer.java, lines 1209 to 1211 (OpenJDK jdk-21+35)](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/lang/Integer.java#L1209-L1211)
- Chapter: `hash-tables-java-hashmap`
- Quote:

Lines 1209 to 1211, fetched from the pinned commit with `curl` and read with `awk`:

```
1209:     public static int hashCode(int value) {
1210:         return value;
1211:     }
```

- Type: 1
- Status: sourced

### Claim 29. It tabulates the expected share of bins with `k` nodes: 0.60653066 for none, 0.30326533 for one, down to 0.00000006 for eight, and "more: less than 1 in ten million".

- Link: [java/util/HashMap.java, lines 178 to 200 (OpenJDK jdk-21+35)](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L178-L200)
- Chapter: `hash-tables-java-hashmap`
- Quote:

Lines 178 to 200, fetched from the pinned commit with `curl` and read with `awk`:

```
178:      * use them only when bins contain enough nodes to warrant use
179:      * (see TREEIFY_THRESHOLD). And when they become too small (due to
180:      * removal or resizing) they are converted back to plain bins.  In
181:      * usages with well-distributed user hashCodes, tree bins are
182:      * rarely used.  Ideally, under random hashCodes, the frequency of
183:      * nodes in bins follows a Poisson distribution
184:      * (http://en.wikipedia.org/wiki/Poisson_distribution) with a
185:      * parameter of about 0.5 on average for the default resizing
186:      * threshold of 0.75, although with a large variance because of
187:      * resizing granularity. Ignoring variance, the expected
188:      * occurrences of list size k are (exp(-0.5) * pow(0.5, k) /
189:      * factorial(k)). The first values are:
190:      *
191:      * 0:    0.60653066
192:      * 1:    0.30326533
193:      * 2:    0.07581633
194:      * 3:    0.01263606
195:      * 4:    0.00157952
196:      * 5:    0.00015795
197:      * 6:    0.00001316
198:      * 7:    0.00000094
199:      * 8:    0.00000006
200:      * more: less than 1 in ten million
```

- Type: 1
- Status: sourced

### Claim 30. The class documentation turns that into a promise with a condition: "constant-time performance for the basic operations (get and put), assuming the hash function disperses the elements properly among the buckets.

- Link: [java/util/HashMap.java, lines 49 to 51 (OpenJDK jdk-21+35)](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L49-L51)
- Chapter: `hash-tables-java-hashmap`
- Quote:

Lines 49 to 51, fetched from the pinned commit with `curl` and read with `awk`:

```
49:  * <p>This implementation provides constant-time performance for the basic
50:  * operations ({@code get} and {@code put}), assuming the hash function
51:  * disperses the elements properly among the buckets.  Iteration over
```

- Type: 1
- Status: sourced

### Claim 31. Three constants set the policy: `TREEIFY_THRESHOLD = 8`, `UNTREEIFY_THRESHOLD = 6` and `MIN_TREEIFY_CAPACITY = 64`.

- Link: [java/util/HashMap.java, lines 253 to 275 (OpenJDK jdk-21+35)](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L253-L275)
- Chapter: `hash-tables-java-hashmap`
- Quote:

Lines 253 to 275, fetched from the pinned commit with `curl` and read with `awk`:

```
253:      * The bin count threshold for using a tree rather than list for a
254:      * bin.  Bins are converted to trees when adding an element to a
255:      * bin with at least this many nodes. The value must be greater
256:      * than 2 and should be at least 8 to mesh with assumptions in
257:      * tree removal about conversion back to plain bins upon
258:      * shrinkage.
259:      */
260:     static final int TREEIFY_THRESHOLD = 8;
261: 
262:     /**
263:      * The bin count threshold for untreeifying a (split) bin during a
264:      * resize operation. Should be less than TREEIFY_THRESHOLD, and at
265:      * most 6 to mesh with shrinkage detection under removal.
266:      */
267:     static final int UNTREEIFY_THRESHOLD = 6;
268: 
269:     /**
270:      * The smallest table capacity for which bins may be treeified.
271:      * (Otherwise the table is resized if too many nodes in a bin.)
272:      * Should be at least 4 * TREEIFY_THRESHOLD to avoid conflicts
273:      * between resizing and treeification thresholds.
274:      */
275:     static final int MIN_TREEIFY_CAPACITY = 64;
```

- Type: 1
- Status: sourced

### Claim 32. The check is inside `putVal`: after linking a new node the code tests `binCount >= TREEIFY_THRESHOLD - 1`, with the comment `// -1 for 1st`.

- Link: [java/util/HashMap.java, lines 646 to 651 (OpenJDK jdk-21+35)](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L646-L651)
- Chapter: `hash-tables-java-hashmap`
- Quote:

Lines 646 to 651, fetched from the pinned commit with `curl` and read with `awk`:

```
646:                 for (int binCount = 0; ; ++binCount) {
647:                     if ((e = p.next) == null) {
648:                         p.next = newNode(hash, key, value, null);
649:                         if (binCount >= TREEIFY_THRESHOLD - 1) // -1 for 1st
650:                             treeifyBin(tab, hash);
651:                         break;
```

- Type: 1
- Status: sourced

### Claim 33. `treeifyBin` is documented: "Replaces all linked nodes in bin at index for given hash unless table is too small, in which case resizes instead.

- Link: [java/util/HashMap.java, lines 757 to 765 (OpenJDK jdk-21+35)](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L757-L765)
- Chapter: `hash-tables-java-hashmap`
- Quote:

Lines 757 to 765, fetched from the pinned commit with `curl` and read with `awk`:

```
757:     /**
758:      * Replaces all linked nodes in bin at index for given hash unless
759:      * table is too small, in which case resizes instead.
760:      */
761:     final void treeifyBin(Node<K,V>[] tab, int hash) {
762:         int n, index; Node<K,V> e;
763:         if (tab == null || (n = tab.length) < MIN_TREEIFY_CAPACITY)
764:             resize();
765:         else if ((e = tab[index = (n - 1) & hash]) != null) {
```

- Type: 1
- Status: sourced

### Claim 34. So "performance degrades gracefully under accidental or malicious usages in which hashCode() methods return values that are poorly distributed, as well as those in which many keys share a hashCode, so long as they are also Comparable.

- Link: [java/util/HashMap.java, lines 159 to 175 (OpenJDK jdk-21+35)](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L159-L175)
- Chapter: `hash-tables-java-hashmap`
- Quote:

Lines 159 to 175, fetched from the pinned commit with `curl` and read with `awk`:

```
159:      * Tree bins (i.e., bins whose elements are all TreeNodes) are
160:      * ordered primarily by hashCode, but in the case of ties, if two
161:      * elements are of the same "class C implements Comparable<C>",
162:      * type then their compareTo method is used for ordering. (We
163:      * conservatively check generic types via reflection to validate
164:      * this -- see method comparableClassFor).  The added complexity
165:      * of tree bins is worthwhile in providing worst-case O(log n)
166:      * operations when keys either have distinct hashes or are
167:      * orderable, Thus, performance degrades gracefully under
168:      * accidental or malicious usages in which hashCode() methods
169:      * return values that are poorly distributed, as well as those in
170:      * which many keys share a hashCode, so long as they are also
171:      * Comparable. (If neither of these apply, we may waste about a
172:      * factor of two in time and space compared to taking no
173:      * precautions. But the only known cases stem from poor user
174:      * programming practices that are already so slow that this makes
175:      * little difference.)
```

- Type: 1
- Status: sourced

### Claim 35. The proposal that introduced trees, JEP 180, gives the same bound: "In the case of high hash collisions, this will improve worst-case performance from O(n) to O(log n).

- Link: [JEP 180: Handle Frequent HashMap Collisions with Balanced Trees](https://openjdk.org/jeps/180)
- Chapter: `hash-tables-java-hashmap`
- Quote:

Page text from `curl`, tags stripped:

> The principal idea is that once the number of items in a hash bucket
> grows beyond a certain threshold, that bucket will switch from using a
> linked list of entries to a balanced tree.  In the case of high hash
> collisions, this will improve worst-case performance from O(n) to O(log
> n).
> This technique has already been implemented in the latest version of the
> java.util.concurrent.ConcurrentHashMap class, which is also sl

- Type: 3
- Status: sourced

### Claim 36. The trade is size: "Because TreeNodes are about twice the size of regular nodes, we use them only when bins contain enough nodes to warrant use".

- Link: [java/util/HashMap.java, lines 177 to 179 (OpenJDK jdk-21+35)](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L177-L179)
- Chapter: `hash-tables-java-hashmap`
- Quote:

Lines 177 to 179, fetched from the pinned commit with `curl` and read with `awk`:

```
177:      * Because TreeNodes are about twice the size of regular nodes, we
178:      * use them only when bins contain enough nodes to warrant use
179:      * (see TREEIFY_THRESHOLD). And when they become too small (due to
```

- Type: 1
- Status: sourced

### Claim 37. The default is .75, which "offers a good tradeoff between time and space costs.

- Link: [java/util/HashMap.java, lines 62 to 70 (OpenJDK jdk-21+35)](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L62-L70)
- Chapter: `hash-tables-resizing`
- Quote:

Lines 62 to 70, fetched from the pinned commit with `curl` and read with `awk`:

```
62:  * <i>load factor</i> is a measure of how full the hash table is allowed to
63:  * get before its capacity is automatically increased.  When the number of
64:  * entries in the hash table exceeds the product of the load factor and the
65:  * current capacity, the hash table is <i>rehashed</i> (that is, internal data
66:  * structures are rebuilt) so that the hash table has approximately twice the
67:  * number of buckets.
68:  *
69:  * <p>As a general rule, the default load factor (.75) offers a good
70:  * tradeoff between time and space costs.  Higher values decrease the
```

- Type: 1
- Status: sourced

### Claim 38. In `putVal` the test is the last step, after the new node is linked: `if (++size > threshold) resize();`.

- Link: [java/util/HashMap.java, lines 247 to 250 (OpenJDK jdk-21+35)](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L247-L250)
- Chapter: `hash-tables-resizing`
- Quote:

Lines 247 to 250, fetched from the pinned commit with `curl` and read with `awk`:

```
247:     /**
248:      * The load factor used when none specified in constructor.
249:      */
250:     static final float DEFAULT_LOAD_FACTOR = 0.75f;
```

- Type: 1
- Status: sourced

### Claim 39. In `putVal` the test is the last step, after the new node is linked: `if (++size > threshold) resize();`.

- Link: [java/util/HashMap.java, lines 667 to 669 (OpenJDK jdk-21+35)](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L667-L669)
- Chapter: `hash-tables-resizing`
- Quote:

Lines 667 to 669, fetched from the pinned commit with `curl` and read with `awk`:

```
667:         ++modCount;
668:         if (++size > threshold)
669:             resize();
```

- Type: 1
- Status: sourced

### Claim 40. Decreasing it improves sparseness at the expense of spreading indices over more cache lines and at the cost of total memory consumed.

- Link: [Objects/dictobject.c, lines 565 to 576 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L565-L576)
- Chapter: `hash-tables-resizing`
- Quote:

Lines 565 to 576, fetched from the pinned commit with `curl` and read with `awk`:

```
565: /* USABLE_FRACTION is the maximum dictionary load.
566:  * Increasing this ratio makes dictionaries more dense resulting in more
567:  * collisions.  Decreasing it improves sparseness at the expense of spreading
568:  * indices over more cache lines and at the cost of total memory consumed.
569:  *
570:  * USABLE_FRACTION must obey the following:
571:  *     (0 < USABLE_FRACTION(n) < n) for all n >= 2
572:  *
573:  * USABLE_FRACTION should be quick to calculate.
574:  * Fractions around 1/2 to 2/3 seem to work well in practice.
575:  */
576: #define USABLE_FRACTION(n) (((n) << 1)/3)
```

- Type: 1
- Status: sourced

### Claim 41. `delitem_common` writes the Dummy marker into the slot and clears the row's key and value, and touches neither `dk_nentries` nor `dk_usable`.

- Link: [Objects/dictobject.c, lines 2616 to 2633 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L2616-L2633)
- Chapter: `hash-tables-resizing`
- Quote:

Lines 2616 to 2633, fetched from the pinned commit with `curl` and read with `awk`:

```
2616:     else {
2617:         mp->ma_keys->dk_version = 0;
2618:         dictkeys_set_index(mp->ma_keys, hashpos, DKIX_DUMMY);
2619:         if (DK_IS_UNICODE(mp->ma_keys)) {
2620:             PyDictUnicodeEntry *ep = &DK_UNICODE_ENTRIES(mp->ma_keys)[ix];
2621:             old_key = ep->me_key;
2622:             STORE_KEY(ep, NULL);
2623:             STORE_VALUE(ep, NULL);
2624:         }
2625:         else {
2626:             PyDictKeyEntry *ep = &DK_ENTRIES(mp->ma_keys)[ix];
2627:             old_key = ep->me_key;
2628:             STORE_KEY(ep, NULL);
2629:             STORE_VALUE(ep, NULL);
2630:             STORE_HASH(ep, 0);
2631:         }
2632:         Py_DECREF(old_key);
2633:     }
```

- Type: 1
- Status: sourced

### Claim 42. The check that decides a resize is `dk_usable <= 0`, before the new key is stored.

- Link: [Objects/dictobject.c, lines 1682 to 1686 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L1682-L1686)
- Chapter: `hash-tables-resizing`
- Quote:

Lines 1682 to 1686, fetched from the pinned commit with `curl` and read with `awk`:

```
1682:     if (mp->ma_keys->dk_usable <= 0) {
1683:         /* Need to resize. */
1684:         if (insertion_resize(interp, mp, 1) < 0) {
1685:             return -1;
1686:         }
```

- Type: 1
- Status: sourced

### Claim 43. Java's resize does what the documentation says: new capacity is `oldCap << 1`, and the threshold doubles with it.

- Link: [java/util/HashMap.java, lines 683 to 702 (OpenJDK jdk-21+35)](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L683-L702)
- Chapter: `hash-tables-resizing`
- Quote:

Lines 683 to 702, fetched from the pinned commit with `curl` and read with `awk`:

```
683:     final Node<K,V>[] resize() {
684:         Node<K,V>[] oldTab = table;
685:         int oldCap = (oldTab == null) ? 0 : oldTab.length;
686:         int oldThr = threshold;
687:         int newCap, newThr = 0;
688:         if (oldCap > 0) {
689:             if (oldCap >= MAXIMUM_CAPACITY) {
690:                 threshold = Integer.MAX_VALUE;
691:                 return oldTab;
692:             }
693:             else if ((newCap = oldCap << 1) < MAXIMUM_CAPACITY &&
694:                      oldCap >= DEFAULT_INITIAL_CAPACITY)
695:                 newThr = oldThr << 1; // double threshold
696:         }
697:         else if (oldThr > 0) // initial capacity was placed in threshold
698:             newCap = oldThr;
699:         else {               // zero initial threshold signifies using defaults
700:             newCap = DEFAULT_INITIAL_CAPACITY;
701:             newThr = (int)(DEFAULT_LOAD_FACTOR * DEFAULT_INITIAL_CAPACITY);
702:         }
```

- Type: 1
- Status: sourced

### Claim 44. It also keeps a record of earlier rules: used*4 up to 3.2, used*2 in 3.3.0, and used*2 + capacity/2 in 3.4.0 to 3.6.0.

- Link: [Objects/dictobject.c, lines 613 to 623 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L613-L623)
- Chapter: `hash-tables-resizing`
- Quote:

Lines 613 to 623, fetched from the pinned commit with `curl` and read with `awk`:

```
613: /* GROWTH_RATE. Growth rate upon hitting maximum load.
614:  * Currently set to used*3.
615:  * This means that dicts double in size when growing without deletions,
616:  * but have more head room when the number of deletions is on a par with the
617:  * number of insertions.  See also bpo-17563 and bpo-33205.
618:  *
619:  * GROWTH_RATE was set to used*4 up to version 3.2.
620:  * GROWTH_RATE was set to used*2 in version 3.3.0
621:  * GROWTH_RATE was set to used*2 + capacity/2 in 3.4.0-3.6.0.
622:  */
623: #define GROWTH_RATE(d) ((d)->ma_used*3)
```

- Type: 1
- Status: sourced

### Claim 45. The new size is the smallest power of two at or above that number, computed by `calculate_log2_keysize`.

- Link: [Objects/dictobject.c, lines 578 to 584 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L578-L584)
- Chapter: `hash-tables-resizing`
- Quote:

Lines 578 to 584, fetched from the pinned commit with `curl` and read with `awk`:

```
578: /* Find the smallest dk_size >= minsize. */
579: static inline uint8_t
580: calculate_log2_keysize(Py_ssize_t minsize)
581: {
582: #if SIZEOF_LONG == SIZEOF_SIZE_T
583:     minsize = (minsize | PyDict_MINSIZE) - 1;
584:     return _Py_bit_length(minsize | (PyDict_MINSIZE-1));
```

- Type: 1
- Status: sourced

### Claim 46. With 5 live keys that is 15, so 16 slots.

- Link: [Objects/dictobject.c, lines 1673 to 1676 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L1673-L1676)
- Chapter: `hash-tables-resizing`
- Quote:

Lines 1673 to 1676, fetched from the pinned commit with `curl` and read with `awk`:

```
1673: insertion_resize(PyInterpreterState *interp, PyDictObject *mp, int unicode)
1674: {
1675:     return dictresize(interp, mp, calculate_log2_keysize(GROWTH_RATE(mp)), unicode);
1676: }
```

- Type: 1
- Status: sourced

### Claim 47. Its comment: "because we are using power-of-two expansion, the elements from each bin must either stay at same index, or move with a power of two offset in the new table.

- Link: [java/util/HashMap.java, lines 674 to 679 (OpenJDK jdk-21+35)](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L674-L679)
- Chapter: `hash-tables-resizing`
- Quote:

Lines 674 to 679, fetched from the pinned commit with `curl` and read with `awk`:

```
674:     /**
675:      * Initializes or doubles table size.  If null, allocates in
676:      * accord with initial capacity target held in field threshold.
677:      * Otherwise, because we are using power-of-two expansion, the
678:      * elements from each bin must either stay at same index, or move
679:      * with a power of two offset in the new table.
```

- Type: 1
- Status: sourced

### Claim 48. Each of the two groups is relinked in its old order, marked `// preserve order`.

- Link: [java/util/HashMap.java, lines 721 to 749 (OpenJDK jdk-21+35)](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L721-L749)
- Chapter: `hash-tables-resizing`
- Quote:

Lines 721 to 749, fetched from the pinned commit with `curl` and read with `awk`:

```
721:                     else { // preserve order
722:                         Node<K,V> loHead = null, loTail = null;
723:                         Node<K,V> hiHead = null, hiTail = null;
724:                         Node<K,V> next;
725:                         do {
726:                             next = e.next;
727:                             if ((e.hash & oldCap) == 0) {
728:                                 if (loTail == null)
729:                                     loHead = e;
730:                                 else
731:                                     loTail.next = e;
732:                                 loTail = e;
733:                             }
734:                             else {
735:                                 if (hiTail == null)
736:                                     hiHead = e;
737:                                 else
738:                                     hiTail.next = e;
739:                                 hiTail = e;
740:                             }
741:                         } while ((e = next) != null);
742:                         if (loTail != null) {
743:                             loTail.next = null;
744:                             newTab[j] = loHead;
745:                         }
746:                         if (hiTail != null) {
747:                             hiTail.next = null;
748:                             newTab[j + oldCap] = hiHead;
749:                         }
```

- Type: 1
- Status: sourced

### Claim 49. When entries have been deleted, the new table may actually be smaller than the old one.

- Link: [Objects/dictobject.c, lines 1936 to 1938 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L1936-L1938)
- Chapter: `hash-tables-resizing`
- Quote:

Lines 1936 to 1938, fetched from the pinned commit with `curl` and read with `awk`:

```
1936: /*
1937: Restructure the table by allocating a new table and reinserting all
1938: items again.  When entries have been deleted, the new table may
```

- Type: 1
- Status: sourced

### Claim 50. For a table of general keys such as ints, it copies the entries that still have a value into the front of a new entries array, in order, and then `build_indices_generic` places each entry's index in the new table with the same probe rule.

- Link: [Objects/dictobject.c, lines 2035 to 2050 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L2035-L2050)
- Chapter: `hash-tables-resizing`
- Quote:

Lines 2035 to 2050, fetched from the pinned commit with `curl` and read with `awk`:

```
2035:             // generic -> generic
2036:             assert(newkeys->dk_kind == DICT_KEYS_GENERAL);
2037:             PyDictKeyEntry *oldentries = DK_ENTRIES(oldkeys);
2038:             PyDictKeyEntry *newentries = DK_ENTRIES(newkeys);
2039:             if (oldkeys->dk_nentries == numentries) {
2040:                 memcpy(newentries, oldentries, numentries * sizeof(PyDictKeyEntry));
2041:             }
2042:             else {
2043:                 PyDictKeyEntry *ep = oldentries;
2044:                 for (Py_ssize_t i = 0; i < numentries; i++) {
2045:                     while (ep->me_value == NULL)
2046:                         ep++;
2047:                     newentries[i] = *ep++;
2048:                 }
2049:             }
2050:             build_indices_generic(newkeys, newentries, numentries);
```

- Type: 1
- Status: sourced

### Claim 51. So a resize also removes the deleted rows and the Dummy slots.

- Link: [Objects/dictobject.c, lines 1905 to 1918 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L1905-L1918)
- Chapter: `hash-tables-resizing`
- Quote:

Lines 1905 to 1918, fetched from the pinned commit with `curl` and read with `awk`:

```
1905: static void
1906: build_indices_generic(PyDictKeysObject *keys, PyDictKeyEntry *ep, Py_ssize_t n)
1907: {
1908:     size_t mask = DK_MASK(keys);
1909:     for (Py_ssize_t ix = 0; ix != n; ix++, ep++) {
1910:         Py_hash_t hash = ep->me_hash;
1911:         size_t i = hash & mask;
1912:         for (size_t perturb = hash; dictkeys_get_index(keys, i) != DKIX_EMPTY;) {
1913:             perturb >>= PERTURB_SHIFT;
1914:             i = mask & (i*5 + perturb + 1);
1915:         }
1916:         dictkeys_set_index(keys, i, ix);
1917:     }
1918: }
```

- Type: 1
- Status: sourced

### Claim 52. Java also documents how to avoid the cost when you know the count: "If the initial capacity is greater than the maximum number of entries divided by the load factor, no rehash operations will ever occur.

- Link: [java/util/HashMap.java, lines 76 to 78 (OpenJDK jdk-21+35)](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L76-L78)
- Chapter: `hash-tables-resizing`
- Quote:

Lines 76 to 78, fetched from the pinned commit with `curl` and read with `awk`:

```
76:  * rehash operations.  If the initial capacity is greater than the
77:  * maximum number of entries divided by the load factor, no rehash
78:  * operations will ever occur.
```

- Type: 1
- Status: sourced

### Claim 53. The line that picks the power of two in CPython 3.13.0 reads `minsize = (minsize | PyDict_MINSIZE) - 1; return _Py_bit_length(minsize | (PyDict_MINSIZE-1));`.

- Link: [Objects/dictobject.c, lines 580 to 584 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/dictobject.c#L580-L584)
- Chapter: `hash-tables-resizing`
- Quote:

Lines 580 to 584, fetched from the pinned commit with `curl` and read with `awk`:

```
580: calculate_log2_keysize(Py_ssize_t minsize)
581: {
582: #if SIZEOF_LONG == SIZEOF_SIZE_T
583:     minsize = (minsize | PyDict_MINSIZE) - 1;
584:     return _Py_bit_length(minsize | (PyDict_MINSIZE-1));
```

- Type: 1
- Status: sourced

### Claim 54. A later patch release fixed it: the same function in 3.13.18 reads `minsize = Py_MAX(minsize, PyDict_MINSIZE); return _Py_bit_length(minsize - 1);`.

- Link: [Objects/dictobject.c, lines 580 to 584 (CPython 3.13.18)](https://github.com/python/cpython/blob/0d4bd512fc429e3d4eacdd113c975e161f21644d/Objects/dictobject.c#L580-L584)
- Chapter: `hash-tables-resizing`
- Quote:

Lines 580 to 584, fetched from the pinned commit with `curl` and read with `awk`:

```
580: calculate_log2_keysize(Py_ssize_t minsize)
581: {
582: #if SIZEOF_LONG == SIZEOF_SIZE_T
583:     minsize = Py_MAX(minsize, PyDict_MINSIZE);
584:     return _Py_bit_length(minsize - 1);
```

- Type: 1
- Status: sourced

### Claim 55. The commit "gh-133703: dict: fix calculate_log2_keysize()" replaced the two lines with `minsize = Py_MAX(minsize, PyDict_MINSIZE); return _Py_bit_length(minsize - 1);`, and its news entry reads "Fix hashtable in dict can be bigger than intended in some situ...

- Link: [commit 92337f6](https://github.com/python/cpython/commit/92337f666e8a076a68305a8d6dc8bc9c095000e9)
- Chapter: `hash-tables-resizing`
- Quote:

Commit message (title): `gh-133703: dict: fix calculate_log2_keysize() (GH-133809)`. Diff of `Objects/dictobject.c`: `-    minsize = (minsize | PyDict_MINSIZE) - 1;` and `-    return _Py_bit_length(minsize | (PyDict_MINSIZE-1));` replaced by `+    minsize = Py_MAX(minsize, PyDict_MINSIZE);` and `+    return _Py_bit_length(minsize - 1);`. News entry `Misc/NEWS.d/next/Core_and_Builtins/2025-05-10-17-12-27.gh-issue-133703.bVM-re.rst`: "Fix hashtable in dict can be bigger than intended in some situations." Fetched with `curl` from the GitHub API.

- Type: 1
- Status: sourced

### Claim 56. It "is computed as `s[0]*31^(n-1) + s[1]*31^(n-2) + ... + s[n-1]` using `int` arithmetic, where `s[i]` is the `i`th character of the string, `n` is the length of the string".

- Link: [java/lang/String.java, lines 2342 to 2350 (OpenJDK jdk-21+35)](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/lang/String.java#L2342-L2350)
- Chapter: `hash-tables-adversarial-keys`
- Quote:

Lines 2342 to 2350, fetched from the pinned commit with `curl` and read with `awk`:

```
2342:      * Returns a hash code for this string. The hash code for a
2343:      * {@code String} object is computed as
2344:      * <blockquote><pre>
2345:      * s[0]*31^(n-1) + s[1]*31^(n-2) + ... + s[n-1]
2346:      * </pre></blockquote>
2347:      * using {@code int} arithmetic, where {@code s[i]} is the
2348:      * <i>i</i>th character of the string, {@code n} is the length of
2349:      * the string, and {@code ^} indicates exponentiation.
2350:      * (The hash value of the empty string is zero.)
```

- Type: 1
- Status: sourced

### Claim 57. Their talk's abstract: "a common flaw in the implementation of most of the popular web programming languages and platforms (including PHP, ASP.NET, Java, etc.) can be (ab)used to force web application servers to use 99% of CPU for several minutes to hours f...

- Link: [28C3: Effective Denial of Service attacks against web application platforms, Klink and Wälde](https://events.ccc.de/congress/2011/Fahrplan/events/4680.en.html)
- Chapter: `hash-tables-adversarial-keys`
- Quote:

Page text from `curl`, tags stripped:

> This talk will show how a common flaw in the implementation of most of the popular web
> programming languages and platforms (including PHP, ASP.NET, Java, etc.) can
> be (ab)used to force web application servers to use 99% of CPU for several
> minutes to hours for a single HTTP request.
> This attack is mostly independent of the underlying web application and just
> relies on a common fact of how web application servers typic

- Type: 4
- Status: sourced

### Claim 58. It lists Java and Python among the affected languages, and for Java the fixed version is "N/A".

- Link: [oCERT-2011-003](https://ocert.org/advisories/ocert-2011-003.html)
- Chapter: `hash-tables-adversarial-keys`
- Quote:

Page text from `curl`, tags stripped:

> A variety of programming languages suffer from a denial-of-service (DoS)
>     condition against storage functions of key/value pairs in hash data structures,
>     the condition can be leveraged by exploiting predictable collisions in the
>     underlying hashing algorithms.
>     The issue finds particular exposure in web server applications and/or
>     frameworks.  In particular, the lack of sufficient limits for the number of
>     parameters in POST requests in conjunction with the predictable collision
>     properties in the hashing functions of the underlying languages can render web
>     applications vulnerable to the DoS condition.  The attacker, using specially
>     crafted HTTP requests, can le

- Type: 4
- Status: sourced

### Claim 59. Python's documentation gives the same figure for its own table: inputs "that exploit the worst case performance of a dict insertion, O(n2) complexity".

- Link: [Data model, `object.__hash__`, Python 3.13](https://docs.python.org/3.13/reference/datamodel.html#object.__hash__)
- Chapter: `hash-tables-adversarial-keys`
- Quote:

Page text from `curl`, tags stripped:

> By default, the __hash__() values of str and bytes objects are
> “salted” with an unpredictable random value.  Although they
> remain constant within an individual Python process, they are not
> predictable between repeated invocations of Python.
> This is intended to provide protection against a denial-of-service caused
> by carefully chosen inputs that exploit the worst case performance of a
> dict insertion, O(n2) complexity.  See
> https://ocert.org/advisories/ocert-2011-003.html for details.
> Changing hash values affects the iteration order of sets.
> Python has never made guarantees about this ordering
> (and it typically varies between 32-bit and 64-bit builds).
> See also PYTHONHASHSEED.
> Changed in version 3.3: Hash randomization is enabled by default.
> object.__bool__(self)¶
> Called to implement truth value testing and the built-in operation
> bool(); should return False or True.  When this method is not
> defined, __len__() is called, if it is defined, and the object is
> considered true if its result is nonzero.  If a class defines neither
> __len__() nor __bool__() (which is true of the object
> class it

- Type: 2
- Status: sourced

### Claim 60. The environment variable `PYTHONHASHSEED` controls it: "If this variable is not set or set to random, a random value is used to seed the hashes of str and bytes objects.

- Link: [Command line and environment, Python 3.13](https://docs.python.org/3.13/using/cmdline.html#envvar-PYTHONHASHSEED)
- Chapter: `hash-tables-adversarial-keys`
- Quote:

Page text from `curl`, tags stripped:

> If this variable is not set or set to random, a random value is used
> to seed the hashes of str and bytes objects.
> If PYTHONHASHSEED is set to an integer value, it is used as a fixed
> seed for generating the hash() of the types covered by the hash
> randomization.
> Its purpose is to allow repeatable hashing, such as for selftests for the
> interpreter itself, or to allow a cluster of python processes to share hash
> values.
> T

- Type: 2
- Status: sourced

### Claim 61. In the source, the default algorithm is SipHash 1-3 (`#define Py_HASH_ALGORITHM Py_HASH_SIPHASH13`, unless the platform needs aligned access).

- Link: [Include/pyhash.h, lines 40 to 48 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Include/pyhash.h#L40-L48)
- Chapter: `hash-tables-adversarial-keys`
- Quote:

Lines 40 to 48, fetched from the pinned commit with `curl` and read with `awk`:

```
40: #define Py_HASH_SIPHASH13 3
41: 
42: #ifndef Py_HASH_ALGORITHM
43: #  ifndef HAVE_ALIGNED_REQUIRED
44: #    define Py_HASH_ALGORITHM Py_HASH_SIPHASH13
45: #  else
46: #    define Py_HASH_ALGORITHM Py_HASH_FNV
47: #  endif /* uint64_t && uint32_t && aligned */
48: #endif /* Py_HASH_ALGORITHM */
```

- Type: 1
- Status: sourced

### Claim 62. It is keyed with two 64-bit values from the process's hash secret: `siphash13(_Py_HashSecret.siphash.k0, _Py_HashSecret.siphash.k1, src, src_sz)`.

- Link: [Python/pyhash.c, lines 475 to 483 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Python/pyhash.c#L475-L483)
- Chapter: `hash-tables-adversarial-keys`
- Quote:

Lines 475 to 483, fetched from the pinned commit with `curl` and read with `awk`:

```
475: #if Py_HASH_ALGORITHM == Py_HASH_SIPHASH13
476: static Py_hash_t
477: pysiphash(const void *src, Py_ssize_t src_sz) {
478:     return (Py_hash_t)siphash13(
479:         _le64toh(_Py_HashSecret.siphash.k0), _le64toh(_Py_HashSecret.siphash.k1),
480:         src, src_sz);
481: }
482: 
483: static PyHash_FuncDef PyHash_Func = {pysiphash, "siphash13", 64, 128};
```

- Type: 1
- Status: sourced

### Claim 63. The algorithm is randomly seeded".

- Link: [HashMap, Rust 1.80.0](https://doc.rust-lang.org/1.80.0/std/collections/struct.HashMap.html)
- Chapter: `hash-tables-adversarial-keys`
- Quote:

Page text from `curl`, tags stripped:

> HashMap uses a hashing algorithm selected to provide
> resistance against HashDoS attacks. The algorithm is randomly seeded, and a
> reasonable best-effort is made to generate this seed from a high quality,
> secure source of randomness provided by the host without blocking the
> program. Because of this, the randomness of the seed depends on the output
> quality of the system’s random number coroutine when the seed is created

- Type: 2
- Status: sourced

### Claim 64. The first Chapter's source comment says that ints "are their own hash codes", and the numeric hash is a reduction modulo a fixed prime `P = 2**61 - 1` on a 64-bit build, which agrees with that for ints below `P`.

- Link: [Python/pyhash.c, lines 31 to 34 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Python/pyhash.c#L31-L34)
- Chapter: `hash-tables-adversarial-keys`
- Quote:

Lines 31 to 34, fetched from the pinned commit with `curl` and read with `awk`:

```
31: /* For numeric types, the hash of a number x is based on the reduction
32:    of x modulo the prime P = 2**_PyHASH_BITS - 1.  It's designed so that
33:    hash(x) == hash(y) whenever x and y are numerically equal, even if
34:    x and y have different types.
```

- Type: 1
- Status: sourced

### Claim 65. So `0`, `P`, `2P` and every other multiple of `P` have hash 0.

- Link: [Include/cpython/pyhash.h, lines 12 to 13 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Include/cpython/pyhash.h#L12-L13)
- Chapter: `hash-tables-adversarial-keys`
- Quote:

Lines 12 to 13, fetched from the pinned commit with `curl` and read with `awk`:

```
12: #if SIZEOF_VOID_P >= 8
13: #  define PyHASH_BITS 61
```

- Type: 1
- Status: sourced

### Claim 66. The tree bins "will improve collision performance for any key type that implements Comparable".

- Link: [JEP 180](https://openjdk.org/jeps/180)
- Chapter: `hash-tables-adversarial-keys`
- Quote:

Page text from `curl`, tags stripped:

> The principal idea is that once the number of items in a hash bucket
> grows beyond a certain threshold, that bucket will switch from using a
> linked list of entries to a balanced tree.  In the case of high hash
> collisions, this will improve worst-case performance from O(n) to O(log
> n).
> This technique has already been implemented in the latest version of the
> java.util.concurrent.ConcurrentHashMap class, which is also sl

- Type: 3
- Status: sourced

### Claim 67. A `String` is one: the code that checks the class has a shortcut, `// bypass checks`, for `String.class`.

- Link: [java/util/HashMap.java, lines 345 to 349 (OpenJDK jdk-21+35)](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L345-L349)
- Chapter: `hash-tables-adversarial-keys`
- Quote:

Lines 345 to 349, fetched from the pinned commit with `curl` and read with `awk`:

```
345:     static Class<?> comparableClassFor(Object x) {
346:         if (x instanceof Comparable) {
347:             Class<?> c; Type[] ts, as; ParameterizedType p;
348:             if ((c = x.getClass()) == String.class) // bypass checks
349:                 return c;
```

- Type: 1
- Status: sourced

### Claim 68. Trees cost memory and code: "TreeNodes are about twice the size of regular nodes", which is why they appear only in long bins.

- Link: [java/util/HashMap.java, lines 177 to 179 (OpenJDK jdk-21+35)](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L177-L179)
- Chapter: `hash-tables-adversarial-keys`
- Quote:

Lines 177 to 179, fetched from the pinned commit with `curl` and read with `awk`:

```
177:      * Because TreeNodes are about twice the size of regular nodes, we
178:      * use them only when bins contain enough nodes to warrant use
179:      * (see TREEIFY_THRESHOLD). And when they become too small (due to
```

- Type: 1
- Status: sourced

### Claim 69. And a tree needs an order: for keys that are neither distinct in hash nor Comparable, the notes admit "we may waste about a factor of two in time and space compared to taking no precautions".

- Link: [java/util/HashMap.java, lines 159 to 175 (OpenJDK jdk-21+35)](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L159-L175)
- Chapter: `hash-tables-adversarial-keys`
- Quote:

Lines 159 to 175, fetched from the pinned commit with `curl` and read with `awk`:

```
159:      * Tree bins (i.e., bins whose elements are all TreeNodes) are
160:      * ordered primarily by hashCode, but in the case of ties, if two
161:      * elements are of the same "class C implements Comparable<C>",
162:      * type then their compareTo method is used for ordering. (We
163:      * conservatively check generic types via reflection to validate
164:      * this -- see method comparableClassFor).  The added complexity
165:      * of tree bins is worthwhile in providing worst-case O(log n)
166:      * operations when keys either have distinct hashes or are
167:      * orderable, Thus, performance degrades gracefully under
168:      * accidental or malicious usages in which hashCode() methods
169:      * return values that are poorly distributed, as well as those in
170:      * which many keys share a hashCode, so long as they are also
171:      * Comparable. (If neither of these apply, we may waste about a
172:      * factor of two in time and space compared to taking no
173:      * precautions. But the only known cases stem from poor user
174:      * programming practices that are already so slow that this makes
175:      * little difference.)
```

- Type: 1
- Status: sourced
