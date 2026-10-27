# Human review queue

`docs/content-standards.md` holds every claim a learner reads to a primary source that a person has opened and checked. Agents draft content and list every link it cites here. A person opens each one, confirms it says what the sentence says for the version named, and ticks it.

Each Topic has its own section, written by its card. Agents add entries only to their own Topic's section, never to another's.

One line per cited link, grouped by Chapter:

```
- [ ] [what the link is](https://pinned/permalink) · chapters/<chapter-id>/chapter.md: the claim it supports
```

A link that doesn't hold up gets a note under its line, and the claim goes back to `[NEEDS SOURCE]`.

## Hash tables

## Two pointers

- [ ] [Python 3.13 tutorial, More on Lists](https://docs.python.org/3.13/tutorial/datastructures.html) · chapters/two-pointers-cpython-converging/chapter.md: `list.reverse()` "Reverse the elements of the list in place."
- [ ] [Python 3.13 Built-in Types (`sequence.reverse()` and `str.strip`)](https://docs.python.org/3.13/library/stdtypes.html) · chapters/two-pointers-cpython-converging/chapter.md: `reverse` "maintains economy of space when reversing a large sequence"; `str.strip` "Return a copy of the string with the leading and trailing characters removed."
- [ ] [CPython v3.13.0 listobject.c L1530-L1544](https://github.com/python/cpython/blob/v3.13.0/Objects/listobject.c#L1530-L1544) · chapters/two-pointers-cpython-converging/chapter.md: `reverse_slice` swaps with `lo` and `hi` moving inward
- [ ] [CPython v3.13.0 listobject.c L3144-L3151](https://github.com/python/cpython/blob/v3.13.0/Objects/listobject.c#L3144-L3151) · chapters/two-pointers-cpython-converging/chapter.md: `list_reverse_impl` calls `reverse_slice` only for more than one item
- [ ] [CPython v3.13.0 unicodeobject.c L12136-L12156](https://github.com/python/cpython/blob/v3.13.0/Objects/unicodeobject.c#L12136-L12156) · chapters/two-pointers-cpython-converging/chapter.md: `do_strip` ASCII branch: left scan, then right scan guarded by `j >= i`
- [ ] [CPython v3.13.0 unicodeobject.c L12222](https://github.com/python/cpython/blob/v3.13.0/Objects/unicodeobject.c#L12222) · chapters/two-pointers-cpython-converging/chapter.md: `str.strip` passes `BOTHSTRIP`
- [ ] [CPython v3.13.0 unicodeobject.c L12203](https://github.com/python/cpython/blob/v3.13.0/Objects/unicodeobject.c#L12203) · chapters/two-pointers-cpython-converging/chapter.md: `do_argstrip` with no argument reaches `do_strip`
- [ ] [LevelDB 1.23 doc/impl.md L24-L26](https://github.com/google/leveldb/blob/1.23/doc/impl.md?plain=1#L24-L26) · chapters/two-pointers-leveldb-merge/chapter.md: a sorted table stores entries sorted by key; each is a value or a deletion marker
- [ ] [LevelDB 1.23 doc/impl.md L88](https://github.com/google/leveldb/blob/1.23/doc/impl.md?plain=1#L88) · chapters/two-pointers-leveldb-merge/chapter.md: "A compaction merges the contents of the picked files..."
- [ ] [LevelDB 1.23 doc/impl.md L40-L42](https://github.com/google/leveldb/blob/1.23/doc/impl.md?plain=1#L40-L42) · chapters/two-pointers-leveldb-merge/chapter.md: merges migrate updates "using only bulk reads and writes (i.e., minimizing expensive seeks)"
- [ ] [LevelDB 1.23 version_set.cc L1220-L1250](https://github.com/google/leveldb/blob/1.23/db/version_set.cc#L1220-L1250) · chapters/two-pointers-leveldb-merge/chapter.md: `MakeInputIterator` builds one iterator per input and calls `NewMergingIterator`
- [ ] [LevelDB 1.23 merger.cc L148-L161](https://github.com/google/leveldb/blob/1.23/table/merger.cc#L148-L161) · chapters/two-pointers-leveldb-merge/chapter.md: `FindSmallest` scans all children for the smallest key
- [ ] [LevelDB 1.23 merger.cc L77-L78](https://github.com/google/leveldb/blob/1.23/table/merger.cc#L77-L78) · chapters/two-pointers-leveldb-merge/chapter.md: `Next` advances the current child then calls `FindSmallest`
- [ ] [LevelDB 1.23 merger.h L13-L18](https://github.com/google/leveldb/blob/1.23/table/merger.h#L13-L18) · chapters/two-pointers-leveldb-merge/chapter.md: the merging iterator "does no duplicate suppression"
- [ ] [LevelDB 1.23 dbformat.cc L47-L63](https://github.com/google/leveldb/blob/1.23/db/dbformat.cc#L47-L63) · chapters/two-pointers-leveldb-merge/chapter.md: internal keys order by increasing user key, then decreasing sequence number
- [ ] [LevelDB 1.23 db_impl.cc L1013](https://github.com/google/leveldb/blob/1.23/db/db_impl.cc#L1013) · chapters/two-pointers-leveldb-merge/chapter.md: `DoCompactionWork` advances the merged iterator with `input->Next()`
- [ ] [LevelDB 1.23 db_impl.cc L961-L963](https://github.com/google/leveldb/blob/1.23/db/db_impl.cc#L961-L963) · chapters/two-pointers-leveldb-merge/chapter.md: an entry "Hidden by an newer entry for same user key" is dropped
- [ ] [LevelDB 1.23 doc/impl.md L104](https://github.com/google/leveldb/blob/1.23/doc/impl.md?plain=1#L104) · chapters/two-pointers-leveldb-merge/chapter.md: "Compactions drop overwritten values."
- [ ] [Go 1.22.0 slices.go L346-L350](https://github.com/golang/go/blob/go1.22.0/src/slices/slices.go#L346-L350) · chapters/two-pointers-go-compact/chapter.md: `Compact` doc comment
- [ ] [Go 1.22.0 slices.go L351-L366](https://github.com/golang/go/blob/go1.22.0/src/slices/slices.go#L351-L366) · chapters/two-pointers-go-compact/chapter.md: `Compact` body: read index `k`, write index `i`, `i != k` guard, `clear` of the tail
- [ ] [Go 1.22.0 sort.go L16-L19](https://github.com/golang/go/blob/go1.22.0/src/slices/sort.go#L16-L19) · chapters/two-pointers-go-compact/chapter.md: `slices.Sort` calls `pdqsortOrdered`
- [ ] [Go 1.22.0 zsortordered.go L58](https://github.com/golang/go/blob/go1.22.0/src/slices/zsortordered.go#L58) · chapters/two-pointers-go-compact/chapter.md: `pdqsortOrdered` is "based on pattern-defeating quicksort(pdqsort)"
- [ ] [Go 1.22.0 zsortordered.go L133-L136](https://github.com/golang/go/blob/go1.22.0/src/slices/zsortordered.go#L133-L136) · chapters/two-pointers-go-compact/chapter.md: `partitionOrdered` "does one quicksort partition" and its contract
- [ ] [Go 1.22.0 zsortordered.go L116](https://github.com/golang/go/blob/go1.22.0/src/slices/zsortordered.go#L116) · chapters/two-pointers-go-compact/chapter.md: `pdqsortOrdered` calls `partitionOrdered`
- [ ] [Go 1.22.0 zsortordered.go L138-L153](https://github.com/golang/go/blob/go1.22.0/src/slices/zsortordered.go#L138-L153) · chapters/two-pointers-go-compact/chapter.md: `partitionOrdered` swaps the pivot to `data[a]`, sets `i, j`, and does a first scan
- [ ] [Go 1.22.0 zsortordered.go L155-L168](https://github.com/golang/go/blob/go1.22.0/src/slices/zsortordered.go#L155-L168) · chapters/two-pointers-go-compact/chapter.md: the main two-pointer partition loop
- [ ] [Emacs 30.2 lists.texi L69-L83](https://github.com/emacs-mirror/emacs/blob/emacs-30.2/doc/lispref/lists.texi#L69-L83) · chapters/two-pointers-emacs-cycles/chapter.md: circular lists; most end-finding functions loop forever on them
- [ ] [Emacs 30.2 lisp.h L5867-L5875](https://github.com/emacs-mirror/emacs/blob/emacs-30.2/src/lisp.h#L5867-L5875) · chapters/two-pointers-emacs-cycles/chapter.md: `FOR_EACH_TAIL` signals if a cycle is found
- [ ] [Emacs 30.2 lisp.h L5862-L5865](https://github.com/emacs-mirror/emacs/blob/emacs-30.2/src/lisp.h#L5862-L5865) · chapters/two-pointers-emacs-cycles/chapter.md: `SMALL_LIST_LEN_MAX` is 127; short lists skip the cycle check
- [ ] [Brent 1980, "An improved Monte Carlo factorization algorithm", BIT 20, 176-184 (author's PDF)](https://maths-people.anu.edu.au/~brent/pd/rpb051i.pdf) · chapters/two-pointers-emacs-cycles/chapter.md: Floyd's algorithm as printed (`x := f(x); y := f(f(y)) until x = y`, section 1); abstract: "about 36 percent faster than Floyd's (on the average)"; section 3 bounds (3.2) 3(m+n) evaluations for Floyd and (3.10) 2 max(m,n)+n for Q=2, u=0. The PDF is a scan, so check the symbols in the bounds by eye
- [ ] [Emacs 30.2 lisp.h L5895-L5897](https://github.com/emacs-mirror/emacs/blob/emacs-30.2/src/lisp.h#L5895-L5897) · chapters/two-pointers-emacs-cycles/chapter.md: the macro uses "Brent's teleporting tortoise-hare algorithm" and cites the paper
- [ ] [Emacs 30.2 lisp.h L5905-L5914](https://github.com/emacs-mirror/emacs/blob/emacs-30.2/src/lisp.h#L5905-L5914) · chapters/two-pointers-emacs-cycles/chapter.md: `FOR_EACH_TAIL_INTERNAL`: initial state `{ tail, 2, 0, 2 }`, per-step test against the tortoise, doubling window and jump
- [ ] [Emacs 30.2 fns.c L163-L175](https://github.com/emacs-mirror/emacs/blob/emacs-30.2/src/fns.c#L163-L175) · chapters/two-pointers-emacs-cycles/chapter.md: `safe-length` counts with `FOR_EACH_TAIL_SAFE`; for a circular list returns "at least the number of distinct elements"
- [ ] [Emacs 30.2 lists.texi L398-L405](https://github.com/emacs-mirror/emacs/blob/emacs-30.2/doc/lispref/lists.texi#L398-L405) · chapters/two-pointers-emacs-cycles/chapter.md: `safe-length` for circular lists "is just an upper bound; it is often too large"

## Binary search

## Stacks

## Sliding window

## Linked lists
