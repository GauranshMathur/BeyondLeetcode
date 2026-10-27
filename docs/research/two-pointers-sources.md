# Two pointers: sources

Research for the Topic `two-pointers` (card C101, issue #268). Every claim about a real system that the four Chapters make is listed below with its source. The issue's system names were leads; two of them changed (see "Leads that changed").

Tags, resolved to commit SHAs with `git ls-remote`:

| Project | Tag | Commit |
|---|---|---|
| CPython | `v3.13.0` | `60403a5409ff2c3f3b07dd2ca91a7a3e096839c7` (annotated tag object `3f27099d916c7b885e3daf1fabedcc119462014d`) |
| LevelDB | `1.23` | `99b3c03b3284f5886f9ef9a4ef703d57373e61be` (lightweight tag) |
| Go | `go1.22.0` | `a10e42f219abb9c5bc4e7d86d9464700a42c7d57` |
| GNU Emacs (GitHub mirror `emacs-mirror/emacs`) | `emacs-30.2` | `636f166cfc86aa90d63f592fd99f3fdd9ef95ebd` (annotated tag object `29f3f150af5c5b065c3a9f39969429e5bb3285da`) |

Method. Code and docs files were fetched with `curl -fsSL https://raw.githubusercontent.com/<org>/<repo>/<tag>/<path>` and line numbers read with `awk 'NR>=a&&NR<=b'` / `grep -n`. Python docs pages were fetched with `curl` and tags stripped with a Python regex, so docs quotes carry no line number. Brent's paper is a scanned PDF from the author's site (Australian National University); its text layer has OCR errors, so quotes from it are cleaned by hand and the human reviewer should read them off the page. Source types: 1 = source code, 2 = official docs for that version, 3 = original paper, 4 = engineer post. Nothing was fetched through a search engine except the lead for Emacs (GitHub code search for "tortoise hare").

Leads that changed.
- The issue named "LSM-tree compaction, timsort's merge" for the merge Chapter. Only LevelDB's compaction is used; one system per Chapter.
- The issue gave no lead for fast and slow pointers. A code search found Emacs' `FOR_EACH_TAIL`, which uses a variant, Brent's teleporting tortoise, so the Chapter is about that decision, and the Floyd form is taught from the paper's own description.
- The issue's first Chapter is "Converging pointers on sorted data". No real system with converging pointers on *sorted* data was found in the time of this card, so the Chapter reads CPython's converging pointers on unsorted data (`list.reverse`, `str.strip`), and the sorted-data step is written as an argument labelled "an argument, not a claim about CPython". Nothing about a real system is claimed for it.

---

## Chapter 1: CPython, two ends, moving in (`two-pointers-cpython-converging`)

### Claim 1.1. `list.reverse()` reverses in place; the docs give space as the reason.
- Links: [Tutorial, More on Lists](https://docs.python.org/3.13/tutorial/datastructures.html), [Built-in Types, mutable sequence operations](https://docs.python.org/3.13/library/stdtypes.html)
- Quotes: "list.reverse() Reverse the elements of the list in place." and, for `sequence.reverse()`, "Reverse the items of sequence in place. This method maintains economy of space when reversing a large sequence."
- Type 2. Status: sourced.

### Claim 1.2. `reverse_slice` is a two-pointer swap loop.
- Link: [Objects/listobject.c L1530-L1544](https://github.com/python/cpython/blob/v3.13.0/Objects/listobject.c#L1530-L1544)
- Quote: `/* Reverse a slice of a list in place, from lo up to (exclusive) hi. */`, `--hi; while (lo < hi) { PyObject *t = *lo; *lo = *hi; *hi = t; ++lo; --hi; }`.
- Type 1. Status: sourced. The complexity statements (at most n/2 swaps, O(1) extra) are read off the loop.

### Claim 1.3. `list.reverse` calls it only for more than one item.
- Link: [Objects/listobject.c L3144-L3151](https://github.com/python/cpython/blob/v3.13.0/Objects/listobject.c#L3144-L3151)
- Quote: `if (Py_SIZE(self) > 1) reverse_slice(self->ob_item, self->ob_item + Py_SIZE(self));`
- Type 1. Status: sourced.

### Claim 1.4. `str.strip` returns a copy; `do_strip` scans with a left index, then a right index guarded by `j >= i`.
- Links: [`str.strip` docs](https://docs.python.org/3.13/library/stdtypes.html); [Objects/unicodeobject.c L12136-L12156](https://github.com/python/cpython/blob/v3.13.0/Objects/unicodeobject.c#L12136-L12156); [L12222](https://github.com/python/cpython/blob/v3.13.0/Objects/unicodeobject.c#L12222); [L12203](https://github.com/python/cpython/blob/v3.13.0/Objects/unicodeobject.c#L12203)
- Quotes: docs "Return a copy of the string with the leading and trailing characters removed."; L12149 `while (j >= i) {`; L12222 `return do_argstrip(self, BOTHSTRIP, chars);`; L12203 `return do_strip(self, striptype);`.
- Type 1, 2. Status: sourced. Line 12136 to 12156 is the ASCII branch only; the non-ASCII branch (from L12158) has the same shape with `Py_UNICODE_ISSPACE`. The "at most one read per character, plus the stopping one" count is read off the loops.

---

## Chapter 2: LevelDB, merging sorted runs (`two-pointers-leveldb-merge`)

### Claim 2.1. Sorted tables hold entries sorted by key; each entry is a value or a deletion marker.
- Link: [doc/impl.md L24-L26](https://github.com/google/leveldb/blob/1.23/doc/impl.md?plain=1#L24-L26)
- Quote: "A sorted table (*.ldb) stores a sequence of entries sorted by key. Each entry is either a value for the key, or a deletion marker for the key."
- Type 2. Status: sourced.

### Claim 2.2. A compaction merges the contents of the picked files; the merges use bulk reads and writes; compactions drop overwritten values.
- Links: [doc/impl.md L88](https://github.com/google/leveldb/blob/1.23/doc/impl.md?plain=1#L88), [L40-L42](https://github.com/google/leveldb/blob/1.23/doc/impl.md?plain=1#L40-L42), [L104](https://github.com/google/leveldb/blob/1.23/doc/impl.md?plain=1#L104)
- Quotes: "A compaction merges the contents of the picked files to produce a sequence of level-(L+1) files."; "These merges have the effect of gradually migrating new updates from the young level to the largest level using only bulk reads and writes (i.e., minimizing expensive seeks)."; "Compactions drop overwritten values."
- Type 2. Status: sourced. The sentence that a forward pass through a sorted file is the kind of read the notes call bulk is the Chapter's reading, not a quote.

### Claim 2.3. A compaction builds one iterator per input and merges them.
- Link: [db/version_set.cc L1220-L1250](https://github.com/google/leveldb/blob/1.23/db/version_set.cc#L1220-L1250)
- Quote: `// Level-0 files have to be merged together.  For other levels, we will make a concatenating iterator per level.` and `Iterator* result = NewMergingIterator(&icmp_, list, num);`. `DoCompactionWork` calls `versions_->MakeInputIterator(compact->compaction)` at [db/db_impl.cc L910](https://github.com/google/leveldb/blob/1.23/db/db_impl.cc#L910) (not cited in the Chapter).
- Type 1. Status: sourced.

### Claim 2.4. The merging iterator scans all children for the smallest key; `Next` advances the current child and rescans.
- Links: [table/merger.cc L148-L161](https://github.com/google/leveldb/blob/1.23/table/merger.cc#L148-L161), [L77-L78](https://github.com/google/leveldb/blob/1.23/table/merger.cc#L77-L78)
- Quote: `for (int i = 0; i < n_; i++) { ... else if (comparator_->Compare(child->key(), smallest->key()) < 0) { smallest = child; }`; `current_->Next(); FindSmallest();`
- Type 1. Status: sourced. "k comparisons per output item, n x k in all" is read off the loop.

### Claim 2.5. The merging iterator does no duplicate suppression.
- Link: [table/merger.h L13-L18](https://github.com/google/leveldb/blob/1.23/table/merger.h#L13-L18)
- Quote: "The result does no duplicate suppression.  I.e., if a particular key is present in K child iterators, it will be yielded K times."
- Type 1. Status: sourced.

### Claim 2.6. Internal keys sort by increasing user key, then decreasing sequence number.
- Link: [db/dbformat.cc L47-L63](https://github.com/google/leveldb/blob/1.23/db/dbformat.cc#L47-L63)
- Quote: "Order by: increasing user key (according to user-supplied comparator), decreasing sequence number, decreasing type". The sentence "a bigger sequence number is a later write" is not in this file; it is how `last_sequence_for_key` and the comment "Hidden by an newer entry" read in `db_impl.cc` L961-L963, where the entry after a same-key entry in this order is the one called hidden.
- Type 1. Status: sourced, with that one inference flagged for the reviewer.

### Claim 2.7. The compaction loop drops an entry hidden by a newer entry for the same user key.
- Links: [db/db_impl.cc L961-L963](https://github.com/google/leveldb/blob/1.23/db/db_impl.cc#L961-L963), [L1013](https://github.com/google/leveldb/blob/1.23/db/db_impl.cc#L1013)
- Quote: `if (last_sequence_for_key <= compact->smallest_snapshot) { // Hidden by an newer entry for same user key  drop = true;  // (A)`; L1013 `input->Next();`.
- Type 1. Status: sourced. The snapshot condition is mentioned in the Chapter and left out of the Build; deletion markers (L964-L974) are not discussed.

---

## Chapter 3: Go, one pointer reads, one pointer writes (`two-pointers-go-compact`)

### Claim 3.1. `slices.Compact` removes consecutive repeats in place with a read index and a write index.
- Links: [src/slices/slices.go L346-L350](https://github.com/golang/go/blob/go1.22.0/src/slices/slices.go#L346-L350), [L351-L366](https://github.com/golang/go/blob/go1.22.0/src/slices/slices.go#L351-L366)
- Quote: "Compact replaces consecutive runs of equal elements with a single copy. This is like the uniq command found on Unix. Compact modifies the contents of the slice s and returns the modified slice, which may have a smaller length." Body: `i := 1; for k := 1; k < len(s); k++ { if s[k] != s[k-1] { if i != k { s[i] = s[k] } i++ } } clear(s[i:]) // zero/nil out the obsolete elements, for GC`.
- Type 1. Status: sourced. "Write index is never ahead of the read index" is read off the loop (`i` starts at 1 and `k` at 1, `i` rises at most as `k` does).

### Claim 3.2. `slices.Sort` uses `pdqsortOrdered`, whose partition is `partitionOrdered`.
- Links: [src/slices/sort.go L16-L19](https://github.com/golang/go/blob/go1.22.0/src/slices/sort.go#L16-L19), [src/slices/zsortordered.go L58](https://github.com/golang/go/blob/go1.22.0/src/slices/zsortordered.go#L58), [L116](https://github.com/golang/go/blob/go1.22.0/src/slices/zsortordered.go#L116)
- Quote: `pdqsortOrdered(x, 0, n, bits.Len(uint(n)))`; "The algorithm based on pattern-defeating quicksort(pdqsort), but without the optimizations from BlockQuicksort."; `mid, alreadyPartitioned := partitionOrdered(data, a, b, pivot)`.
- Type 1. Status: sourced.

### Claim 3.3. `partitionOrdered`'s contract and its two-pointer loop.
- Links: [zsortordered.go L133-L136](https://github.com/golang/go/blob/go1.22.0/src/slices/zsortordered.go#L133-L136), [L138-L153](https://github.com/golang/go/blob/go1.22.0/src/slices/zsortordered.go#L138-L153), [L155-L168](https://github.com/golang/go/blob/go1.22.0/src/slices/zsortordered.go#L155-L168)
- Quote: "partitionOrdered does one quicksort partition. Let p = data[pivot] Moves elements in data[a:b] around, so that data[i]<p and data[j]>=p for i<newpivot and j>newpivot."; L138 `data[a], data[pivot] = data[pivot], data[a]`, L139 `i, j := a+1, b-1`; the loop at L155-L168.
- Type 1. Status: sourced. "Swaps are at most n/2" and "the order inside a side is not kept" are read off the loop.

---

## Chapter 4: Emacs, noticing that a list never ends (`two-pointers-emacs-cycles`)

### Claim 4.1. Circular lists exist and most end-finding functions loop forever on them.
- Link: [doc/lispref/lists.texi L69-L83](https://github.com/emacs-mirror/emacs/blob/emacs-30.2/doc/lispref/lists.texi#L69-L83)
- Quote: "some cons cell's CDR could point to one of the previous cons cells in the list. We call that structure a circular list." and "Most functions that try to find the end of a list enter infinite loops if given a circular list." (The Texinfo source writes `@sc{cdr}` for CDR.)
- Type 2. Status: sourced.

### Claim 4.2. `FOR_EACH_TAIL` signals on a cycle; short lists skip the check.
- Links: [src/lisp.h L5867-L5875](https://github.com/emacs-mirror/emacs/blob/emacs-30.2/src/lisp.h#L5867-L5875), [L5862-L5865](https://github.com/emacs-mirror/emacs/blob/emacs-30.2/src/lisp.h#L5862-L5865)
- Quote: "Loop over conses of the list TAIL, signaling if a cycle is found, and possibly quitting after each loop iteration."; "The maximum length of "small" lists, as a heuristic.  These lists are so short that code need not check for cycles or quits while traversing." `enum { SMALL_LIST_LEN_MAX = 127 };`
- Type 1. Status: sourced.

### Claim 4.3. Floyd's algorithm: two pointers at speeds one and two; 3 evaluations of `f` per round.
- Link: [Brent 1980, BIT 20, p. 176-177](https://maths-people.anu.edu.au/~brent/pd/rpb051i.pdf)
- Quote (cleaned from the OCR text layer): "Knuth [3] gives a simple and elegant algorithm, attributed to Floyd, for finding a multiple of the period n, using only a small constant amount of storage. ... The algorithm is: x := x0; y := x0; j := 0; repeat j := j+1; x := f(x); y := f(f(y)) until x = y." Section 3: "the number of f evaluations is W_F = 3j."
- Type 3. Status: sourced; the Chapter's "if it loops the fast pointer must catch the slow one" is marked in the text as an argument, not a quote. Reviewer: read the pseudo-code off the PDF, the text layer garbles subscripts.

### Claim 4.4. Emacs uses Brent's teleporting tortoise-hare, and the mechanism.
- Links: [src/lisp.h L5895-L5897](https://github.com/emacs-mirror/emacs/blob/emacs-30.2/src/lisp.h#L5895-L5897), [L5905-L5914](https://github.com/emacs-mirror/emacs/blob/emacs-30.2/src/lisp.h#L5905-L5914)
- Quote: "Use Brent's teleporting tortoise-hare algorithm.  See: Brent RP. BIT. 1980;20(2):176-184. doi:10.1007/BF01933190 https://maths-people.anu.edu.au/~brent/pd/rpb051i.pdf". Macro: `for (struct for_each_tail_internal li = { tail, 2, 0, 2 }; CONSP (tail); ((tail) = XCDR (tail), ((--li.q != 0 || (..., 0 < --li.n) || (li.q = li.n = li.max <<= 1, li.n >>= USHRT_WIDTH, li.tortoise = (tail), false)) && BASE_EQ (tail, li.tortoise)) ? (cycle) : (void) 0))`; the struct is `{ Lisp_Object tortoise; intptr_t max, n; unsigned short int q; }` (L5885-L5890).
- Type 1. Status: sourced. The windows 2, 4, 8, ... and "no comparison on the step that jumps" are read off the macro (the `&&` is skipped when the middle clause yields false). Window sizes above 65535 take another path through `n` (the high bits) that the Chapter and Problem do not model; the Problem's rule is labelled as written for the Problem.

### Claim 4.5. Brent's version is about 36 percent faster than Floyd's on average, and has a worst-case bound of the same order.
- Link: [Brent 1980, abstract and section 3](https://maths-people.anu.edu.au/~brent/pd/rpb051i.pdf)
- Quote: "We describe a cycle-finding algorithm which is about 36 percent faster than Floyd's (on the average)". Section 3: "3 max (m, n) <= W_F < 3(m + n)" (3.2); for Q = 2 and u = 0, "W_2 <= 2 max(m,n) + n < W_F" (3.10), "Thus, in this case B_Q is never slower than Floyd's algorithm." (The text layer shows `~` for <= and `We` for W_2.)
- Type 3. Status: sourced; symbols in the bounds need an eye on the PDF. The Chapter writes the bounds as 3(m + n) and 2 max(m, n) + n and cites sections 3.2 and 3.10.

### Claim 4.6. `safe-length` can return more than the number of distinct nodes for a circular list.
- Links: [src/fns.c L163-L175](https://github.com/emacs-mirror/emacs/blob/emacs-30.2/src/fns.c#L163-L175), [doc/lispref/lists.texi L398-L405](https://github.com/emacs-mirror/emacs/blob/emacs-30.2/doc/lispref/lists.texi#L398-L405)
- Quote: "If LIST is circular, it returns an integer that is at least the number of distinct elements."; "However, for circular lists, the value is just an upper bound; it is often too large." Code: `FOR_EACH_TAIL_SAFE (list) len++;`.
- Type 1, 2. Status: sourced. The reason ("the loop only notices the cycle when the hare lands on the tortoise, which may take more than a lap") is the Chapter's reading of the macro, not a quote.

---

## Claims cut or not made

- No reason is given for why Emacs chose Brent's variant over Floyd's. The source cites the paper and does not say why; the Chapter quotes the paper's own speed claim and does not attribute it to Emacs's motives.
- "Emacs uses a visited-set alternative" or "Emacs cannot afford a table" is not claimed (no source).
- Nothing is claimed about LevelDB's snapshot, deletion-marker or level-0 details beyond what is quoted.
- Fast and slow pointers for the middle of a list: written in the Chapter as a property of the walk, labelled as not a claim about Emacs.

## Observations

Reference Code for every Problem is run in the Sandbox by the content check and agrees with a brute-force check written separately (a quadratic or cubic scan, a sort-based merge, a path simulation) on every Test.
