# Dynamic arrays: stage 2 sources

Research for the Topic "dynamic arrays" (chosen in `candidates-linear.md`, section 1). Every claim the three Chapters will make is listed below with its source. Stage 1's six code citations were re-verified by the maintainer and are not redone, but where a stage 1 line number or description turned out slightly different I say so (see "Corrections to stage 1").

Tags (resolved to commit SHAs with `git ls-remote`):

| Project | Tag | Commit |
|---|---|---|
| CPython | `v3.13.0` | `60403a5409ff2c3f3b07dd2ca91a7a3e096839c7` (annotated tag object `3f27099d916c7b885e3daf1fabedcc119462014d`) |
| Go | `go1.22.0` | `a10e42f219abb9c5bc4e7d86d9464700a42c7d57` |
| Go | `go1.17` | `ec5170397c724a8ae440b2bc529f857c86f0e6b1` |
| Go | `go1.18` | `4aa1efed4853ea067d665a952eee77c52faac774` |
| Rust | `1.80.0` | `051478957371ee0084a7c0913941d2a8c4757bb9` (tag object `4f9c8cbf2386b5e35c5ba754b705c383c5f4b4cc`) |
| OpenJDK | `jdk-21+35` | `890adb6410dab4606a4f26a942aed02fb2f55387` (tag object `07687d169a5e181789869817f10f3e8a4a4c30a9`) |

Method. Code files were fetched with `curl -fsSL https://raw.githubusercontent.com/<org>/<repo>/<tag>/<path>` and line numbers read with `awk 'NR>=a&&NR<=b'` / `grep -n`. Docs pages were fetched with `curl` and the HTML tags stripped with a Python regex, so docs quotes carry an anchor, not a line number. Nothing here went through WebFetch except one failed attempt at the MIT Press page (HTTP 403, no content used). Source types: 1 = source code, 2 = official docs for that version, 3 = paper/design doc, 4 = engineer post. "Observation" blocks are runs on a specific version and are not sources.

Machine used for observations: Python 3.13.15 (Homebrew; closest available to v3.13.0) and 3.14.7; Go 1.27.1 local plus Go 1.22.0 via `GOTOOLCHAIN=go1.22.0`; no Java installed (no Java observation).

---

## Chapter 1: CPython `list`

### Claim 1. A list holds a pointer to a separate array of object pointers (`ob_item`) plus an `allocated` count; the length is stored separately (`ob_size`).

- Link: [Include/cpython/listobject.h L5-L22](https://github.com/python/cpython/blob/v3.13.0/Include/cpython/listobject.h#L5-L22)
- Quote, L7-L8: `/* Vector of pointers to list elements.  list[0] is ob_item[0], etc. */` then `PyObject **ob_item;`
- Invariants comment, L10-L16: "ob_item contains space for 'allocated' elements.  The number currently in use is ob_size." Then `0 <= ob_size <= allocated`, `len(list) == ob_size`, `ob_item == NULL implies ob_size == allocated == 0`, and "list.sort() temporarily sets allocated to -1 to detect mutations."
- L21: `Py_ssize_t allocated;`
- Where `ob_size` lives: `PyObject_VAR_HEAD` (listobject.h L6) is `PyVarObject ob_base;` ([Include/object.h L154](https://github.com/python/cpython/blob/v3.13.0/Include/object.h#L154)) and `PyVarObject` has `Py_ssize_t ob_size; /* Number of items in variable part */` ([object.h L224-L227](https://github.com/python/cpython/blob/v3.13.0/Include/object.h#L224-L227)).
- Docs corroboration: Python FAQ, [How are lists implemented in CPython?](https://docs.python.org/3.13/faq/design.html#how-are-lists-implemented-in-cpython): "CPython's lists are really variable-length arrays, not Lisp-style linked lists." and "keeps a pointer to this array and the array's length in a list head structure".
- Type: 1 (struct), 2 (FAQ). Opened: curl + `sed`/`awk`; FAQ via curl + regex.
- Status: sourced. Note the invariant is `ob_size <= allocated`, not "capacity" in the docs; the docs never use the word `allocated`.

### Claim 2. `list.append` writes in place when there is spare room and calls `list_resize` only when full.

Real call chain at v3.13.0:

1. `list.append` clinic wrapper → `list_append_impl`, [listobject.c L1150-L1158](https://github.com/python/cpython/blob/v3.13.0/Objects/listobject.c#L1150-L1158): L1154 `if (_PyList_AppendTakeRef(self, Py_NewRef(object)) < 0) {`.
2. `_PyList_AppendTakeRef` is a `static inline` in [Include/internal/pycore_list.h L22-L40](https://github.com/python/cpython/blob/v3.13.0/Include/internal/pycore_list.h#L22-L40). L30: `if (allocated > len) {` then L34 `PyList_SET_ITEM(self, len, newitem);` and L36 `Py_SET_SIZE(self, len + 1);` (the in-place fast path). L39: `return _PyList_AppendTakeRefListResize(self, newitem);` (full).
3. `_PyList_AppendTakeRefListResize`, [listobject.c L503-L515](https://github.com/python/cpython/blob/v3.13.0/Objects/listobject.c#L503-L515): L508 `assert(self->allocated == -1 || self->allocated == len);`, L509 `if (list_resize(self, len + 1) < 0) {`, L513 stores the new item.
4. `list_resize`, [L94-L173](https://github.com/python/cpython/blob/v3.13.0/Objects/listobject.c#L94-L173).

- Type: 1. Opened: curl + `awk`.
- Status: sourced. Subtlety for the Chapter: the fast-path test is `allocated > len` (pycore_list.h L30), not the L103 early-return of `list_resize`; `list_resize` is reached on append only when the list is exactly full (the L508 assert says so).

### Claim 3. When `list_resize` reallocates, existing elements are moved by `realloc` (`PyMem_Realloc`), possibly to a new address.

- Link: [listobject.c L154-L171](https://github.com/python/cpython/blob/v3.13.0/Objects/listobject.c#L154-L171)
- L158: `items = (PyObject **)PyMem_Realloc(self->ob_item, target_bytes);` then L168 `self->ob_item = items;`
- Header comment L90-L91: "Note that self->ob_item may change, and even if newsize is less than ob_size on entry."
- Type: 1. Opened: curl + `awk`.
- Status: **corrected (qualified)**. This is only the default (GIL) build. The free-threaded build (`#ifdef Py_GIL_DISABLED`, L119-L153) does not call `realloc`: it allocates a fresh array (L130 `list_allocate_array`), `memcpy`s into it (L143) and frees the old one after publishing the new pointer (L152 `free_list_items`). The Chapter should say "reallocates (`PyMem_Realloc` in the default build)". The claim "possibly to a new address" is the contract of `realloc`, not stated in CPython's file other than L90-L91. [NEEDS SOURCE] for a sentence that `realloc` may move the block (C standard / allocator docs); the L90-L91 comment is the in-repo evidence.

### Claim 4. Growth pattern comment vs formula.

- Link: [listobject.c L109-L124](https://github.com/python/cpython/blob/v3.13.0/Objects/listobject.c#L109-L124)
- L111: "enough to give linear-time amortized behavior over a long" (continues L112-L113: "sequence of appends() in the presence of a poorly-performing system realloc()"). L115: "The growth pattern is:  0, 4, 8, 16, 24, 32, 40, 52, 64, 76, ..." L119: `new_allocated = ((size_t)newsize + (newsize >> 3) + 6) & ~(size_t)3;`
- Type: 1. Status: sourced; the comment matches the formula (script below). Stage 1 cited the pattern at L114; it is L115.

Script 1 (`py_growth.py`) replays `list_resize` (including the L103 keep-block test and the L123 rule) for appends one at a time from an empty list. Output:

```
append #n (newsize) -> new capacity:
  newsize=  1 -> allocated=4
  newsize=  5 -> allocated=8
  newsize=  9 -> allocated=16
  newsize= 17 -> allocated=24
  newsize= 25 -> allocated=32
  newsize= 33 -> allocated=40
  newsize= 41 -> allocated=52
  newsize= 53 -> allocated=64
  newsize= 65 -> allocated=76
  newsize= 77 -> allocated=92
  newsize= 93 -> allocated=108
  newsize=109 -> allocated=128
capacity sequence: [0, 4, 8, 16, 24, 32, 40, 52, 64, 76, 92, 108, 128]
```

Hand check: newsize=1: (1+0+6)&~3 = 7&~3 = 4. Full at 4, newsize=5: (5+0+6)=11&~3 = 8. newsize=9: (9+1+6)=16. newsize=17: (17+2+6)=25&~3 = 24. The comment's ten values match the first ten terms exactly; the comment's "..." continues 92, 108, 128.

Observation (not a source), `sys.getsizeof` on a growing list, capacity = (getsizeof - 56) / 8. Python 3.13.15 and 3.14.7 gave identical output:

```
(len when observed, implied capacity): [(0, 0), (1, 4), (5, 8), (9, 16), (17, 24), (25, 32), (33, 40), (41, 52), (53, 64), (65, 76), (77, 92), (93, 108), (109, 128)]
```

It matches the formula replay exactly. Full output in the scripts section.
- Status: sourced.

### Claim 5. Shrink rule and which operations call `list_resize` with a smaller size.

- Rule: [listobject.c L99-L107](https://github.com/python/cpython/blob/v3.13.0/Objects/listobject.c#L99-L107): L99-L102 "Bypass realloc() when a previous overallocation is large enough to accommodate the newsize. If the newsize falls lower than half the allocated size, then proceed with the realloc() to shrink the list." L103 `if (allocated >= newsize && newsize >= (allocated >> 1)) {`. After a shrink the new size is `(newsize + (newsize>>3) + 6) & ~3` (L119), i.e. the block shrinks to the usual over-allocated size for the smaller length, not to an exact fit.
- `list.pop`: [`list_pop_impl` L1486-L1528](https://github.com/python/cpython/blob/v3.13.0/Objects/listobject.c#L1486-L1528). L1507 `const Py_ssize_t size_after_pop = Py_SIZE(self) - 1;`, L1515 `memmove(&items[index], &items[index+1], ...)` (this is the O(n) shift for `pop(0)`), L1517 `status = list_resize(self, size_after_pop);`. Special case L1508-L1511: popping the last remaining element calls `list_clear(self)`, which frees the array and sets `allocated = 0`.
- `list.clear()` → `py_list_clear_impl` L1119-L1123 → `list_clear` → `list_clear_impl` [L827-L852](https://github.com/python/cpython/blob/v3.13.0/Objects/listobject.c#L827-L852): L839-L840 `a->ob_item = NULL; a->allocated = 0;` then `free_list_items` (no `list_resize`; it drops the whole block).
- `list.remove(x)` → L3310 `list_ass_slice_lock_held(self, i, i+1, NULL)`; slice deletion `del a[i:j]` (step 1) → L3631 `list_ass_slice`; both reach [L936-L946](https://github.com/python/cpython/blob/v3.13.0/Objects/listobject.c#L936-L946): `memmove` the tail, then L940 `list_resize(a, Py_SIZE(a) + d)` with negative `d`. If the result would be empty: L916-L919 `list_clear(a)`.
- Extended-slice deletion `del a[::k]`: L3678-L3679 `list_resize(self, Py_SIZE(self));`.
- `extend` from an iterator "cuts back" an over-guessed length: L1259-L1263 `list_resize(self, Py_SIZE(self))`.
- **Correction (surprising): single-index `del a[i]` never shrinks.** `list_ass_subscript` L3605-L3611 sends an integer index to `list_ass_item`, whose delete branch ([L1065-L1071](https://github.com/python/cpython/blob/v3.13.0/Objects/listobject.c#L1065-L1071)) shifts the items with a loop and does `Py_SET_SIZE(a, size - 1)` with no `list_resize`. So `pop()` shrinks the block with hysteresis but `del a[-1]` does not. Observation below confirms.
- Type: 1. Opened: curl + `awk`.

Observation (Python 3.13.15, identical on 3.14.7), list of 1001 elements (cap 1132) reduced to 11 elements:

```
after del e[-1] x990: len 11 cap 1132 (was 1132 )
after pop x990: len 11 cap 20 (was 1132 )
after del g[10:]: len 10 cap 16 (was 1132 )
after clear: cap 0
pop from 100 down: (len, cap) at each capacity change: [(100, 108), (53, 64), (31, 40), (19, 24), (11, 16), (7, 12), (5, 8), (1, 4)]
```
- Status: sourced, with the `del a[i]` correction. A learner-facing sentence "removing elements shrinks the array once it is less than half full" is true of `pop`, `remove`, slice deletion and `clear`, and false for `del a[i]` at v3.13.0.

### Claim 6. "Do not overallocate if the new size is closer to overallocated size than to the old size."

- Link: [listobject.c L120-L124](https://github.com/python/cpython/blob/v3.13.0/Objects/listobject.c#L120-L124)
- Quote L120-L121: "Do not overallocate if the new size is closer to overallocated size than to the old size." Code L123-L124: `if (newsize - Py_SIZE(self) > (Py_ssize_t)(new_allocated - newsize)) new_allocated = ((size_t)newsize + 3) & ~(size_t)3;`
- Meaning: the list is being grown by `newsize - oldsize` slots in one step; if that jump is bigger than the padding the formula would add, the padding is skipped and only rounded up to a multiple of 4.
- When it applies: never for a single append. The padding `new_allocated - newsize` is at least 3 (`6` minus at most 3 for the `& ~3`, plus `newsize>>3`), while an append has `newsize - Py_SIZE == 1`. It applies to bulk growth, e.g. `extend`/`+=`/`insert` of many items: [`list_extend_fast` L1179](https://github.com/python/cpython/blob/v3.13.0/Objects/listobject.c#L1179) `list_resize(self, m + n)`, `list_extend_iter_lock_held` L1227, set/dict extend L1291/L1313/L1336, and `list_ass_slice` growth L949.
- Related, not the same rule: extending an empty list uses `list_preallocate_exact` (L1173-L1174, L1222), which rounds only to an even number ([L182-L187](https://github.com/python/cpython/blob/v3.13.0/Objects/listobject.c#L182-L187): "no benefit of allocating space for the odd number of items").
- Type: 1. Opened: curl + `awk`.

Observation (3.13.15, `py_extend.py`):
```
start len 2 cap 8
after extend by 100: len 102 cap 104 (formula alone: 120 ; 'closer' rule result: 104 )
append-only check: len 6 cap 12
```
- Status: sourced.

### Claim 7. Official docs on the cost of append and of insert/pop at the front.

- `collections.deque`: [docs.python.org/3.13/library/collections.html#collections.deque](https://docs.python.org/3.13/library/collections.html#collections.deque). Quote: "incur O(n) memory movement costs for pop(0) and insert(0, v) operations which change both the size and position of the underlying data representation." (Full sentence begins "Though list objects support similar operations, they are optimized for fast fixed-length operations and ...".) Type 2. Opened: curl + regex.
- Tutorial, [Using Lists as Queues](https://docs.python.org/3.13/tutorial/datastructures.html#using-lists-as-queues): "While appends and pops from the end of list are fast, doing inserts or pops from the beginning of a list is slow (because all of the other elements have to be shifted by one)." Type 2. Opened: curl + regex.
- FAQ ([design.html](https://docs.python.org/3.13/faq/design.html#how-are-lists-implemented-in-cpython)): "When items are appended or inserted, the array of references is resized." and "Some cleverness is applied to improve the performance of appending items repeatedly". The FAQ gives no big-O figure for append.
- Status: **corrected**. No official Python doc page I opened states that `append` is "amortised O(1)". The only first-party statement of amortised behaviour is the source comment at listobject.c L109-L113 ("linear-time amortized behavior over a long sequence of appends()"). The docs say "fast" (tutorial) and O(n) (deque docs) for the front. The Python wiki TimeComplexity page does state O(1) amortised append but is a wiki (a lead, not a source) and I did not open it. Mark any "append is O(1) amortised" sentence as sourced by the code comment only. The source-level evidence for the front cost is `list_pop_impl` L1515 (`memmove` of the tail) and `ins1` [L482-L483](https://github.com/python/cpython/blob/v3.13.0/Objects/listobject.c#L482-L483) (`for (i = n; --i >= where; ) items[i+1] = items[i];`).

---

## Chapter 2: Go slices

### Claim 8. A slice is a three-word header: pointer, length, capacity.

- Code: [src/runtime/slice.go L15-L19](https://github.com/golang/go/blob/go1.22.0/src/runtime/slice.go#L15-L19): `type slice struct {` / `array unsafe.Pointer` / `len   int` / `cap   int` / `}`. Type 1. Opened: curl + `grep -n`.
- Blog: [Go Slices: usage and internals](https://go.dev/blog/slices-intro), section "Slice internals". Quote: "It consists of a pointer to the array, the length of the segment, and its capacity". Also section "Growing slices": "This technique is how dynamic array implementations from other languages work behind the scenes." Type 4 (go.dev, by the Go team, 2011; the page is unversioned). Opened: curl + regex.
- Status: sourced. The runtime struct is the internal `slice`; the user-visible equivalent is `reflect.SliceHeader` (not opened).

### Claim 9. `append` on a full slice calls `growslice`, which allocates and copies; the old array is untouched.

- `growslice` doc comment, [slice.go L124-L148](https://github.com/golang/go/blob/go1.22.0/src/runtime/slice.go#L124-L148). L124 "growslice allocates new backing store for a slice." L143-L144: "A new backing store is allocated with space for at least newLen elements. Existing entries [0, oldLen) are copied over to the new backing store." L150-L153: "growslice's odd calling convention makes the generated code that calls this function simpler." (So the call to `growslice` is emitted by the compiler; I did not trace the compiler side.)
- Allocation and copy: L242 `p = mallocgc(capmem, nil, false)` (no-pointer element types) / L250 `p = mallocgc(capmem, et, true)`; L261 `memmove(p, oldPtr, lenmem)`; L263 `return slice{p, newLen, newcap}`. `oldPtr` is only read (L159, L258, L261 as source), never written, so the old array is left alone: this is my reading of the code, not a sentence in the source.
- Spec, pinned copy in the tag: [doc/go_spec.html L7273-L7276 @go1.22.0](https://github.com/golang/go/blob/go1.22.0/doc/go_spec.html#L7273-L7276): "If the capacity of s is not large enough to fit the additional values, append allocates a new, sufficiently large underlying array that fits both the existing slice elements and the additional values. Otherwise, append re-uses the underlying array." (quote at most the first half in the Chapter; the full sentence is 38 words.) Live page: [go.dev/ref/spec#Appending_and_copying_slices](https://go.dev/ref/spec#Appending_and_copying_slices) (opened by curl; unversioned, same sentence). Type 2.
- Observation (Go 1.22.0, `goalias`): 
```
a: [111 0 0 99] b: [0 0 0] same array? false
c: [222 0 0] d: [222 0 0 7] same array? true
```
  After `a = append(a, 99)` on a full slice, a write through `a` is not visible through `b`; with spare capacity, `append` shares the array.
- Status: sourced. The "other slices still see the old data" half is spec ("allocates a new ... array") plus code reading plus the observation; there is no single first-party sentence saying it.

### Claim 10. The rule change between go1.17 and go1.18.

- Commit: [`2dda92ff6f9f07eeb110ecbf0fc2d7a0ddd27f9d`](https://github.com/golang/go/commit/2dda92ff6f9f07eeb110ecbf0fc2d7a0ddd27f9d), "runtime: make slice growth formula a bit smoother". Author Keith Randall `<khr@golang.org>`, author date 2021-09-07T16:44:29Z, committer date 2021-09-27T20:53:51Z (the commit landed on 2021-09-27; go1.17 had been released in August 2021, and `go1.18` slice.go contains `const threshold = 256` at L193). Reviewed-by Martin Möhrmann; Gerrit CL 347917.
- Found with the API call given in the brief: `curl -fsSL "https://api.github.com/repos/golang/go/commits?path=src/runtime/slice.go&sha=go1.18&per_page=30"`, then `curl https://api.github.com/repos/golang/go/commits/2dda92ff6f` for the diff. Type 4/1 (commit message and diff by the author).
- Message, verbatim:

```
Instead of growing 2x for < 1024 elements and 1.25x for >= 1024 elements,
use a somewhat smoother formula for the growth factor. Start reducing
the growth factor after 256 elements, but slowly.

starting cap    growth factor
256             2.0
512             1.63
1024            1.44
2048            1.35
4096            1.30

(Note that the real growth factor, both before and now, is somewhat
larger because we round up to the next size class.)

This CL also makes the growth monotonic (larger initial capacities
make larger final capacities, which was not true before). See discussion
at https://groups.google.com/g/golang-nuts/c/UaVlMQ8Nz3o

256 was chosen as the threshold to roughly match the total number of
reallocations when appending to eventually make a very large
slice. (We allocate smaller when appending to capacities [256,1024]
and larger with capacities [1024,...]).
```
- The diff changes `if old.cap < 1024` to `const threshold = 256` / `if old.cap < threshold`, and `newcap += newcap / 4` to `newcap += (newcap + 3*threshold) / 4` in `src/runtime/slice.go` (+6/-2), with the same change in `src/reflect/value.go` (`grow`).
- Check of the commit's table (script 3 below): from cap 256, 512, 1024, 2048, 4096 the next cap is 512, 832, 1472, 2752, 5312, factors 2.0000, 1.6250, 1.4375, 1.3438, 1.2969. The commit's 1.35 for 2048 is 1.3438 rounded up (1.34); the rest match.
- Related earlier commit (not needed for the Chapter): `2333c6299f` "runtime: use old capacity to decide on append growth regime" (2020-09-25).
- Status: sourced. Stage 1's go1.17 and go1.22 line citations are consistent with this diff.

### Claim 11. Size-class rounding after `nextslicecap`.

- [slice.go L178](https://github.com/golang/go/blob/go1.22.0/src/runtime/slice.go#L178) `newcap := nextslicecap(newLen, oldCap)`; then per element size: L191 (size 1) `capmem = roundupsize(uintptr(newcap), noscan)`, L197 (pointer-sized) `capmem = roundupsize(uintptr(newcap)*goarch.PtrSize, noscan)` followed by L199 `newcap = int(capmem / goarch.PtrSize)`, L210 (power of two), L218 (other sizes). So the final capacity is `capmem / elemsize` after rounding the byte size up.
- **Correction to stage 1**: stage 1 cited "L191-L213 (`roundupsize`)" as if that were the function. Those lines are the call sites inside `growslice`. `roundupsize` itself is defined in `src/runtime/msize_allocheaders.go` ([L16-L36](https://github.com/golang/go/blob/go1.22.0/src/runtime/msize_allocheaders.go#L16-L36); build tag `goexperiment.allocheaders` at L5) and, for the other build, `msize_noallocheaders.go` L17-L29. The experiment is on by default in go1.22.0: [src/internal/buildcfg/exp.go L72-L78](https://github.com/golang/go/blob/go1.22.0/src/internal/buildcfg/exp.go#L72-L78), L76 `AllocHeaders:     true,`. The Go 1.22 release notes say that change "adjusts the size class boundaries of the memory allocator" ([go.dev/doc/go1.22](https://go.dev/doc/go1.22), Runtime section, opened by curl). The size class table itself (`class_to_size`) was not opened.
- Observation, Go 1.22.0 on arm64 (`gocap`, appending 2000 ints one at a time):

```
go1.22.0 arm64
len=1 cap=1
len=2 cap=2
len=3 cap=4
len=5 cap=8
len=9 cap=16
len=17 cap=32
len=33 cap=64
len=65 cap=128
len=129 cap=256
len=257 cap=512
len=513 cap=848
len=849 cap=1280
len=1281 cap=1792
len=1793 cap=2560
```
  Pure formula gives 832, 1232, 1732 after 512 (script 3); the real values are higher because of size classes (832 ints = 6656 bytes, rounded up to the 6784-byte class = 848 ints; that class value is my arithmetic from the observed 848, not read from the table).
- Observation, Go 1.27.1 (local toolchain, a different release from the Chapter's tag): `len=1 cap=4`, 5→8, 9→16, 17→32, ..., 513→848, 849→1280, 1281→1792, 1793→2560. Notably the first append gives cap 4, not 1 as in 1.22.0, so a Build that claims "real Go" capacities must name the version.
- Status: **corrected** (stage 1 line range) and sourced.

### Claim 12. Capacity trajectories, go1.17 vs go1.22 rules, pure formula.

Script 3 (`go_formula.py`) reproduces `growslice`'s `newcap` logic (go1.17 slice.go L181-L198; go1.22.0 `nextslicecap` L267-L299) from a nil slice, one append at a time, no size classes. Output:

```
go1.17 rule caps until len 5000: [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 1280, 1600, 2000, 2500, 3125, 3906, 4882, 6102]
go1.22 rule caps until len 5000: [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 832, 1232, 1732, 2357, 3138, 4114, 5334]

Side by side, caps in [256, 2048]  (ratio = cap / previous cap)
step |  go1.17  ratio |  go1.22  ratio
   8 |     256  2.000 |     256  2.000
   9 |     512  2.000 |     512  2.000
  10 |    1024  2.000 |     832  1.625
  11 |    1280  1.250 |    1232  1.481
  12 |    1600  1.250 |    1732  1.406
  13 |    2000  1.250 |    2357  1.361
```
The go1.17 factor drops from 2.0 to 1.25 between consecutive growths (1024 then 1280); the go1.22 factor slides 2.0, 1.625, 1.481, 1.406, 1.361. That is the "sudden transition" the Go 1.18 notes mention ([go.dev/doc/go1.18](https://go.dev/doc/go1.18): "The new formula is less prone to sudden transitions in allocation behavior."; stage 1 verified this quote).
- Status: sourced (formula replay is ours; inputs are the cited lines).

---

## Chapter 3: what is promised (Rust `Vec`, Java `ArrayList`)

### Claim 13. Rust docs: growth not guaranteed, amortised O(1) push, never shrinks automatically, caller controls.

All from [Vec, Rust 1.80.0](https://doc.rust-lang.org/1.80.0/std/vec/struct.Vec.html) (type 2; opened by curl + regex; anchors, no line numbers).

- [#guarantees](https://doc.rust-lang.org/1.80.0/std/vec/struct.Vec.html#guarantees): "Vec does not guarantee any particular growth strategy when reallocating when full, nor when reserve is called." Next sentences: "The current strategy is basic and it may prove desirable to use a non-constant growth factor. Whatever strategy is used will of course guarantee O(1) amortized push."
- Same section: "Vec will never automatically shrink itself, even if completely empty." and the stated reason, "Emptying a Vec and then filling it back up to the same len should incur no calls to the allocator." and "If you wish to free up unused memory, use shrink_to_fit or shrink_to."
- Same section: "Most fundamentally, Vec is and always will be a (pointer, capacity, length) triplet." (a contract on the layout, useful against Chapter 2).
- [#capacity-and-reallocation](https://doc.rust-lang.org/1.80.0/std/vec/struct.Vec.html#capacity-and-reallocation): "if the vector's length is increased to 11, it will have to reallocate, which can be slow." and "it is recommended to use Vec::with_capacity whenever possible to specify how big the vector is expected to get."
- [#method.push](https://doc.rust-lang.org/1.80.0/std/vec/struct.Vec.html#method.push), "Time complexity": "Takes amortized O(1) time." and "This expensive operation is offset by the capacity O(1) insertions it allows." (first-party amortisation argument; see claim 17).
- [#method.reserve](https://doc.rust-lang.org/1.80.0/std/vec/struct.Vec.html#method.reserve): "The collection may reserve more space to speculatively avoid frequent reallocations." [#method.reserve_exact](https://doc.rust-lang.org/1.80.0/std/vec/struct.Vec.html#method.reserve_exact): "this will not deliberately over-allocate to speculatively avoid frequent allocations."
- [#method.shrink_to_fit](https://doc.rust-lang.org/1.80.0/std/vec/struct.Vec.html#method.shrink_to_fit): "The resulting vector might still have some excess capacity" (so shrinking is also not exact). [#method.truncate](https://doc.rust-lang.org/1.80.0/std/vec/struct.Vec.html#method.truncate): "this method has no effect on the allocated capacity of the vector."
- Code backs it: [vec/mod.rs L1993-L2006](https://github.com/rust-lang/rust/blob/1.80.0/library/alloc/src/vec/mod.rs#L1993-L2006) `push` does `if len == self.buf.capacity() { self.buf.grow_one(); }` (L1998-L1999); `grow_one` (raw_vec.rs L363-L367) calls `grow_amortized`; `finish_grow` (L552-L577) calls `alloc.grow` or `alloc.allocate`.
- Status: sourced.

### Claim 14. `MIN_NON_ZERO_CAP` values and comment.

- [raw_vec.rs L133-L144 @1.80.0](https://github.com/rust-lang/rust/blob/1.80.0/library/alloc/src/raw_vec.rs#L133-L144). Comment L133-L137: "Tiny Vecs are dumb. Skip to:" "8 if the element size is 1, because any heap allocators is likely to round up a request of less than 8 bytes to at least 8 bytes." "4 if elements are moderate-sized (<= 1 KiB)." "1 otherwise, to avoid wasting too much space for very short Vecs." Code L138-L144: 8 when `size_of::<T>() == 1`, 4 when `<= 1024`, else 1. Applied at L480: `let cap = cmp::max(Self::MIN_NON_ZERO_CAP, cap);` after L479 `cmp::max(self.cap.0 * 2, required_cap)`; L477 "This guarantees exponential growth."
- Type 1. Opened: curl + `awk`. Status: sourced (matches stage 1).

### Claim 15. Java `ArrayList`: javadoc, `ensureCapacity`, `trimToSize`, and does `remove` shrink?

Javadoc in the source at jdk-21+35, [ArrayList.java L42-L58](https://github.com/openjdk/jdk/blob/jdk-21%2B35/src/java.base/share/classes/java/util/ArrayList.java#L42-L58), and the same text on the Oracle API page [ArrayList (Java SE 21)](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/ArrayList.html) (opened by curl + regex).
- L44-L45: "The add operation runs in amortized constant time, that is, adding n elements requires O(n) time."
- L52-L54: "The details of the growth policy are not specified beyond the fact that adding an element has constant amortized time cost."
- L56-L58: "An application can increase the capacity of an ArrayList instance before adding a large number of elements using the ensureCapacity operation."
- `trimToSize` L194-L206: "An application can use this operation to minimize the storage of an ArrayList instance."; code L201-L204 copies to `Arrays.copyOf(elementData, size)` (or the shared empty array if size is 0).
- Growth code: `grow(int)` L231-L241: `ArraysSupport.newLength(oldCapacity, minCapacity - oldCapacity, oldCapacity >> 1)` then `Arrays.copyOf` (a new array and a copy); first growth of a default-constructed list: `new Object[Math.max(DEFAULT_CAPACITY, minCapacity)]` (L239, `DEFAULT_CAPACITY = 10` at L118).
- **`remove` never shrinks the backing array.** `remove(int)` L550-L558 → `fastRemove` [L719-L725](https://github.com/openjdk/jdk/blob/jdk-21%2B35/src/java.base/share/classes/java/util/ArrayList.java#L719-L725): `System.arraycopy` to shift, then `es[size = newSize] = null;`; `clear()` L731-L736 nulls the slots and sets `size = 0`; `removeRange` L817-L831 shifts and nulls. None assigns `elementData`. `grep -n 'elementData = '` finds assignments only in constructors (L156-L190), `trimToSize` (L202), `grow` (L237, L239), and `readObject` (L984-L986); shrinking happens only through `trimToSize` (and clone/serialisation). Memory held by removed slots is released by nulling them, not by shrinking the array.
- Type 1 and 2. Opened: curl + `awk`/`grep`. Status: sourced. Note the javadoc says nothing about shrinking at all; the "never shrinks on remove" statement is from reading the code at this tag (no Java runtime here to run an observation).

### Claim 16. `ArraysSupport.newLength` and `SOFT_MAX_ARRAY_LENGTH`.

- [ArraysSupport.java L680-L692](https://github.com/openjdk/jdk/blob/jdk-21%2B35/src/java.base/share/classes/jdk/internal/util/ArraysSupport.java#L680-L692): L692 `public static final int SOFT_MAX_ARRAY_LENGTH = Integer.MAX_VALUE - 8;` L681-L690: "Some JVMs (such as HotSpot) have an implementation limit that will cause OutOfMemoryError("Requested array size exceeds VM limit") to be thrown if a request is made to allocate an array of some length near Integer.MAX_VALUE" and the soft maximum is "chosen conservatively".
- [newLength L735-L747](https://github.com/openjdk/jdk/blob/jdk-21%2B35/src/java.base/share/classes/jdk/internal/util/ArraysSupport.java#L735-L747), [hugeLength L749-L759](https://github.com/openjdk/jdk/blob/jdk-21%2B35/src/java.base/share/classes/jdk/internal/util/ArraysSupport.java#L749-L759). L740 `int prefLength = oldLength + Math.max(minGrowth, prefGrowth); // might overflow`. If `0 < prefLength && prefLength <= SOFT_MAX_ARRAY_LENGTH` return it (L741-L742). Otherwise `hugeLength`: if `oldLength + minGrowth` overflows to negative, throw `OutOfMemoryError("Required array length ... is too large")` (L751-L753); else if it is at most the soft max, return the soft max (L754-L755); else return the minimum required length (L757), which may exceed the soft max.
- Javadoc L702-L704: "The returned length is usually clamped at the soft maximum length in order to avoid hitting the JVM implementation limit. However, the soft maximum will be exceeded if the minimum growth amount requires it." L722-L725: the method "cannot detect the JVM's implementation limit", so the caller may still get `OutOfMemoryError`.
- Effect for `ArrayList`: the 1.5x preferred growth is dropped near the limit; the array then grows to `Integer.MAX_VALUE - 8` and after that only by the minimum needed (one slot per full append), and throws `OutOfMemoryError` when the required length overflows `int`.
- Type 1. Opened: curl + `awk`. Status: sourced.

---

## Across the Topic

### Claim 17. Amortised cost of append under multiplicative growth.

Sources found:
- CLRS, *Introduction to Algorithms*, 3rd edition (MIT Press, 2009), Chapter 17 "Amortized Analysis" (p. 451), section 17.4 "Dynamic tables", starts on p. 463. Confirmed from a scan of the book's front-matter contents pages hosted by the HTW Berlin library ([sisis.rz.htw-berlin.de/inh2014/12449310.pdf](https://sisis.rz.htw-berlin.de/inh2014/12449310.pdf), opened by curl, text extracted with `pypdf`; lines "17 Amortized Analysis 451" and "17.4 Dynamic tables 463"). The publisher's own page (mitpress.mit.edu) returned HTTP 403 to curl and WebFetch, so the page numbers are confirmed from the contents pages, not from mitpress.mit.edu. A web search summary I got claimed the section was 16.4 on p. 460; that is wrong for the 3rd edition per the scan (in the 4th edition amortised analysis moved to Chapter 16, which I did not verify). The text of the section was not available to me: **[NEEDS SOURCE]** for a quotable sentence from CLRS 17.4; a human with the book should supply the quote and the page of the statement.
- CPython, listobject.c L109-L113: "enough to give linear-time amortized behavior over a long sequence of appends() in the presence of a poorly-performing system realloc()". Type 1.
- Rust, raw_vec.rs L477 "This guarantees exponential growth." (type 1); Vec docs `push` "Takes amortized O(1) time. ... This expensive operation is offset by the capacity O(1) insertions it allows." (type 2), and "Whatever strategy is used will of course guarantee O(1) amortized push."
- Java, ArrayList javadoc L44-L45 and L52-L54 (claim 15). Type 1/2.
- Go: no sentence in `slice.go`, the spec or the 1.18 commit message says "amortised". The blog's example `AppendByte` has the comment "allocate double what's needed, for future growth." (go.dev/blog/slices-intro, section "Growing slices"; type 4). The Go spec only says "sufficiently large". So Go has no first-party amortised claim.

Derivation (OURS, to be checked by a human). Start from capacity c0 and grow by factor g > 1 whenever full, so the capacities are c0·g^k. A reallocation at capacity c copies c elements. The last reallocation among n appends happens when the list has c < n elements, and the earlier ones copy c/g, c/g^2, ...
1. Total copies < c(1 + 1/g + 1/g^2 + ...) = c·g/(g-1) < n·g/(g-1).
2. Writing the n appends themselves as n, the total work is at most n(1 + g/(g-1)) = O(n), so the amortised cost per append is O(1).
3. Equivalently the copies per append are at most g/(g-1), which is (up to the constant factor g ≤ 2) the n/(g-1) form: **corrected** from the brief's "n/(g-1)": the tight bound with this accounting is n·g/(g-1); both are O(n/(g-1)).
4. g = 2: bound 2n (observed ~1.05n at n = 10^6). g = 1.5: bound 3n (observed 2.70n). g = 1.125: bound 9n (observed 8.68n). Smaller g means more copies, with the bound blowing up as 1/(g-1); this is why CPython's mild factor is paired with a note about `realloc` being fast (L112-L113), and why Java's and Rust's factors differ.
5. The observed numbers are from script 4 (integer growth, start capacity 16, no size classes). For the real formulas at n = 10^6: CPython 8.445, Go go1.22 4.106, Go go1.17 4.131, Rust 1.049, Java 2.431 copies per append.
- Status: sourced for "amortised" wording in four projects except Go; the derivation is ours; the CLRS quote is [NEEDS SOURCE].

### Claim 18. Why growing by a fixed amount is quadratic.

Derivation (OURS). Grow by a fixed k slots when full. After n appends there have been about n/k reallocations; the j-th copies about j·k elements. Total copies ≈ k(1 + 2 + ... + n/k) = k·(n/k)(n/k+1)/2 ≈ n²/(2k). So n appends cost Θ(n²) for any fixed k, i.e. Θ(n) per append (amortised linear, not constant). Script 4 with k = 1024: n = 10^4, 10^5, 10^6 gives 46,240 / 4,868,640 / 488,234,256 copies, against n²/(2k) = 48,828 / 4,882,812 / 488,281,250.
- Any of the four sources say so? Searched the fetched files for "quadratic", "O(n^2)": the only hit is listobject.c L1711 about sort data movement, unrelated. No source in the four codebases or docs I opened states that fixed-increment growth is quadratic. The nearest implicit statements are Rust L477 "This guarantees exponential growth." and CPython L109-L113 (proportional over-allocation gives linear total time). **[NEEDS SOURCE]** for an explicit first-party statement. CLRS 17.4 likely discusses why the table must grow by a constant factor; unverified without the text. The Chapter can state the derivation as ours.
- Status: NEEDS SOURCE (derivation ours).

### Claim 19. First-party statement that a factor below 2 may be preferred (memory reuse).

- Searched: CPython listobject.c, Go slice.go (go1.17, go1.22.0) and commit 2dda92ff6f's message, Rust raw_vec.rs and vec/mod.rs, Rust Vec docs, Java ArrayList.java and ArraysSupport.java, Java SE 21 API page, Python FAQ and tutorial. Terms: "golden", "reuse", "fragment", "1.5". The only reuse text is unrelated ("the buffer may simply be reused by another allocation", Rust Vec docs, about data erasure; `reuse` in listobject.c L1870 about a counter).
- What the sources do say about *why* their factor: CPython: over-allocation is "mild" (L110) and still gives linear total time with a slow `realloc` (L111-L113). Go: the 2x→1.25x change is "smoother" and monotonic, with the threshold chosen "to roughly match the total number of reallocations" (commit message); nothing about memory reuse. Rust: "guarantees exponential growth" and the docs say a "non-constant growth factor" may be desirable. Java: the factor is a preferred growth of `oldCapacity >> 1` with no rationale given.
- Status: **[NEEDS SOURCE]. Leave the memory-reuse / golden-ratio claim out of the Chapters.** The first-party reasons the Chapters may give are the ones quoted above (Go commit message: smoothness, monotonic, total reallocation count; CPython: mild is enough).

---

## Corrections to stage 1 and surprises

1. Stage 1 cited `roundupsize` at slice.go L191-L213; those lines are call sites. The function is in `msize_allocheaders.go` L16-L36 (default build in 1.22.0).
2. Stage 1 cited the CPython growth-pattern comment at L114; it is L115 (L109-L113 is the rationale).
3. `del a[i]` does not shrink a CPython list (claim 5); `pop`, `remove`, slice deletion, `clear` do.
4. CPython's free-threaded build does not use `realloc` (claim 3).
5. The Python FAQ and tutorial do not say "amortised O(1)" (claim 7).
6. The go1.18 commit's table says 1.35 for 2048; the formula gives 1.3438 (claim 10).
7. Go 1.27.1's first append to a nil `[]int` gives cap 4, Go 1.22.0 gives cap 1 (claim 11).
8. The simple bound n/(g-1) for total copies is not quite tight; n·g/(g-1) is (claim 17).
9. The first-party Rust `push` docs contain an explicit amortisation argument ("offset by the capacity O(1) insertions it allows").

## Table of claims

| # | Claim (short) | Status |
|---|---|---|
| 1 | list = ob_item + allocated, ob_size separate | sourced |
| 2 | append in place, `list_resize` when full; call chain | sourced |
| 3 | realloc moves elements | corrected (default build only; free-threaded build allocates and copies); "may move" sentence [NEEDS SOURCE] beyond L90-L91 |
| 4 | growth pattern vs formula | sourced (replay and observation agree) |
| 5 | shrink rule and shrinking operations | corrected (`del a[i]` never calls `list_resize`) |
| 6 | "do not overallocate" rule | sourced |
| 7 | docs on append and front insert/pop cost | corrected (no official "amortised O(1)" for append; docs say "fast", front O(n)) |
| 8 | slice is ptr, len, cap | sourced |
| 9 | append calls growslice, new array, old left alone | sourced (old-array-untouched is code reading plus observation) |
| 10 | go1.17 to go1.18 rule change | sourced (commit 2dda92ff6f; table value 1.35 is 1.34) |
| 11 | size-class rounding | corrected (stage 1 line range; real definition in msize_allocheaders.go) |
| 12 | trajectories 1.17 vs 1.22 | sourced (formula replay) |
| 13 | Rust docs promises | sourced |
| 14 | MIN_NON_ZERO_CAP | sourced |
| 15 | Java javadoc, ensureCapacity, trimToSize, remove never shrinks | sourced (remove behaviour from code at the tag) |
| 16 | newLength and SOFT_MAX_ARRAY_LENGTH | sourced |
| 17 | amortised cost of append | corrected (bound is n·g/(g-1)); CLRS location confirmed (3rd ed., 17.4, p. 463); CLRS quote [NEEDS SOURCE]; Go has no first-party statement |
| 18 | fixed growth is quadratic | NEEDS SOURCE (derivation ours; no first-party statement found) |
| 19 | factor below 2 for memory reuse | NEEDS SOURCE (leave the claim out) |

## [NEEDS SOURCE] list

1. Claim 3: a first-party sentence that `realloc` may return a different address (only CPython's L90-L91 comment found).
2. Claim 17: a quotable sentence from CLRS 17.4 (location confirmed, text not read).
3. Claim 17: a first-party "amortised" statement for Go (none exists in what I opened).
4. Claim 18: a first-party statement that fixed-increment growth is quadratic.
5. Claim 19: any first-party statement preferring a factor below 2 for memory reuse. Leave out of the Chapters.
6. Claim 7: an official Python doc stating `append` is amortised O(1) (only the source comment).
7. Not opened, for completeness: the Go compiler's emission of the `growslice` call (claim 9) and the size class table `class_to_size` (claim 11).

## Every link opened

Code (raw files via `https://raw.githubusercontent.com/<org>/<repo>/<tag>/<path>`):
- python/cpython `v3.13.0`: Objects/listobject.c, Include/cpython/listobject.h, Include/internal/pycore_list.h, Include/object.h
- golang/go `go1.22.0`: src/runtime/slice.go, src/runtime/msize_allocheaders.go, src/runtime/msize_noallocheaders.go, src/internal/buildcfg/exp.go, doc/go_spec.html
- golang/go `go1.17`: src/runtime/slice.go; `go1.18`: src/runtime/slice.go (grep for `threshold` only)
- rust-lang/rust `1.80.0`: library/alloc/src/raw_vec.rs, library/alloc/src/vec/mod.rs
- openjdk/jdk `jdk-21+35`: src/java.base/share/classes/java/util/ArrayList.java, src/java.base/share/classes/jdk/internal/util/ArraysSupport.java
- GitHub API: `https://api.github.com/repos/golang/go/commits?path=src/runtime/slice.go&sha=go1.18&per_page=30`, `https://api.github.com/repos/golang/go/commits/2dda92ff6f`
- `git ls-remote` for tags of python/cpython, golang/go, rust-lang/rust, openjdk/jdk

Docs (curl + regex):
- https://docs.python.org/3.13/faq/design.html
- https://docs.python.org/3.13/library/collections.html
- https://docs.python.org/3.13/tutorial/datastructures.html
- https://go.dev/ref/spec
- https://go.dev/blog/slices-intro
- https://go.dev/doc/go1.22
- https://doc.rust-lang.org/1.80.0/std/vec/struct.Vec.html
- https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/ArrayList.html
- https://sisis.rz.htw-berlin.de/inh2014/12449310.pdf (CLRS 3rd ed. contents pages)

Failed or not used: https://mitpress.mit.edu/9780262046305/ and `/9780262033848/` (HTTP 403 via curl and WebFetch, nothing used); one web search for the CLRS table of contents (its summary was wrong and was not used).

## Scripts run and their output

All in the scratchpad `da/` directory, not committed. Environment: `python3` 3.14.7, `/opt/homebrew/bin/python3.13` 3.13.15, Go 1.27.1 local and Go 1.22.0 via `GOTOOLCHAIN`.

### Script 1: `py_growth.py` (claim 4)

Replays `list_resize` with the L103 keep-block test, L119 formula, L123 rule. Output shown under claim 4.

### Script 2: `py_obs.py` (claims 4, 5), Python 3.13.15

```
3.13.15 (main, Aug  5 2026, 12:25:43) [Clang 21.0.0 (clang-2100.1.1.101)]
empty-list getsizeof: 56 bytes; pointer size 8
(len when observed, implied capacity): [(0, 0), (1, 4), (5, 8), (9, 16), (17, 24), (25, 32), (33, 40), (41, 52), (53, 64), (65, 76), (77, 92), (93, 108), (109, 128)]
capacity sequence: [0, 4, 8, 16, 24, 32, 40, 52, 64, 76, 92, 108, 128]
extend(range(10)) on empty -> implied cap 10
list(range(100)) implied cap 100
[0]*100 implied cap 100
pop from 100 down: (len, cap) at each capacity change: [(100, 108), (53, 64), (31, 40), (19, 24), (11, 16), (7, 12), (5, 8), (1, 4)]
after del e[-1] x990: len 11 cap 1132 (was 1132 )
after pop x990: len 11 cap 20 (was 1132 )
after del g[10:]: len 10 cap 16 (was 1132 )
after clear: cap 0
```
The 3.14.7 run printed the identical lines after its version header (`3.14.7 (main, Aug  5 2026, 10:29:49) ...`).

### Script 2b: `py_extend.py` (claim 6), Python 3.13.15

```
start len 2 cap 8
after extend by 100: len 102 cap 104 (formula alone: 120 ; 'closer' rule result: 104 )
append-only check: len 6 cap 12
```

### Script 3: `go_formula.py` (claims 10, 12)

Output shown under claim 12, plus the check of the commit's table:

```
commit 2dda92ff6f table check (factor from starting cap, go1.22 rule):
  start cap   256: next cap   512  factor 2.0000   (go1.17 rule: 512 factor 2.0000)
  start cap   512: next cap   832  factor 1.6250   (go1.17 rule: 1024 factor 2.0000)
  start cap  1024: next cap  1472  factor 1.4375   (go1.17 rule: 1280 factor 1.2500)
  start cap  2048: next cap  2752  factor 1.3438   (go1.17 rule: 2560 factor 1.2500)
  start cap  4096: next cap  5312  factor 1.2969   (go1.17 rule: 5120 factor 1.2500)
```

### Script 4: `amortised.py` (claims 17, 18)

```
Geometric growth, n appends, copies/n versus bound g/(g-1):
n=   10000  g=2.0: copies/n= 1.637 (bound g/(g-1) =  2.00)  g=1.5: copies/n= 2.076 (bound g/(g-1) =  3.00)  g=1.125: copies/n= 8.791 (bound g/(g-1) =  9.00)
n=  100000  g=2.0: copies/n= 1.311 (bound g/(g-1) =  2.00)  g=1.5: copies/n= 2.367 (bound g/(g-1) =  3.00)  g=1.125: copies/n= 8.234 (bound g/(g-1) =  9.00)
n= 1000000  g=2.0: copies/n= 1.049 (bound g/(g-1) =  2.00)  g=1.5: copies/n= 2.696 (bound g/(g-1) =  3.00)  g=1.125: copies/n= 8.681 (bound g/(g-1) =  9.00)

Fixed growth by k=1024 slots: copies and copies/n (grows with n):
n=   10000  copies=       46240  copies/n=      4.6   n^2/(2k)=       48828
n=  100000  copies=     4868640  copies/n=     48.7   n^2/(2k)=     4882812
n= 1000000  copies=   488234256  copies/n=    488.2   n^2/(2k)=   488281250

Pure-formula copies per append, n = 10^6 (no size classes; CPython shrink rule not involved):
  CPython (n+n>>3+6)&~3    copies/n =  8.445
  Go go1.22 rule           copies/n =  4.106
  Go go1.17 rule           copies/n =  4.131
  Rust: max(2*cap, needed, MIN) -> g=2 :  1.049
  Java: cap + cap>>1 (min needed)  :  2.431
```

### Go programs

`gocap/main.go` (append 2000 ints, print each capacity change), run with `GOTOOLCHAIN=go1.22.0 go run .`: output under claim 11. The same program on Go 1.27.1:

```
go1.27.1 arm64
len=1 cap=4
len=5 cap=8
len=9 cap=16
len=17 cap=32
len=33 cap=64
len=65 cap=128
len=129 cap=256
len=257 cap=512
len=513 cap=848
len=849 cap=1280
len=1281 cap=1792
len=1793 cap=2560
```

`goalias/main.go`, run with Go 1.22.0: output under claim 9.

### Shell checks

- `git ls-remote` for the tag commits listed at the top.
- `grep -n` for `elementData = ` in ArrayList.java (claim 15): matches at L156, 158, 169, 184, 186, 190, 202, 237, 239, 483, 515, 760, 792, 984, 986 (the L483, 515, 760, 792 hits are local-variable assignments from `grow`, not the field's shrinking).
- `grep -n -i 'quadratic|O(n^2)|golden|reuse|fragment'` over the fetched sources (claims 18, 19): no relevant hit.
