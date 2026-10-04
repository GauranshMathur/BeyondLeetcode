# Candidate Topics: hashing, heaps, search and trees

Research date: 2026-10-04. Slice: hash tables, heaps / priority queues, binary search / sorted arrays, balanced trees and B-trees, tries / radix trees.

## How this was verified

- "Opened" means the file or page was fetched and read in full or in the relevant region. Source files were fetched with `curl` from `raw.githubusercontent.com` at the exact tag or commit named in each permalink, and line numbers were located with `grep -n` on the fetched file. Every `#L` range below is therefore the line in that tagged file. Web pages (Go blog posts, SQLite file-format page) were fetched with WebFetch.
- WebFetch returns a model-written summary, not raw text. Quotes taken from WebFetch pages are marked "(WebFetch)" and were not character-checked against the page. Where a source file says the same thing, the source file is the row's primary source.
- Tags used: CPython `v3.13.0`; Go `go1.24.0` (plus `go1.22.0` and `go1.21.0` where stated); Redis `7.2.5`; OpenJDK `jdk-21+35`; Rust `1.82.0`; hashbrown `v0.17.1`; Linux `v6.12`; Kubernetes `v1.31.0`; git `v2.47.0`; LevelDB `1.23`; PostgreSQL `REL_17_0`; SQLite `version-3.46.0`; libuv `v1.48.0`; nginx `release-1.26.2`; rax commit `1927550cb218ec3c3dda8b39d82d1d019bf0476d`.
- Source types: 1 = source code, 2 = official docs, 3 = original paper or design doc, 4 = talk or post by the system's own engineers.
- Papers, the Abseil design page, the CppCon talk and the Go enhanced-servemux design doc were **not opened** and are never used as a row's source. Where a source file cites one, that is said as "cited by file:line".

---

## Topic 1. Hash tables

### Real systems

| System | Decision it made | Primary source (link) | Exact quote / line | Type | Opened |
|---|---|---|---|---|---|
| CPython `dict` | Compact, ordered layout: a small index array plus a dense entries array, so iteration is insertion order | [dictobject.c#L13](https://github.com/python/cpython/blob/v3.13.0/Objects/dictobject.c#L13) | L13: "As of Python 3.6, this is compact and ordered." | 1 | yes |
| CPython `dict` | Open addressing, not chaining | [dictobject.c#L1220-L1221](https://github.com/python/cpython/blob/v3.13.0/Objects/dictobject.c#L1220-L1221) | L1220-1221: "Open addressing is preferred over chaining since the link overhead for chaining would be substantial" | 1 | yes |
| CPython `dict` | Probe by `j = 5*j + 1 + perturb`, shifting `perturb` right 5 bits each step, so every hash bit eventually matters | [dictobject.c#L336-L356](https://github.com/python/cpython/blob/v3.13.0/Objects/dictobject.c#L336-L356) | L341-345: "initializing a (unsigned) vrbl 'perturb' to the full hash code"; L345 `j = (5*j) + 1 + perturb;` | 1 | yes |
| CPython `dict` | Resize at 2/3 load | [dictobject.c#L565-L576](https://github.com/python/cpython/blob/v3.13.0/Objects/dictobject.c#L565-L576) | L576: `#define USABLE_FRACTION(n) (((n) << 1)/3)`; L566: "USABLE_FRACTION is the maximum dictionary load." | 1 | yes |
| CPython `dict` | `popitem` stays amortised O(1) in the compact layout | [dictobject.c#L92-L100](https://github.com/python/cpython/blob/v3.13.0/Objects/dictobject.c#L92-L100) | L98: "decrement dk_nentries to achieve amortized O(1)" | 1 | yes |
| Go `map` (1.24) | Swiss table: groups of 8 slots with a control word; H2 = low 7 bits of hash stored in the control byte; all 8 compared in parallel | [internal/runtime/maps/map.go#L18-L53](https://github.com/golang/go/blob/go1.24.0/src/internal/runtime/maps/map.go#L18-L53) | L18: "The map design is based on Abseil's 'Swiss Table' map design"; L29: "H2: Lower 7 bits of a hash." | 1 | yes |
| Go `map` (1.24) | Map is split into several tables selected by upper hash bits (extendible hashing) so a grow only rehashes one table | [map.go#L92-L106](https://github.com/golang/go/blob/go1.24.0/src/internal/runtime/maps/map.go#L92-L106) | L100-102: "Up to [maxTableCapacity], growth simply replaces this table with a replacement with double capacity. Beyond this limit, growth splits the table into two." | 1 | yes |
| Go `map` (1.24) | Same decision, told by the Go team | [go.dev/blog/swisstable](https://go.dev/blog/swisstable) (Michael Pratt, 26 Feb 2025) | "Go 1.24 includes a completely new implementation of the built-in map type, based on the Swiss Table design." (WebFetch) | 4 | yes |
| Redis `dict` | Chained buckets; when growth is needed, allocate a second table and migrate one bucket per operation (incremental rehash) | [dict.c#L286-L294](https://github.com/redis/redis/blob/7.2.5/src/dict.c#L286-L294), [dict.c#L408-L416](https://github.com/redis/redis/blob/7.2.5/src/dict.c#L408-L416) | L286: "Performs N steps of incremental rehashing."; L412: "so that the hash table automatically migrates from H1 to H2 while it is actively used." | 1 | yes |
| Redis `dict` | Grow when elements/buckets reaches 1:1 (unless resizing is avoided, then at ratio over 5) | [dict.c#L1410-L1424](https://github.com/redis/redis/blob/7.2.5/src/dict.c#L1410-L1424) | L1413-1416: "If we reached the 1:1 ratio ... we resize doubling the number of buckets." | 1 | yes |
| Java `HashMap` | Chained bins that turn into red-black-tree bins when they get too long | [HashMap.java#L146-L170](https://github.com/openjdk/jdk/blob/jdk-21+35/src/java.base/share/classes/java/util/HashMap.java#L146-L170) | L149: "when bins get too large, they are transformed into bins of TreeNodes"; L165: "worthwhile in providing worst-case O(log n) operations" | 1 | yes |
| Java `HashMap` | Thresholds: treeify at 8, untreeify at 6, only when table has at least 64 buckets | [HashMap.java#L260-L275](https://github.com/openjdk/jdk/blob/jdk-21+35/src/java.base/share/classes/java/util/HashMap.java#L260-L275) | L260 `TREEIFY_THRESHOLD = 8`; L267 `UNTREEIFY_THRESHOLD = 6`; L275 `MIN_TREEIFY_CAPACITY = 64` | 1 | yes |
| Java `HashMap` | Spread high bits into low bits (`h ^ h>>>16`) because the table masks with a power of two | [HashMap.java#L318-L339](https://github.com/openjdk/jdk/blob/jdk-21+35/src/java.base/share/classes/java/util/HashMap.java#L318-L339) | L338: `(h = key.hashCode()) ^ (h >>> 16)`; L321-322 "spreads (XORs) higher bits of hash to lower" | 1 | yes |
| Rust std `HashMap` | Is a port of SwissTable | [library/std/src/collections/hash/map.rs#L59-L60](https://github.com/rust-lang/rust/blob/1.82.0/library/std/src/collections/hash/map.rs#L59-L60) | L59: "The hash table implementation is a Rust port of Google's [SwissTable]." | 1 | yes |
| Rust `hashbrown` crate | Std adopted this crate; per-group tag matching (`match_tag`) | [README.md#L8-L16](https://github.com/rust-lang/hashbrown/blob/v0.17.1/README.md#L8-L16), [src/control/group/sse2.rs#L73](https://github.com/rust-lang/hashbrown/blob/v0.17.1/src/control/group/sse2.rs#L73) | README L15: "Since Rust 1.36, the Rust standard library has adopted this implementation for `HashMap`" | 1 | yes |

Notes. The std row is at Rust 1.82.0 and the crate rows are at hashbrown v0.17.1, which is not the version 1.82.0 vendors; do not merge them in a Chapter without checking the vendored version. The Redis rows are at 7.2.5; Redis later changed `dict.c`, so a Chapter must pin one release.

### Why the decision is interesting

- The same job gets four different answers: CPython keeps a dense entries array so iteration order is insertion order, at the price of an extra index array (dictobject.c:13); Go and Rust check 8 or more slots at once with control bytes (map.go:18-53; sse2.rs:73); Java rescues long chains with trees (HashMap.java:149); Redis refuses to pause for a resize and spreads the move over later operations (dict.c:286, 412).
- Each choice moves the cost somewhere else. Java's tree bins give a worst-case O(log n) bin lookup under bad hashes (HashMap.java:165, worst case); Redis's incremental rehash spreads the O(n) resize across operations so each pays a small amount (dict.c:286-294, amortised); open addressing and Swiss lookups are expected O(1) at bounded load, which none of the sources state as a theorem.
- CPython's `perturb` recurrence is a short, readable example of "use every hash bit without a second hash function" (dictobject.c:341-352).

### Build sketch

Build: `minidict`, a string-keyed map driven by commands on stdin (`SET k v`, `GET k`, `DEL k`, `ITER`, `STATS`). Spine is the CPython-style compact ordered table, because `ITER` then prints insertion order regardless of the hash function, so tests stay deterministic. Where a rung needs a hash, the spec fixes it (inputs are given as raw integer hashes, or the spec names 64-bit FNV-1a).

Core Problems:

1. Open-addressing table with fixed capacity and linear probing: `SET`/`GET` on a given capacity.
2. Delete with tombstones; `GET` after `DEL` must still find colliding keys.
3. Resize at a load limit (use 2/3 as in `USABLE_FRACTION`); print the capacity after each command. The capacity sequence depends only on the rule, not the hash.
4. Compact ordered layout: index array plus entries array; `ITER` prints insertion order and survives deletes.
5. Perturbed probing: input is a raw integer hash and a table size; print the probe sequence for the first N steps (`j = 5*j + 1 + perturb`, shift 5).
6. Incremental rehash: two tables, migrate one bucket per operation; print which table answered each `GET` and when migration finished.
7. Group match: 8 control bytes with 7-bit tags; given a group and a tag, print the match bitmask (the Swiss idea, without SIMD).

Extra Problems: word-frequency count in first-seen order; group anagrams (uses the finished Build as a dependency-free map).

### Prerequisites

Dynamic arrays (rungs 3, 4 and 6 are array growth in disguise). Arrays and integer bit operations (rungs 5 and 7).

### Source strength

Strong: five systems each carry an in-source comment that states the decision, all at pinned tags, and Go also has a first-party blog post.

### Risks

- Probe order and tombstone behaviour depend on the hash function and the language's string hashing; tests must feed integer hashes or fix FNV-1a, or they will differ across Python, TypeScript and Go.
- Real hash functions (SipHash in Rust, per-process randomisation in CPython and Go) are not covered by the sources above; a Chapter should not describe them without a new source. [NEEDS SOURCE] for any claim about default hash functions.
- Swiss-table SIMD cannot be taught in the three languages without hand-rolled bit tricks; rung 7 is deliberately the scalar version.
- Java tree bins need a tree, so that rung is not in the ladder; it fits better as a Chapter linked to the trees Topic.

---

## Topic 2. Heaps / priority queues

### Real systems

| System | Decision it made | Primary source (link) | Exact quote / line | Type | Opened |
|---|---|---|---|---|---|
| Go `container/heap` | Heap is an interface over any slice; min-heap, binary (children at 2i+1, 2i+2); `Fix` and `Remove` take an index | [heap.go#L5-L35](https://github.com/golang/go/blob/go1.24.0/src/container/heap/heap.go#L5-L35), [heap.go#L83](https://github.com/golang/go/blob/go1.24.0/src/container/heap/heap.go#L83) | L11: "A heap is a common way to implement a priority queue." L26: invariant `2*i+1 <= j <= 2*i+2` | 1 | yes |
| Go runtime timers | Per-P timer heap that is 4-ary (`timerHeapN = 4`) | [runtime/time.go#L1271](https://github.com/golang/go/blob/go1.24.0/src/runtime/time.go#L1271) | L1271: `const timerHeapN = 4`; L124: "heap is the set of timers, ordered by heap[i].when." | 1 | yes |
| Go runtime timers | Same 4-ary heap in go1.21.0 and go1.22.0 | [go1.22.0 runtime/time.go#L990](https://github.com/golang/go/blob/go1.22.0/src/runtime/time.go#L990) | L990: "The heap is 4-ary. See siftupTimer and siftdownTimer." | 1 | yes |
| CPython `heapq` | Plain list as the heap; 0-based; `heap[0]` smallest; `heappop` moves the last item to the root then sifts | [Lib/heapq.py#L20-L31](https://github.com/python/cpython/blob/v3.13.0/Lib/heapq.py#L20-L31), [#L137-L145](https://github.com/python/cpython/blob/v3.13.0/Lib/heapq.py#L137-L145) | L29-30: "heap[0] is the smallest item, and heap.sort() maintains the heap invariant!" | 1 | yes |
| CPython `heapq` | Sift all the way to a leaf, then bubble back up, to cut comparisons because comparisons may be user code | [heapq.py#L221-L247](https://github.com/python/cpython/blob/v3.13.0/Lib/heapq.py#L221-L247) | L226: "We *could* break out of the loop as soon as we find a pos where newitem <= both its children" (and explains why not); table "14996 cut to 8680" | 1 | yes |
| CPython `asyncio` | Scheduled callbacks live in a `heapq` list; cancelled handles are removed lazily, and the heap is rebuilt when over half are cancelled and there are more than 100 | [base_events.py#L57-L63](https://github.com/python/cpython/blob/v3.13.0/Lib/asyncio/base_events.py#L57-L63), [#L815](https://github.com/python/cpython/blob/v3.13.0/Lib/asyncio/base_events.py#L815), [#L1955-L1969](https://github.com/python/cpython/blob/v3.13.0/Lib/asyncio/base_events.py#L1955-L1969) | L57-58: "Minimum number of _scheduled timer handles before cleanup of cancelled handles is performed."; L815 `heapq.heappush(self._scheduled, timer)`; L1968 `heapq.heapify(new_scheduled)` | 1 | yes |
| Linux `min_heap` | Generic array min-heap with caller-supplied `less` and `swp` callbacks; sift-down goes to a leaf first, then backs up | [include/linux/min_heap.h#L32-L40](https://github.com/torvalds/linux/blob/v6.12/include/linux/min_heap.h#L32-L40), [#L77-L108](https://github.com/torvalds/linux/blob/v6.12/include/linux/min_heap.h#L77-L108) | L86: "Find the sift-down path all the way to the leaves." | 1 | yes |
| Linux perf events | Real user of `min_heap`: merges perf event groups ordered by group index with `min_heapify_all` | [kernel/events/core.c#L3788-L3793](https://github.com/torvalds/linux/blob/v6.12/kernel/events/core.c#L3788-L3793), [#L3873](https://github.com/torvalds/linux/blob/v6.12/kernel/events/core.c#L3873) | L3788: `DEFINE_MIN_HEAP(struct perf_event *, perf_event_min_heap);` L3873: `min_heapify_all(&event_heap, &perf_min_heap, NULL);` | 1 | yes |
| Kubernetes scheduler | Priority queue built on `container/heap`, plus a key-to-index map so an object can be updated or removed by key (`heap.Fix`, `heap.Remove`) | [pkg/scheduler/internal/heap/heap.go#L45-L50](https://github.com/kubernetes/kubernetes/blob/v1.31.0/pkg/scheduler/internal/heap/heap.go#L45-L50), [#L138-L148](https://github.com/kubernetes/kubernetes/blob/v1.31.0/pkg/scheduler/internal/heap/heap.go#L138-L148) | L47-48: "items is a map from key of the objects to the objects and their index." L145 `heap.Fix(h.data, h.data.items[key].index)` | 1 | yes |
| Kubernetes scheduler | Three holding areas: `activeQ` (a heap), `backoffQ`, `unschedulablePods` | [pkg/scheduler/internal/queue/scheduling_queue.go#L17-L25](https://github.com/kubernetes/kubernetes/blob/v1.31.0/pkg/scheduler/internal/queue/scheduling_queue.go#L17-L25) | L21: "activeQ holds pods that are being considered for scheduling." | 1 | yes |
| libuv timers | Pointer-based binary min heap: nodes carry `left`, `right`, `parent`; timers are removed by node | [src/heap-inl.h#L28-L45](https://github.com/libuv/libuv/blob/v1.48.0/src/heap-inl.h#L28-L45), [#L55](https://github.com/libuv/libuv/blob/v1.48.0/src/heap-inl.h#L55), [src/timer.c#L89](https://github.com/libuv/libuv/blob/v1.48.0/src/timer.c#L89) | L33-34: "A binary min heap. The usual properties hold: the root is the lowest element in the set" | 1 | yes |
| nginx timers | Event timers are a red-black tree, not a heap | [src/event/ngx_event_timer.c#L13-L26](https://github.com/nginx/nginx/blob/release-1.26.2/src/event/ngx_event_timer.c#L13-L26), [ngx_event_timer.h#L84](https://github.com/nginx/nginx/blob/release-1.26.2/src/event/ngx_event_timer.h#L84) | `.c` L13: `ngx_rbtree_t ngx_event_timer_rbtree;` `.h` L84: `ngx_rbtree_insert(&ngx_event_timer_rbtree, &ev->timer);` | 1 | yes |

The libuv and nginx rows state what was built, not why; no comment in the opened files explains the choice over an array heap (see the open-items list at the end). The nginx row is a counter-example worth a Chapter beat: same job (find the next timer to fire), different structure.

### Why the decision is interesting

- Four systems answer "which timer fires next" with four shapes: Go uses a 4-ary array heap (time.go:1271), CPython uses a binary list heap with lazy deletion (base_events.py:815, 1955-1969), libuv uses a pointer-linked binary heap that can remove a given node (heap-inl.h:28-31, 55), nginx uses a red-black tree (ngx_event_timer.c:13). The Go source records that the 4-ary shape existed since at least go1.21 (time.go:990 at go1.22.0).
- `heapq` and the Linux `min_heap` both avoid early exit in sift-down and go to a leaf first; `heapq` states the reason, fewer comparisons because comparisons can be expensive user code (heapq.py:226-247). The Linux file shows the same shape (min_heap.h:86) but states no reason in the opened lines.
- "Cancel" is the awkward operation. asyncio never removes from the middle: it marks handles cancelled, skips them at the head, and rebuilds with `heapify` (O(n)) once more than half are cancelled (base_events.py:57-63, 1955-1969, amortised). Kubernetes pays for a key-to-index map so it can `Fix` or `Remove` in O(log n) (k8sheap.go:47, 145, worst case, standard heap cost; the O(log n) figure is the textbook bound and is not stated in the opened file).

### Build sketch

Build: `timerq`, a timer scheduler driven by commands (`SCHED id when`, `CANCEL id`, `UPDATE id when`, `ADVANCE t`, `PEEK`). `ADVANCE` prints fired ids in order. Ties are broken by (when, insertion sequence) so the output is the same for every correct heap. A binary and a 4-ary heap give the same pop order but different array layouts, so only rungs that print the array fix the arity (binary) and use distinct keys.

Core Problems:

1. Binary min-heap: `PUSH x`, `POP`; print popped values.
2. Heapify an array in O(n) (as `Init` and `min_heapify_all`); print the resulting array for distinct keys, binary arity.
3. Timer fire order: `SCHED`/`ADVANCE` with the (when, sequence) tie-break.
4. Update and remove by id using an id-to-index map (the Kubernetes shape); print array after each op.
5. Lazy cancel: mark cancelled, skip at the head, rebuild when more than half of handles (and more than 100) are cancelled; print when the rebuild happens (asyncio shape).
6. d-ary heap: arity d is an input, children at d*i+1..d*i+d; print the array for distinct keys (Go's 4-ary).
7. Bottom-up sift-down: print the number of comparisons used by N pops, which must equal the reference count (heapq's trick). Comparison counts are deterministic given distinct keys.

Extra Problems: merge k sorted lists; running median with two heaps.

### Prerequisites

Dynamic arrays. Index arithmetic. A hash map for rung 4 (id to index), so hash tables first, or allow a plain array scan in the early version.

### Source strength

Strong: the Go, CPython, Kubernetes and Linux facts are all pinned code; the rationale is weaker for libuv, nginx and Go's 4-ary choice.

### Risks

- The "why" for libuv's pointer heap, nginx's rbtree and Go's arity is not in the opened sources; a Chapter must not invent it. [NEEDS SOURCE] x3.
- Pop order for ties is implementation-specific; the tie-break rule must be in every spec.
- Kubernetes scheduling-queue internals change between releases (the three-queue description is at v1.31.0 only).

---

## Topic 3. Binary search / sorted arrays

### Real systems

| System | Decision it made | Primary source (link) | Exact quote / line | Type | Opened |
|---|---|---|---|---|---|
| git pack index (v2) | Sorted object-name table, plus a 256-entry fan-out table indexed by the first byte of the name, so a lookup binary-searches only one slice | [gitformat-pack.txt#L176-L184](https://github.com/git/git/blob/v2.47.0/Documentation/gitformat-pack.txt#L176-L184) | L179-181: "N-th entry of this table records the number of objects in the corresponding pack, the first byte of whose object name is less than or equal to N." | 2 | yes |
| git pack index (v2) | Names are stored apart from offsets to keep the binary search cache-friendly | [gitformat-pack.txt#L276-L279](https://github.com/git/git/blob/v2.47.0/Documentation/gitformat-pack.txt#L276-L279) | L276-278: "These are packed together without offset values to reduce the cache footprint of the binary search" | 2 | yes |
| git lookup code | `bsearch_hash` takes `lo` and `hi` from the fan-out table, then halves | [hash-lookup.c#L107-L134](https://github.com/git/git/blob/v2.47.0/hash-lookup.c#L107-L134), [packfile.c#L1894-L1916](https://github.com/git/git/blob/v2.47.0/packfile.c#L1894-L1916) | L112-113: `hi = ntohl(fanout_nbo[*hash]);` `lo = ((*hash == 0x0) ? 0 : ntohl(fanout_nbo[*hash - 1]));` | 1 | yes |
| CPython `bisect` | `bisect_right`/`insort` in pure Python, replaced by a C version when available; `key=` support | [Lib/bisect.py#L21-L55](https://github.com/python/cpython/blob/v3.13.0/Lib/bisect.py#L21-L55), [#L110-L112](https://github.com/python/cpython/blob/v3.13.0/Lib/bisect.py#L110-L112) | L110: "Overwrite above definitions with a fast C implementation" | 1 | yes |
| Go `sort.Search` | Binary search over a predicate, not over a value: smallest `i` where `f(i)` is true, "not found" returns `n` | [sort/search.go#L9-L16](https://github.com/golang/go/blob/go1.24.0/src/sort/search.go#L9-L16), [#L58-L72](https://github.com/golang/go/blob/go1.24.0/src/sort/search.go#L58-L72) | L9-10: "Search uses binary search to find and return the smallest index i in [0, n) at which f(i) is true" | 1 | yes |
| LevelDB SSTable | Index block holds one entry per data block (key >= last key in that block); lookups binary-search the index, then the block | [doc/table_format.md#L41-L44](https://github.com/google/leveldb/blob/1.23/doc/table_format.md#L41-L44) | L41-43: "An "index" block. This block contains one entry per data block" | 2 | yes |
| LevelDB block | Prefix compression with a full "restart point" every K keys; seek binary-searches the restart array, then scans | [table/block_builder.cc#L5-L13](https://github.com/google/leveldb/blob/1.23/table/block_builder.cc#L5-L13), [table/block.cc#L164-L167](https://github.com/google/leveldb/blob/1.23/table/block.cc#L164-L167) | `block_builder.cc` L12-13: "restart points, and can be used to do a binary search when looking for a particular key"; `block.cc` L165: "Binary search in restart array to find the last restart point" | 1 | yes |

### Why the decision is interesting

- git and LevelDB both avoid binary-searching the whole thing: git narrows with a 256-entry fan-out table (gitformat-pack.txt:179-181; hash-lookup.c:112-113), LevelDB narrows with an index block and then restart points inside the block (table_format.md:41-43; block.cc:165). Both are "search a small sorted array, then a smaller one."
- Layout is part of the decision: git stores names in their own table to cut the search's cache footprint (gitformat-pack.txt:276-278), and LevelDB trades key bytes (prefix compression) for a linear scan of at most K entries after the binary search (block_builder.cc:5-13).
- Binary search is O(log n) comparisons in the worst case; the Go doc defines the monotone-predicate contract that makes it reusable for "first true" problems (search.go:9-16).

### Build sketch

Build: `packindex`, a lookup index over fixed-width hex ids read from stdin. Probe counts are deterministic if the spec fixes `mid = lo + (hi - lo) / 2`.

Core Problems:

1. `lower_bound` and `upper_bound` on a sorted array of integers (the `bisect_left`/`bisect_right` pair).
2. Insert-keeping-sorted (`insort`) and count of elements in `[a, b)`.
3. `Search(n, f)` with a monotone predicate defined by the input (for example, minimum capacity that works); prints the first true index or `n`.
4. Build the 256-entry fan-out table from sorted ids; print it.
5. Lookup via fan-out then binary search over the slice; print found/not found and the number of comparisons.
6. Restart-point block: prefix-compress sorted keys with a restart every K; seek by binary search over restarts then linear scan; print the entry found and the number of keys scanned.

Extra Problems: search in a rotated sorted array; find the peak in a mountain array.

### Prerequisites

None beyond arrays and integer arithmetic. Rung 4 and later use hex and byte indexing; rung 6 uses strings.

### Source strength

Medium: git and LevelDB docs and code are pinned and say what is done, but the sources state the structure more than the reasoning for most of it, and the Go and CPython rows are API-level.

### Risks

- This is the closest of the five to what LeetCode already teaches; the value is the layout decisions (fan-out, restart points), which are two systems only.
- git's pack index format has v1 and v2 and a multi-pack-index; a Chapter must pin the version (this file is at v2.47.0, v2 index).
- Claims about why git chose a 256-way fan-out (versus other widths) are not in the opened sources. [NEEDS SOURCE] for any such claim.

---

## Topic 4. Balanced trees and B-trees

### Real systems

| System | Decision it made | Primary source (link) | Exact quote / line | Type | Opened |
|---|---|---|---|---|---|
| Linux rbtree | Red-black tree with the node embedded in the user struct; user writes own search/insert loops; locking left to the user | [Documentation/core-api/rbtree.rst#L50-L58](https://github.com/torvalds/linux/blob/v6.12/Documentation/core-api/rbtree.rst#L50-L58) | L53-54: "each instance of struct rb_node is embedded in the data structure it organizes." | 2 | yes |
| Linux rbtree | Why a red-black tree: bounded rotations on update | [rbtree.rst#L12-L20](https://github.com/torvalds/linux/blob/v6.12/Documentation/core-api/rbtree.rst#L12-L20) | L19-20: "at most two rotations and three rotations, respectively, to balance the tree" | 2 | yes |
| Linux rbtree | Cached leftmost pointer so `rb_first` is O(1) | [rbtree.rst#L196-L214](https://github.com/torvalds/linux/blob/v6.12/Documentation/core-api/rbtree.rst#L196-L214) | L201-202: "users can use 'struct rb_root_cached' to optimize O(logN) rb_first() calls to a simple pointer fetch" | 2 | yes |
| Linux scheduler (EEVDF) | Run queue is an rbtree ordered by deadline, augmented with the subtree minimum `vruntime`, so it also works as a heap for eligibility | [kernel/sched/fair.c#L889-L905](https://github.com/torvalds/linux/blob/v6.12/kernel/sched/fair.c#L889-L905), [#L846-L866](https://github.com/torvalds/linux/blob/v6.12/kernel/sched/fair.c#L846-L866) | L899-900: "We can do this in O(log n) time due to an augmented RB-tree." L903: `se->min_vruntime = min(se->vruntime, se->{left,right}->min_vruntime)` | 1 | yes |
| Linux epoll | Each watched file descriptor is an entry in an rbtree (`rbr`), cached-leftmost variant | [fs/eventpoll.c#L125-L130](https://github.com/torvalds/linux/blob/v6.12/fs/eventpoll.c#L125-L130), [#L201](https://github.com/torvalds/linux/blob/v6.12/fs/eventpoll.c#L201) | L126-127: "have an entry of this type linked to the "rbr" RB tree." L201: `struct rb_root_cached rbr;` | 1 | yes |
| Java `TreeMap` | Red-black tree with guaranteed log(n) get/put/remove | [TreeMap.java#L35-L44](https://github.com/openjdk/jdk/blob/jdk-21+35/src/java.base/share/classes/java/util/TreeMap.java#L35-L44) | L40-41: "This implementation provides guaranteed log(n) time cost for the containsKey, get, put and remove operations." | 1 | yes |
| Rust `BTreeMap` | B-tree, not a BST, to cut allocations and cache misses at the cost of more comparisons | [library/alloc/src/collections/btree/map.rs#L41-L66](https://github.com/rust-lang/rust/blob/1.82.0/library/alloc/src/collections/btree/map.rs#L41-L66) | L49: "every single comparison should be a cache-miss"; L53: "makes each node contain B-1 to 2B-1 elements in a contiguous array" | 1 | yes |
| Rust `BTreeMap` | Node search is naive linear search; B is 6 | [map.rs#L61-L66](https://github.com/rust-lang/rust/blob/1.82.0/library/alloc/src/collections/btree/map.rs#L61-L66), [node.rs#L42](https://github.com/rust-lang/rust/blob/1.82.0/library/alloc/src/collections/btree/node.rs#L42) | `map.rs` L61: "Currently, our implementation simply performs naive linear search."; `node.rs` L42: `const B: usize = 6;` | 1 | yes |
| SQLite | Two kinds of B-tree: table (integer key, data in leaves) and index (any key, no data) | [fileformat2.html section 1.6](https://www.sqlite.org/fileformat2.html) (unversioned page, fetched 2026-10-04) | "Table b-trees use a 64-bit signed integer key and store all data in the leaves." | 2 | yes |
| SQLite | Page of N entries and N+1 child pointers; lookup reads O(log M) pages | [src/btreeInt.h#L19-L33](https://github.com/sqlite/sqlite/blob/version-3.46.0/src/btreeInt.h#L19-L33) | L19-20: "each page of the file contains N database entries and N+1 pointers to subpages"; L32: "Finding a particular key requires reading O(log(M)) pages" | 1 | yes |
| PostgreSQL nbtree | Lehman and Yao B-tree: right-link and high key on each page let searches run without read locks | [src/backend/access/nbtree/README#L6-L28](https://github.com/postgres/postgres/blob/REL_17_0/src/backend/access/nbtree/README#L6-L28) | L17-18: "L&Y adds a right-link pointer to each page, to the page's right sibling. It also adds a 'high key'" | 1 | yes |

The Lehman and Yao paper and the Lanin and Shasha paper are cited by nbtree README L6-12 and were not opened.

### Why the decision is interesting

- Two memory-model answers to the same problem: the Linux and Java trees keep one key per node and rely on balancing (rbtree.rst:19-20; TreeMap.java:40-41, both worst case), while Rust's B-tree packs up to 2B-1 keys into a contiguous array and pays extra comparisons for fewer allocations and cache misses (btree/map.rs:49-56). The Rust docs say the expected cost with linear node search is B * log(n) comparisons (map.rs:64-65, expected).
- Linux does not treat a balanced tree as a plain map: the run queue is an rbtree augmented with a subtree minimum so it behaves like a heap on eligibility, giving O(log n) selection (fair.c:899-903, as stated by the source).
- B-trees are also about disks and concurrency, not only caches: SQLite's pages hold N keys and N+1 child pointers (btreeInt.h:19-20), and PostgreSQL adds a high key and right-link so a reader can detect a concurrent split and step right (nbtree README:17-28).

### Build sketch

Build: `ordmap`, an ordered map over integer keys with `INS k v`, `GET k`, `DEL k`, `RANGE a b`, `DUMP`. Tests print in-order sequences, or a level-order dump for structure rungs. Red-black insert and B-tree insert with a fixed order B and the usual split rule are deterministic, so level-order dumps are testable; the dump format and tie rules go in each spec. Lehman and Yao high keys and right-links are a concurrency design and cannot be tested single-threaded with stdin and stdout, so they stay Chapter reading, not a Core Problem.

Core Problems:

1. Unbalanced BST: insert, find, in-order dump.
2. Order statistics: floor, ceiling, `RANGE a b`, rank.
3. Rotations and red-black insertion; print a level-order dump with colours and the black-height.
4. Augmented subtree minimum (`min_vruntime` shape): after each insert or delete print the root's augmented value; query "earliest eligible" with the EEVDF-style rule given in the spec.
5. B-tree of order B: insert with node splits; print the level-order dump of nodes.
6. B-tree range scan: `RANGE a b` that walks leaves; print keys and number of nodes visited.
7. Red-black delete (hardest rung; optional tail).

Extra Problems: k-th smallest in a BST; merge intervals with an ordered map.

### Prerequisites

Binary search / sorted arrays (rung 5's in-node search is a binary search or linear scan); recursion and pointer-like structures; ideally heaps first (for rung 4's "tree as heap" comparison).

### Source strength

Strong: five systems with pinned code and docs, and Rust, Linux and PostgreSQL state their reasoning in-source.

### Risks

- Red-black deletion is long and error-prone to teach and to test; it may need to be an Extra.
- B-tree split and merge conventions vary (order versus minimum degree, split points); specs must pin one.
- The Rust docs say linear search per node; the language's own wording could change by release (pinned here to 1.82.0).
- Kernel scheduler text at v6.12 describes EEVDF; any claim that EEVDF replaced the earlier scheduler, or why, is [NEEDS SOURCE].

---

## Topic 5. Tries / radix trees

### Real systems

| System | Decision it made | Primary source (link) | Exact quote / line | Type | Opened |
|---|---|---|---|---|---|
| Redis `rax` | Compressed radix tree with packed nodes; edge bytes stored in the parent so a lookup avoids touching useless children | [rax README.md#L30](https://github.com/antirez/rax/blob/1927550cb218ec3c3dda8b39d82d1d019bf0476d/README.md#L30) (repo `antirez/rax`, the standalone project Redis took `src/rax.c` from) | L30: "Edges are stored as arrays of bytes directly in the parent node, no need to access non useful children" | 3 (author's own README) | yes |
| Redis `rax` | Rax is a radix tree in the Redis source (`src/rax.h`); Redis streams hold their entries in it | [src/rax.h#L1](https://github.com/redis/redis/blob/7.2.5/src/rax.h#L1), [src/stream.h#L17](https://github.com/redis/redis/blob/7.2.5/src/stream.h#L17) | `rax.h` L1: "Rax -- A radix tree implementation."; `stream.h` L17: `rax *rax; /* The radix tree holding the stream. */` | 1 | yes |
| Go `net/http` ServeMux | Request matching uses a decision tree: host, then method, then one level per path segment; "more specific wins" can force backtracking | [src/net/http/routing_tree.go#L5-L16](https://github.com/golang/go/blob/go1.22.0/src/net/http/routing_tree.go#L5-L16) | L5-6: "This file implements a decision tree for fast matching of requests to patterns."; L12: "The "more specific wins" precedence rule can result in backtracking." | 1 | yes |
| Go `net/http` ServeMux | Child edges are a slice up to 8 entries, then a map | [src/net/http/mapping.go#L9-L22](https://github.com/golang/go/blob/go1.22.0/src/net/http/mapping.go#L9-L22) | L9: "A mapping tries to pick a representation that makes [mapping.find] most efficient."; L22: `var maxSlice int = 8` | 1 | yes |
| Go 1.22 routing (announcement) | New patterns (methods, wildcards), "most specific wins", conflicts panic at registration | [go.dev/blog/routing-enhancements](https://go.dev/blog/routing-enhancements) (Jonathan Amsterdam for the Go team, 13 Feb 2024) | "The most specific pattern wins" (WebFetch) | 4 | yes |
| Linux FIB (IPv4) | LC-trie: path compression plus level compression; each internal node indexes a child array by a slice of the key | [Documentation/networking/fib_trie.rst#L28-L46](https://github.com/torvalds/linux/blob/v6.12/Documentation/networking/fib_trie.rst#L28-L46) | L28 heading "Path Compression / skipped bits"; L39 "Level Compression / child arrays" | 2 | yes |
| Linux FIB (IPv4) | Source header says it is based on the LPC-trie; lookup finds the longest prefix match | [net/ipv4/fib_trie.c#L12-L20](https://github.com/torvalds/linux/blob/v6.12/net/ipv4/fib_trie.c#L12-L20), [#L1471](https://github.com/torvalds/linux/blob/v6.12/net/ipv4/fib_trie.c#L1471) | L12: "This work is based on the LPC-trie which is originally described in:"; L1471: "Step 1: Travel to the longest prefix match in the trie" | 1 | yes |
| Linux XArray | Array of pointers built as a tree of 64-slot chunks (4 on small builds); good for dense indices, not for hashed keys; page cache is its main user | [include/linux/xarray.h#L1138-L1150](https://github.com/torvalds/linux/blob/v6.12/include/linux/xarray.h#L1138-L1150), [Documentation/core-api/xarray.rst#L12-L30](https://github.com/torvalds/linux/blob/v6.12/Documentation/core-api/xarray.rst#L12-L30) | `xarray.h` L1148: `XA_CHUNK_SHIFT (IS_ENABLED(CONFIG_BASE_SMALL) ? 4 : 6)`; `xarray.rst` L21-22: "efficient when the indices used are densely clustered; hashing the object and using the hash as the index will not perform well." | 1 and 2 | yes |

`lib/xarray.c` L15 includes `radix-tree.h`, so the XArray shares code with the older radix-tree API. Any statement about when or why the XArray replaced the radix tree is [NEEDS SOURCE]; the opened `.rst` does not use the words "radix tree".

### Why the decision is interesting

- Three different tries for three different key types: rax compresses byte strings and stores edges inside the parent (README:30), ServeMux splits URL patterns by segment and keeps wildcards and backtracking in the tree (routing_tree.go:5-16), and the FIB trie indexes IP prefixes by bit slices with both path and level compression (fib_trie.rst:28-46).
- The FIB doc says the search skips compressed bits, so each leaf must keep a copy of its key to check the match (fib_trie.rst:28-37; read together with fib_trie.c:1471 for the longest-prefix step).
- Fanout is chosen by workload: XArray picks 64 slots because larger nodes cost memory, as its own comment weighs it (xarray.h:1138-1146: 576-byte node, seven per 4 kB page); ServeMux avoids map overhead for the common case of a few children (mapping.go:9, 22).

### Build sketch

Build: `routetrie`, a routing table. Commands: `ADD pattern value`, `MATCH key`, `LIST prefix`, `DUMP`. Tests assert answers (longest-prefix and iteration order), not node layout, because LC-trie halve/double heuristics would not be reproduced exactly by a learner's code. Structural rungs print only node counts for a defined compression rule.

Core Problems:

1. Byte-string trie: insert, exact lookup, delete.
2. Prefix iteration: `LIST prefix` prints keys in lexicographic order.
3. Path-compressed (radix) trie: print the node count after each insert (a defined splitting rule).
4. Longest-prefix match on IPv4 prefixes (bitwise trie): `ADD 10.0.0.0/8 A`, `MATCH 10.1.2.3`.
5. Path-segment router with `{name}` wildcards: "most specific wins" with backtracking, as in `routing_tree.go`; print matched value and captured names.
6. Fixed-fanout index tree (XArray shape): `SET i v`, `GET i` with 64-way chunks and shift-and-mask walking; print the tree height after each set.

Extra Problems: autocomplete top-k; word-search on a grid with a trie.

### Prerequisites

Hash tables (children maps; mapping in ServeMux is slice-then-map), strings, recursion. Fixed-array children could remove the hash-table dependency for rungs 1-2 only.

### Source strength

Medium: ServeMux and the FIB trie are pinned code with a Linux doc, but rax's reasoning rests on a README outside the Redis tree and the XArray history is unsourced; the Go blog covers pattern features, not the data structure.

### Risks

- Go design doc (`go.dev/design/enhanced-servemux`) redirected to a googlesource URL that returned 404; it was not opened and is not cited. [NEEDS SOURCE] for why the Go team chose a decision tree.
- The ServeMux file is verified at go1.22.0 and go1.24.0 for the cited lines; go1.22.0 is cited so the version matches the blog's "Go 1.22".
- Real FIB lookups include rebalancing heuristics (inflate/halve) that cannot be tested from stdout.
- The README for rax is the author's repo, not the Redis tree; pinned to a commit, but a Chapter should check the matching `src/rax.c` comments (opened at 7.2.5, header comment only).

---

## Ranking, first Topic, and open items

### Ranked list (best Topic first)

1. **Hash tables.** Five systems with clearly different, source-stated decisions; a Build that grows naturally; deterministic tests via a compact ordered table or fixed hash.
2. **Heaps / priority queues.** Four to five timer and queue designs including a counter-example (nginx); the Build (timer scheduler) is easy to test; rationale gaps for libuv, nginx and Go's arity.
3. **Balanced trees and B-trees.** Strongest set of pinned sources and in-source reasoning (Rust, Linux, PostgreSQL), but the longest ladder and the hardest rung (delete); concurrency parts are not testable.
4. **Tries / radix trees.** Three solid code sources (ServeMux, FIB trie, rax) but the least rationale text, and some structure cannot be tested from stdout.
5. **Binary search / sorted arrays.** Good layout stories (git fan-out, LevelDB restart points) but only two systems carry a real decision, and the basic technique is already taught elsewhere; better as a short Topic or the opening of another.

### Which could be a first Topic with no prerequisites

Binary search / sorted arrays: rungs need only arrays and integer arithmetic, and every later Topic here uses it (the tree Topic's in-node search, the trie Topic's sorted iteration). Heaps and hash tables both need dynamic arrays first. Tries could start with fixed-size array children, but the real systems (ServeMux's slice-then-map, rax) assume maps and strings, so they are not a clean first Topic.

### Every [NEEDS SOURCE] marker

1. Hash tables: any claim about default hash functions (SipHash in Rust, per-process randomisation in CPython and Go). Not opened.
2. Heaps: why libuv uses a pointer-based binary heap rather than an array heap. The opened files give structure only.
3. Heaps: why nginx keeps timers in a red-black tree rather than a heap. The opened files give structure only.
4. Heaps: why Go's timer heap is 4-ary. The opened files give arity only (go1.21.0, go1.22.0, go1.24.0).
5. Binary search: why git uses a 256-way fan-out table rather than another width.
6. Trees: any claim that EEVDF replaced the earlier Linux scheduler, or why.
7. Tries: when and why the XArray replaced the radix-tree API.
8. Tries: why the Go team chose a decision tree for ServeMux (design doc not opened).

Count: 8 distinct items. In the body they are marked inline at: hash tables Risks (item 1), heaps Risks (items 2-4 in one marker), binary-search Risks (item 5), trees Risks (item 6), tries note under the table (item 7) and tries Risks (item 8).

### Links opened

Source files (fetched from raw.githubusercontent.com at the tag or commit shown; each has the matching blob permalink above):

- https://github.com/python/cpython/blob/v3.13.0/Objects/dictobject.c
- https://github.com/python/cpython/blob/v3.13.0/Objects/dictnotes.txt
- https://github.com/python/cpython/blob/v3.13.0/Lib/heapq.py
- https://github.com/python/cpython/blob/v3.13.0/Lib/bisect.py
- https://github.com/python/cpython/blob/v3.13.0/Lib/asyncio/base_events.py
- https://github.com/golang/go/blob/go1.24.0/src/internal/runtime/maps/map.go
- https://github.com/golang/go/blob/go1.24.0/src/container/heap/heap.go
- https://github.com/golang/go/blob/go1.24.0/src/runtime/time.go
- https://github.com/golang/go/blob/go1.22.0/src/runtime/time.go
- https://github.com/golang/go/blob/go1.21.0/src/runtime/time.go
- https://github.com/golang/go/blob/go1.24.0/src/sort/search.go
- https://github.com/golang/go/blob/go1.24.0/src/net/http/routing_tree.go
- https://github.com/golang/go/blob/go1.22.0/src/net/http/routing_tree.go
- https://github.com/golang/go/blob/go1.22.0/src/net/http/mapping.go
- https://github.com/golang/go/blob/go1.24.0/src/net/http/mapping.go
- https://github.com/golang/go/blob/go1.24.0/src/net/http/pattern.go
- https://github.com/redis/redis/blob/7.2.5/src/dict.c
- https://github.com/redis/redis/blob/7.2.5/src/rax.c
- https://github.com/redis/redis/blob/7.2.5/src/rax.h
- https://github.com/redis/redis/blob/7.2.5/src/stream.h
- https://github.com/redis/redis/blob/7.2.5/src/t_stream.c
- https://github.com/redis/redis/blob/7.2.5/src/cluster.c
- https://github.com/antirez/rax/blob/1927550cb218ec3c3dda8b39d82d1d019bf0476d/README.md
- https://github.com/openjdk/jdk/blob/jdk-21+35/src/java.base/share/classes/java/util/HashMap.java
- https://github.com/openjdk/jdk/blob/jdk-21+35/src/java.base/share/classes/java/util/TreeMap.java
- https://github.com/rust-lang/rust/blob/1.82.0/library/std/src/collections/hash/map.rs
- https://github.com/rust-lang/rust/blob/1.82.0/library/alloc/src/collections/btree/map.rs
- https://github.com/rust-lang/rust/blob/1.82.0/library/alloc/src/collections/btree/node.rs
- https://github.com/rust-lang/hashbrown/blob/v0.17.1/README.md
- https://github.com/rust-lang/hashbrown/blob/v0.17.1/src/lib.rs
- https://github.com/rust-lang/hashbrown/blob/v0.17.1/src/control/group/sse2.rs
- https://github.com/rust-lang/hashbrown/blob/v0.17.1/src/control/group/generic.rs
- https://github.com/torvalds/linux/blob/v6.12/include/linux/min_heap.h
- https://github.com/torvalds/linux/blob/v6.12/kernel/events/core.c
- https://github.com/torvalds/linux/blob/v6.12/lib/test_min_heap.c
- https://github.com/torvalds/linux/blob/v6.12/Documentation/core-api/rbtree.rst
- https://github.com/torvalds/linux/blob/v6.12/Documentation/core-api/xarray.rst
- https://github.com/torvalds/linux/blob/v6.12/Documentation/networking/fib_trie.rst
- https://github.com/torvalds/linux/blob/v6.12/include/linux/xarray.h
- https://github.com/torvalds/linux/blob/v6.12/lib/xarray.c
- https://github.com/torvalds/linux/blob/v6.12/net/ipv4/fib_trie.c
- https://github.com/torvalds/linux/blob/v6.12/kernel/sched/fair.c
- https://github.com/torvalds/linux/blob/v6.12/fs/eventpoll.c
- https://github.com/kubernetes/kubernetes/blob/v1.31.0/pkg/scheduler/internal/heap/heap.go
- https://github.com/kubernetes/kubernetes/blob/v1.31.0/pkg/scheduler/internal/queue/scheduling_queue.go
- https://github.com/libuv/libuv/blob/v1.48.0/src/heap-inl.h
- https://github.com/libuv/libuv/blob/v1.48.0/src/timer.c
- https://github.com/nginx/nginx/blob/release-1.26.2/src/event/ngx_event_timer.c
- https://github.com/nginx/nginx/blob/release-1.26.2/src/event/ngx_event_timer.h
- https://github.com/git/git/blob/v2.47.0/Documentation/gitformat-pack.txt
- https://github.com/git/git/blob/v2.47.0/packfile.c
- https://github.com/git/git/blob/v2.47.0/hash-lookup.c
- https://github.com/google/leveldb/blob/1.23/doc/table_format.md
- https://github.com/google/leveldb/blob/1.23/table/block.cc
- https://github.com/google/leveldb/blob/1.23/table/block_builder.cc
- https://github.com/postgres/postgres/blob/REL_17_0/src/backend/access/nbtree/README
- https://github.com/sqlite/sqlite/blob/version-3.46.0/src/btreeInt.h

Web pages (WebFetch, or curl for the SQLite page):

- https://go.dev/blog/swisstable
- https://go.dev/blog/routing-enhancements
- https://www.sqlite.org/fileformat2.html (fetched 2026-10-04; unversioned page)

Attempted and NOT opened (do not cite):

- https://go.dev/design/enhanced-servemux (302 to googlesource)
- https://go.googlesource.com/proposal/+/master/design/enhanced-servemux.md (404)
