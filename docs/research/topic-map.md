# Topic map

Which Topics BeyondLeetcode could teach, the real systems behind each, and the order they unlock in. Written 2026-10-04 from three research files in this folder:

- `candidates-linear.md`: dynamic arrays, stacks, queues, linked lists
- `candidates-hashing-heaps-trees.md`: hash tables, heaps, binary search, trees, tries
- `candidates-storage-probabilistic-graphs.md`: LRU caches, skip lists, Bloom filters, LSM trees, topological sort, union-find, logs

Each file holds the source table for its Topics: system, decision, permalink, quoted line. This file only ranks and orders them. Nothing here is learner content; a Chapter cites the sources itself and a person opens each one before it ships (`docs/content-standards.md`).

## How the sources were checked

The researchers fetched each source file at a pinned release tag and read line numbers off the fetched file. The orchestrator then re-fetched 25 of those citations (6 in the linear file, 9 in the hashing file, 10 in the storage file) and compared the quoted text with the cited lines. 24 matched. One had the right file and quote but the wrong line label (Redis `evict.c`, L43-44 not L40-41), now corrected. The rest of the citations have had one reader only.

## The first Topic: dynamic arrays

A first Topic needs no Prerequisites, strong sources and a Build that grows in small steps. Dynamic arrays is the only candidate with all three.

- **Sources:** five systems, each with its growth rule readable in a few lines of code at a pinned tag: CPython `list`, Go slices (the rule before and after Go 1.18), Rust `Vec`, Java `ArrayList`, V8 arrays.
- **A real decision:** the five disagree on the factor (about 1.125x, 1.25x to 2x, 2x, 1.5x, 1.5x) and agree on the idea. Rust's and Java's docs say outright that the factor is not promised, only the amortised cost of an append.
- **It unlocks the most:** hash tables, heaps, union-find and Bloom filters all name it as a Prerequisite.

Why the other no-Prerequisite candidates lost:

| Candidate | Why not first |
|---|---|
| Binary search / sorted arrays | Medium sources. The systems (git pack index, LevelDB block index) need file-format background before the search itself makes sense. |
| Stacks | The structure is an array and an index; the interesting part is the system around it. Better as a short second Topic. |
| Queues / ring buffers | Strong sources, but the best systems (Go channels, LMAX Disruptor) are about concurrency, which stdin → stdout Tests cannot check. The growable ring also needs dynamic arrays. |

## Proposed order

Each row lists what must be Complete first. This is a proposal for the Map, not a commitment to build every row.

| # | Topic | Prerequisites | Sources | Real systems (see the research files) |
|---|---|---|---|---|
| 1 | Dynamic arrays | none | Strong | CPython `list`, Go slices, Rust `Vec`, Java `ArrayList` |
| 2 | Stacks | dynamic arrays | Medium | CPython value stack, JVM operand stack, Qt `QUndoStack`, Go goroutine stacks |
| 3 | Queues and ring buffers | dynamic arrays | Strong | Linux `kfifo`, Go channel buffer, Java `ArrayDeque`, CPython `deque`, LMAX Disruptor |
| 4 | Binary search | dynamic arrays | Medium | git pack index, CPython `bisect`, Go `sort.Search`, LevelDB block index |
| 5 | Hash tables | dynamic arrays | Strong | CPython `dict`, Go map (Swiss tables), Redis `dict`, Java `HashMap` |
| 6 | Heaps | dynamic arrays | Strong | CPython `heapq`, Go timer heap (4-ary), libuv, Linux min-heap; nginx as the counter-example |
| 7 | LRU caches (teaches linked lists) | hash tables | Strong | Python `lru_cache`, groupcache, Redis sampled LRU, memcached, Linux page cache |
| 8 | Bloom filters | hash tables | Strong | LevelDB, RocksDB, Cassandra, PostgreSQL |
| 9 | Union-find | dynamic arrays | Strong | LLVM `EquivalenceClasses`, rustc `ena`, Linux cpuset (v6.12), Boost.Graph |
| 10 | Skip lists | LRU caches, binary search | Strong on what, Medium on why | Redis sorted sets, LevelDB and RocksDB memtables, Java `ConcurrentSkipListMap` |
| 11 | Balanced trees and B-trees | binary search, heaps | Strong | Linux red-black tree (EEVDF), SQLite, PostgreSQL nbtree, Rust `BTreeMap` |
| 12 | Tries | hash tables | Medium | Redis `rax`, Linux FIB trie, Go `ServeMux` |
| 13 | Topological sort | hash tables, queues | Strong on the algorithm | Python `graphlib`, coreutils `tsort`, Go package initialisation |
| 14 | Append-only logs | binary search, hash tables | Medium | Kafka, PostgreSQL WAL, SQLite WAL, Redis AOF |
| 15 | LSM trees (capstone) | skip lists, Bloom filters, logs, heaps | Strong | LevelDB, RocksDB, Bigtable |

Decisions behind the table:

- **Linked lists are not a Topic of their own.** On their own the sources are weak and the Build is thin. They are taught inside LRU caches, where a doubly linked list earns its place, with Redis (which samples instead) as the counter-example.
- **LSM trees are a capstone.** Its parts are four earlier Topics, so it comes last and reuses their Builds' ideas.
- **Counter-examples are kept.** nginx keeping timers in a red-black tree, and Redis sampling keys instead of keeping an exact LRU list, show a real system choosing differently. That teaches the trade-off better than four systems that agree.

## Open sources

The three files list 22 `[NEEDS SOURCE]` markers between them (6, 8 and 8). Most are "why" claims: why Go's timer heap is 4-ary, why git's fan-out is 256-way, why Redis chose a skip list over a tree. A Chapter leaves such a claim out until a first-party source is found. None of them touches dynamic arrays except the V8 call chain, so V8 is left out of the first Topic.
