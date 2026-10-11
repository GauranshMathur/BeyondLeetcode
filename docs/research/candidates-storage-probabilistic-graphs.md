# Candidate Topics: caches, skip lists, Bloom filters, LSM trees, graphs, union-find, logs

Research date: 2026-10-04. Every "opened" source was fetched and read in this session (raw file via `curl` at a tag or SHA, or WebFetch). Line numbers come from the fetched file, so they match the permalinks below.

Conventions used in this file:
- Source types: 1 = source code at a tag/SHA, 2 = official docs, 3 = original paper or design doc, 4 = talk or post by the system's own engineers on its own site.
- Doc pages that are not versioned (`/latest`, SQLite `wal.html`, RocksDB wiki, Bazel) are marked "unversioned, fetched 2026-10-04". I paired them with a code tag where one exists. I did not use any text that describes a newer version than the code tag (the Redis docs page also describes an 8.6 "LRM" policy; I ignore it).
- "via mirror": the PDF is the original paper, but I opened it on a university course site, not the authors' own site.
- Complexity labels are written as worst case, amortised or expected.
- [NEEDS SOURCE] markers carry an id (N1 to N8) and are all collected at the end.

Short permalink bases (all verified to resolve when fetched):
- LevelDB `1.23`: https://github.com/google/leveldb/blob/1.23/
- Redis `7.2.4`: https://github.com/redis/redis/blob/7.2.4/
- CPython `v3.12.4`: https://github.com/python/cpython/blob/v3.12.4/
- RocksDB `v9.0.0`: https://github.com/facebook/rocksdb/blob/v9.0.0/
- Linux `v6.8` and `v6.12`: https://github.com/torvalds/linux/blob/v6.8/ and `.../v6.12/`

---

## 1. LRU caches

### Real systems

| System | Decision | Primary source | Quote / lines | Type | Opened |
|---|---|---|---|---|---|
| Python `functools.lru_cache` | Exact LRU: dict plus a circular doubly linked list, so a hit moves its link to the tail in O(1) pointer edits | [Lib/functools.py v3.12.4 L529-L541](https://github.com/python/cpython/blob/v3.12.4/Lib/functools.py#L529-L541), [L567-L581](https://github.com/python/cpython/blob/v3.12.4/Lib/functools.py#L567-L581) | L537: "root = []  # root of the circular doubly linked list"; L567: "Size limited caching that tracks accesses by recency" | 1 | yes |
| Go `groupcache/lru` | Exact LRU: `container/list` plus `map[interface{}]*list.Element`; `MoveToFront` on hit, evict from the back | [lru/lru.go @2c02b82 L22-L34](https://github.com/golang/groupcache/blob/2c02b8208cf8c02a3e358cb1d9b60950647543fc/lru/lru.go#L22-L34), [L62, L79](https://github.com/golang/groupcache/blob/2c02b8208cf8c02a3e358cb1d9b60950647543fc/lru/lru.go#L60-L82) | L22: "Cache is an LRU cache. It is not safe for concurrent access." (repo has no tags; SHA is the master head on 2026-10-04) | 1 | yes |
| Redis | Approximated LRU: sample a few random keys, evict the idlest; keep a 16-entry pool of good candidates across calls. Approximated LFU with a probabilistic (Morris-style) counter | [src/evict.c 7.2.4 L40-L54](https://github.com/redis/redis/blob/7.2.4/src/evict.c#L40-L54), [L299-L307](https://github.com/redis/redis/blob/7.2.4/src/evict.c#L299-L307); docs [Key eviction](https://redis.io/docs/latest/develop/reference/eviction/) (unversioned) | evict.c L43-44: "To improve the quality of the LRU approximation we take a set of keys that are good candidate for eviction". Docs: "The reason Redis does not use a true LRU implementation is because it costs more memory." | 1 + 2 | yes |
| memcached | Segmented LRU: HOT, WARM, COLD lists per slab class; items hit twice are "active"; a background thread moves items | [doc/new_lru.txt @1.6.21 L4-L29](https://github.com/memcached/memcached/blob/1.6.21/doc/new_lru.txt#L4-L29) | L10-11: "LRU's are now split between HOT, WARM, and COLD LRU's. New items enter the HOT LRU." | 2 (doc shipped in repo at the tag) | yes |
| Linux page cache | Two clock lists per node, inactive and active; a second access promotes; active list demotes when too big. Multi-gen LRU is the newer alternative | [mm/workingset.c v6.8 L20-L29](https://github.com/torvalds/linux/blob/v6.8/mm/workingset.c#L20-L29); [Documentation/admin-guide/mm/multigen_lru.rst v6.8 L6-L9](https://github.com/torvalds/linux/blob/v6.8/Documentation/admin-guide/mm/multigen_lru.rst#L6-L9) | workingset.c L23-25: "two clock lists are maintained for file pages: the inactive and the active list." MGLRU doc L6-7: "an alternative LRU implementation that optimizes page reclaim" | 1 + 2 | yes |

Notes: I also opened [antirez.com/news/109](http://antirez.com/news/109), the Redis author's personal blog, which the Redis docs link to for LFU. I did not rely on it.

### Why the decision is interesting
Python and groupcache pay for exactness with two pointers per entry plus a hash table; Redis says that memory cost is the reason it samples instead (Redis docs, quote above). memcached and Linux both split the list to resist scans: memcached says its primary goal is to better protect active items from "scanning" ([new_lru.txt L26-27](https://github.com/memcached/memcached/blob/1.6.21/doc/new_lru.txt#L26-L27)), and Linux promotes only pages "accessed multiple times on the inactive list" ([workingset.c L26-27](https://github.com/torvalds/linux/blob/v6.8/mm/workingset.c#L26-L27)). The list splice in the exact version is O(1) worst case per operation (visible in functools.py L575-L580 as four pointer assignments); Redis's eviction is a sampled approximation, so it has no exactness guarantee to state.

### Build sketch
Build: `cachesim`, a cache that reads a command script from stdin (`CAP n`, `PUT k v`, `GET k`, `DEL k`, `STATS`) and prints hits, misses and evictions. Each Core Problem swaps or adds one policy.

Core Problems:
1. Bounded map: `PUT`/`GET` with capacity; when full, evict the oldest inserted key (FIFO) and print `EVICT k`.
2. Exact LRU: `GET` refreshes recency; hash map plus doubly linked list; every op O(1).
3. `DEL`, `STATS` (hit/miss/evict counts) and an eviction log line.
4. Memoise a pure function (`CALL fib 30`) with an LRU cache of given size, as `functools.lru_cache` does; print cache info.
5. Segmented LRU: HOT/WARM/COLD with the rules from `new_lru.txt` (hit twice becomes active; flows toward COLD); a scan trace must not push out WARM items.
6. Sampled LRU, Redis style: the input supplies the "random" sample indices so output is deterministic; evict the idlest of N samples; add the candidate pool.
7. Approximate LFU: probabilistic counter increment (`LFULogIncr` rule) driven by supplied random numbers, plus decay.

Extra Problems:
- Active/inactive two-list policy as in `workingset.c`: promote on second access, demote when active is over a ratio.
- Replay a trace and compare hit ratios of the policies from problems 2, 5, 6.

### Prerequisites
Hash tables, linked lists (doubly linked). Dynamic arrays for sampling.

### Source strength
Strong: five independent systems, four of them with code at a tag or SHA and one with a repo doc at a tag.

### Risks
- Plain LRU is a well-known interview problem, so the Topic must lean on the approximations (sampling, segmentation) to be "beyond Leetcode".
- Sampled and LFU problems need injected randomness to stay stdin-to-stdout testable.
- The Redis eviction docs page is unversioned; always pair it with evict.c at 7.2.4.
- groupcache has no release tag; use the SHA.

---

## 2. Skip lists

### Real systems

| System | Decision | Primary source | Quote / lines | Type | Opened |
|---|---|---|---|---|---|
| Redis sorted sets | Skip list (translated from Pugh, with 3 changes) kept in step with a hash table member-to-score. Level chosen with p = 1/4, max 32 levels. A `span` per link gives rank queries | [src/t_zset.c 7.2.4 L35-L55](https://github.com/redis/redis/blob/7.2.4/src/t_zset.c#L35-L55), [L124-L130](https://github.com/redis/redis/blob/7.2.4/src/t_zset.c#L124-L130), [L135-L180](https://github.com/redis/redis/blob/7.2.4/src/t_zset.c#L135-L180); [src/server.h L522-L523](https://github.com/redis/redis/blob/7.2.4/src/server.h#L522-L523) | t_zset.c L50-51: "almost a C translation of the original algorithm described by William Pugh". server.h L523: "ZSKIPLIST_P 0.25 /* Skiplist P = 1/4 */". Docs: "dual-ported data structure containing both a skip list and a hash table" ([sorted sets](https://redis.io/docs/latest/develop/data-types/sorted-sets/), unversioned) | 1 + 2 | yes |
| LevelDB memtable | Insert-only skip list; lock-free readers, writes need external mutex; branching factor 4, max height 12 | [db/skiplist.h 1.23 L8-L28](https://github.com/google/leveldb/blob/1.23/db/skiplist.h#L8-L28), [L102](https://github.com/google/leveldb/blob/1.23/db/skiplist.h#L102), [L242-L251](https://github.com/google/leveldb/blob/1.23/db/skiplist.h#L242-L251); [db/memtable.h L75](https://github.com/google/leveldb/blob/1.23/db/memtable.h#L75) | skiplist.h L18-19: "Allocated nodes are never deleted until the SkipList is destroyed." L244: `kBranching = 4` | 1 | yes |
| RocksDB memtable | Skip list is the default memtable; only the skip list supports concurrent inserts; hash-skiplist and others are alternatives | [include/rocksdb/memtablerep.h v9.0.0 L22-L26](https://github.com/facebook/rocksdb/blob/v9.0.0/include/rocksdb/memtablerep.h#L22-L26); [memtable/skiplist.h L10-L16](https://github.com/facebook/rocksdb/blob/v9.0.0/memtable/skiplist.h#L10-L16); wiki [MemTable](https://github.com/facebook/rocksdb/wiki/MemTable) (unversioned) | memtablerep.h L22: "SkipListRep: This is the default; it is backed by a skip list." Wiki: "only skiplist-based memtable supports the feature" | 1 + 2 | yes |
| Java `ConcurrentSkipListMap` | Skip list with CAS-linked index nodes, separate from base nodes; p = 0.5 with sparse indices (about one quarter of nodes indexed), max 62 levels | [ConcurrentSkipListMap.java jdk-21+35 L69-L73](https://github.com/openjdk/jdk/blob/jdk-21+35/src/java.base/share/classes/java/util/concurrent/ConcurrentSkipListMap.java#L69-L73), [L246-L251](https://github.com/openjdk/jdk/blob/jdk-21+35/src/java.base/share/classes/java/util/concurrent/ConcurrentSkipListMap.java#L246-L251) | L70-71: "providing expected average log(n) time cost for the containsKey, get, put and remove operations" | 1 | yes |
| Pugh 1990 paper | Probabilistic balancing instead of rebalancing | [Skip Lists: A Probabilistic Alternative to Balanced Trees, CACM 1990](https://15721.courses.cs.cmu.edu/spring2018/papers/08-oltpindexes1/pugh-skiplists-cacm1990.pdf) (via mirror) | Abstract: "Skip lists use probabilistic balancing rather than strictly enforced balancing". Later: "I suggest that a value of 1/4 be used for p" | 3 | yes |

Redis's stated reason for choosing a skip list over a balanced tree: [NEEDS SOURCE] (N1). I only found it second-hand (a search summary of Hacker News comments by the author), which is not a primary source, and I did not open that thread. The t_zset.c header says what Redis did (translate Pugh, with three changes: duplicate scores allowed, comparison by score then member, a back pointer at level 1), not why. LevelDB's source also states no rationale for choosing a skip list.

### Why the decision is interesting
Pugh claims insertion and deletion are "much simpler and significantly faster" than balanced-tree algorithms because balance is probabilistic (abstract, above); search cost is expected, not worst case, O(log n). Redis keeps a hash table beside the skip list so that score lookup by member is a hash probe and range/rank queries use the list ([t_zset.c L35-L48](https://github.com/redis/redis/blob/7.2.4/src/t_zset.c#L35-L48)). LevelDB and RocksDB use the same structure for a different reason visible in the code: readers need no lock and nodes are never freed while the list lives (skiplist.h L8-L19), which suits an append-only memtable.

### Build sketch
Build: `zset`, an ordered set of (score, member) pairs driven by stdin commands (`ZADD s m`, `ZREM m`, `ZSCORE m`, `ZRANGE a b`, `ZRANK m`), backed by a skip list.

Core Problems:
1. Sorted linked list with insert/find/delete on integer keys (level 1 only).
2. Add levels: node heights are read from stdin (so tests are deterministic); insert links at every level.
3. Search from the top level; print the path of nodes visited and the comparison count.
4. Delete with level fix-up (shrink the list's current max level).
5. Range scan: `ZRANGEBYSCORE a b` and an iterator that supports `seek` then `next` (the LevelDB memtable access pattern).
6. Duplicate scores: order by (score, member); add the member-to-score hash so `ZSCORE` is O(1) expected and `ZADD` of an existing member moves it.
7. Spans: store skipped-node counts per link; implement `ZRANK` and `ZRANGE` by rank in expected O(log n).

Extra Problems:
- Memtable mode: entries carry a sequence number, delete writes a tombstone, nothing is ever removed (LevelDB design).
- Given a stream of random numbers, compute the level distribution for p = 1/2 and p = 1/4 and the expected pointer count.

### Prerequisites
Linked lists, binary search, (optionally) hash tables. Balanced trees are helpful context but not required.

### Source strength
Strong for "what", Medium for "why": four independent systems plus the original paper are verified at code or paper level, but the author's rationale for Redis is not in a first-party source I could open.

### Risks
- Concurrency (CAS in the JDK, release stores in LevelDB) is the most interesting part of those systems and cannot be tested through stdin-to-stdout; keep it in the reading, not in problems.
- Expected-time claims need randomness fixed by the test harness.
- The "why not a tree" angle is unsourced (N1); frame chapters around "what they did".

---

## 3. Bloom filters

### Real systems

| System | Decision | Primary source | Quote / lines | Type | Opened |
|---|---|---|---|---|---|
| LevelDB | Optional per-table filter policy; built-in Bloom; k = bits_per_key x 0.69 (clamped 1 to 30); k probes derived by double hashing from one hash; k stored as last byte | [util/bloom.cc 1.23 L17-L54](https://github.com/google/leveldb/blob/1.23/util/bloom.cc#L17-L54); [doc/index.md L392-L412](https://github.com/google/leveldb/blob/1.23/doc/index.md#L392-L412) | bloom.cc L21: "k_ = static_cast<size_t>(bits_per_key * 0.69);  // 0.69 =~ ln(2)". L44: "Use double-hashing to generate a sequence of hash values." index.md L410-412: reduces reads "by a factor of approximately a 100" at 10 bits per key | 1 + 2 | yes |
| RocksDB | Full filter per SST file; cache-local ("blocked") Bloom so all probes fall in one 64-byte cache line; partitioned filters; also a Ribbon alternative | [util/bloom_impl.h v9.0.0 L94-L104](https://github.com/facebook/rocksdb/blob/v9.0.0/util/bloom_impl.h#L94-L104); [include/rocksdb/filter_policy.h L135-L170](https://github.com/facebook/rocksdb/blob/v9.0.0/include/rocksdb/filter_policy.h#L135-L170); wiki [RocksDB Bloom Filter](https://github.com/facebook/rocksdb/wiki/RocksDB-Bloom-Filter) (unversioned) | bloom_impl.h L94: "A fast, flexible, and accurate cache-local Bloom implementation". Wiki: "Full filter limits the probe bits for a key to be all within the same CPU cache line." | 1 + 2 | yes |
| Bigtable | Optional per-locality-group Bloom filters on SSTables to avoid disk seeks | [Bigtable, OSDI 2006](https://research.google.com/archive/bigtable-osdi06.pdf), Section 6 "Refinements", "Bloom filters" | "a small amount of tablet server memory used for storing Bloom filters drastically reduces the number of disk seeks" | 3 | yes |
| Cassandra | Per-SSTable Bloom filter; tunable `bloom_filter_fp_chance`; default 0.1 for LCS, 0.01 otherwise; off-heap | [Cassandra 4.1 docs: Bloom filters](https://cassandra.apache.org/doc/4.1/cassandra/operating/bloom_filters.html) | "The default value for bloom_filter_fp_chance is 0.1 for tables using LeveledCompactionStrategy and 0.01 for all other cases." | 2 | yes |
| PostgreSQL `bloom` index | Signature-file index: a fixed-length Bloom signature per row over many columns, lossy, so rechecks are needed | [PG 16 docs: bloom](https://www.postgresql.org/docs/16/bloom.html) | "most useful when a table has many attributes and queries test arbitrary combinations of them." Defaults: `length` 80 bits, 2 bits per column | 2 | yes |
| PostgreSQL BRIN bloom opclasses | One Bloom filter per block range; sized by `n_distinct_per_range` and `false_positive_rate` (default 0.01) | [PG 16 docs: BRIN built-in opclasses](https://www.postgresql.org/docs/16/brin-builtin-opclasses.html) | "The bloom operator classes build a Bloom filter for all values in the range." | 2 | yes |
| Bloom 1970 paper | The structure itself ("method 2": d hash bit addresses per message into one bit area) | [Space/Time Trade-offs in Hash Coding with Allowable Errors, CACM 13(7)](https://www.cs.princeton.edu/courses/archive/spr05/cos598E/bib/p422-bloom.pdf) (via mirror) | "all d bits addressed ... are set to 1" to store; "If any of these bits is zero, the message is rejected." | 3 | yes |
| HBase | Row and row+column Bloom filters on HFiles | none opened | [NEEDS SOURCE] (N2). The book page was too large to read and the asciidoc source is not at the tags I tried | - | no |
| Chrome Safe Browsing | Not a Bloom filter in the current public protocol: clients keep a local database of hash prefixes | [Update API v4](https://developers.google.com/safe-browsing/v4/update-api) | "If the hash prefix is not present in the local database, then the URL is considered safe." The page does not mention Bloom filters. That Chrome ever used a Bloom filter: [NEEDS SOURCE] (N3) | 2 | yes |

Finding: drop Chrome Safe Browsing as a Chapter. The primary documentation describes hash-prefix lists, not Bloom filters, and I found no first-party source for an earlier Bloom design.

### Why the decision is interesting
In an LSM store a point read can touch many files, so a small in-memory filter that can say "definitely not here" removes disk reads ([LevelDB index.md L392-L396](https://github.com/google/leveldb/blob/1.23/doc/index.md#L392-L396); Bigtable section 6). The trade is memory against false-positive rate: Cassandra documents that 0.01 needs "about three times as much memory" as 0.1, and RocksDB's wiki gives 9.9 bits per key for a 1% rate. The engineering is in the details: LevelDB derives all probes from one hash with a rotate-and-add (bloom.cc L44-L52, citing Kirsch and Mitzenmacher), and RocksDB confines probes to one cache line to cut cache misses (bloom_impl.h L94-L104). Bloom filters have no false negatives; the false-positive rate is a probability, not a time bound.

### Build sketch
Build: `bloomkit`, a Bloom filter library with a stdin command interface (`NEW n p`, `ADD key`, `HAS key`, `DUMP`, `LOAD hex`).

Core Problems:
1. Bit array with `SET i` / `TEST i`, and `ADD`/`HAS` using k fixed, specified hash functions; output `MAYBE` or `NO`.
2. Sizing: given n keys and target p, print m bits and k probes; then LevelDB's `bits_per_key` rule (k = floor(bits_per_key x 0.69), clamped 1 to 30).
3. Double hashing: derive k probes from one 32-bit hash with the specified rotate-and-add; output exact bit positions for given keys.
4. Measure: add a given key set, probe a given absent set, print the number of false positives (deterministic given the spec'd hash).
5. Serialise like LevelDB (bit array plus a trailing byte holding k); `DUMP` then `LOAD` round-trips; reject unknown k.
6. Filter per table: given several named "files", each with its key set, `GET key` prints which files would be read with and without filters.
7. Merge: bitwise-OR two same-shape filters, and per-range filters (BRIN-style) deciding which ranges to scan.

Extra Problems:
- Cache-local (blocked) variant: all k probes inside one 512-bit block; compare measured false-positive rate to problem 4.
- PostgreSQL-style signature index: per-column bit counts, a row matches if all query bits are set; report rows needing recheck.

### Prerequisites
Hash tables (hashing, modulo), dynamic arrays / bit manipulation. Binary search is not needed.

### Source strength
Strong: LevelDB and RocksDB code at tags, Cassandra and PostgreSQL official docs, the Bigtable paper and the original paper are all opened and agree.

### Risks
- Bit-exact tests depend on specifying one hash function in the problem text; real systems use MurmurHash variants, so the problem must define its own hash rather than reproduce theirs.
- The 10-bits-per-key claim about LevelDB's "factor of approximately a 100" is a doc claim, not a measurement we ran.
- Primary sources for HBase and Chrome are missing (N2, N3).

---

## 4. LSM trees / log-structured storage

Honest verdict: this is a capstone, not a standalone Topic. Every system below combines four earlier ideas: a sorted in-memory table (LevelDB's is a skip list), an append-only log for durability, immutable sorted files, and a k-way merge; most also add Bloom filters. A learner who has not done skip lists, logs and Bloom filters would be learning four structures at once. The right slot is after those, as a Build that reuses their code.

### Real systems

| System | Decision | Primary source | Quote / lines | Type | Opened |
|---|---|---|---|---|---|
| LevelDB | Log file plus memtable; flush to a young (level-0) sorted table; levels, with level-0 merged into level-1 when 4 files exist; compactions drop overwritten values | [doc/impl.md 1.23 L11-L33](https://github.com/google/leveldb/blob/1.23/doc/impl.md#L11-L33), [L67-L86](https://github.com/google/leveldb/blob/1.23/doc/impl.md#L67-L86), [L104-L105](https://github.com/google/leveldb/blob/1.23/doc/impl.md#L104-L105) | L13-14: "Each update is appended to the current log file." L18-19: "A copy of the current log file is kept in an in-memory structure (the memtable)." | 2 | yes |
| LevelDB log format | 32 KB blocks of records with checksum, length, type | [doc/log_format.md 1.23 L1-L30](https://github.com/google/leveldb/blob/1.23/doc/log_format.md#L1-L30) | L4: "The log file contents are a sequence of 32KB blocks." | 2 | yes |
| Bigtable | Commit log plus sorted memtable; minor compaction freezes the memtable into an SSTable; major compaction rewrites all into one | [Bigtable, OSDI 2006](https://research.google.com/archive/bigtable-osdi06.pdf), Sections 5.3 and 5.4 | "A merging compaction that rewrites all SSTables into exactly one SSTable is called a major compaction." | 3 | yes |
| O'Neil et al. LSM-tree | Defer and batch index changes through a memory component and disk components, "reminiscent of merge sort" | [The Log-Structured Merge-Tree, Acta Informatica](https://www.cs.umb.edu/~poneil/lsmtree.pdf) (author's site) | Abstract: "cascading the changes from a memory-based component through one or more disk components" | 3 | yes |
| RocksDB | Leveled compaction: level targets grow by `max_bytes_for_level_multiplier`; L0 files may overlap | [wiki: Leveled Compaction](https://github.com/facebook/rocksdb/wiki/Leveled-Compaction) (unversioned) | "Target_Size(Ln+1) = Target_Size(Ln) * max_bytes_for_level_multiplier." | 2 | yes |
| Cassandra | Commit log, memtables flushed to immutable SSTables, compaction merges SSTables | [Cassandra 4.1 docs: storage engine](https://cassandra.apache.org/doc/4.1/cassandra/architecture/storage_engine.html) | "Eventually, memtables are flushed onto disk and become immutable SSTables." | 2 | yes |

### Why the decision is interesting
The LSM-tree turns random writes into sequential ones: O'Neil et al. say it is "most useful in applications where index inserts are more common than finds" (paper, abstract), and LevelDB's log-then-memtable-then-sorted-table path ([impl.md L13-L16](https://github.com/google/leveldb/blob/1.23/doc/impl.md#L13-L16)) shows the mechanism. The cost moves to reads and to background compaction: LevelDB warns that slow compactions let level-0 files pile up ([impl.md L122-L125](https://github.com/google/leveldb/blob/1.23/doc/impl.md#L122-L125)), and RocksDB's wiki says leveled write amplification is often above 10. Bloom filters then pay back the read cost (section 3).

### Build sketch
Build: `minilsm`, a key-value store driven by stdin (`PUT k v`, `GET k`, `DEL k`, `FLUSH`, `COMPACT`, `STATS`) that keeps everything in memory structures but behaves like the disk layout (tables as sorted arrays).

Core Problems:
1. Memtable with `PUT`/`GET`/`DEL` (delete writes a tombstone).
2. `FLUSH` freezes the memtable into an immutable sorted table; print its key range.
3. Read path: check memtable, then tables newest to oldest; print how many tables were consulted.
4. Merge two sorted tables, newest wins, tombstones kept; verify output order.
5. Level-0 rule: when 4 tables exist, merge them into level-1 (the LevelDB threshold, impl.md L28-L33); drop overwritten values, and drop tombstones only at the bottom level.
6. Attach a Bloom filter per table (reuse section 3); `STATS` prints tables skipped by filters.
7. Write-ahead log: every `PUT` is appended first; a `CRASH` then `RECOVER` script replays the log.

Extra Problems:
- Size-tiered vs leveled: count total bytes rewritten for a trace under each strategy (write amplification).
- Range scan across memtable and tables with a heap-based k-way merge iterator.

### Prerequisites
Skip lists (or sorted arrays), Bloom filters, append-only logs, heaps (k-way merge), binary search.

### Source strength
Strong: LevelDB docs at a tag, Bigtable, O'Neil and Cassandra/RocksDB docs. Weakness: the docs are descriptive; there is no single code file to quote for the whole design.

### Risks
- Too big for one Topic; do it last and make each Core Problem reuse earlier Topics' code.
- Disk behaviour (fsync, file formats) cannot be tested through stdin to stdout; the Build must simulate files in memory.
- RocksDB wiki and Cassandra docs are not pinned to a version in the pages I opened (4.1 is for Cassandra only).

---

## 5. Graphs: topological sort and dependency resolution

### Real systems

| System | Decision | Primary source | Quote / lines | Type | Opened |
|---|---|---|---|---|---|
| Python `graphlib.TopologicalSorter` | Per-node predecessor counters; `prepare` finds cycles; `get_ready`/`done` hands out ready nodes so a caller can work in parallel; cycle search is a separate DFS | [Lib/graphlib.py v3.12.4 L5-L6, L86-L106, L175-L196, L198-L212](https://github.com/python/cpython/blob/v3.12.4/Lib/graphlib.py#L86-L106); docs [graphlib 3.12](https://docs.python.org/3.12/library/graphlib.html) | Docs: "A complete topological ordering is possible if and only if the graph has no directed cycles". Code L193-195: decrement `npredecessors`; at 0, append to ready nodes | 1 + 2 | yes |
| GNU coreutils `tsort` | Knuth's Algorithm T; on a cycle prints the loop to stderr and breaks it | [src/tsort.c v9.5 L19-L21](https://github.com/coreutils/coreutils/blob/v9.5/src/tsort.c#L19-L21), [L302-L321](https://github.com/coreutils/coreutils/blob/v9.5/src/tsort.c#L302-L321), [L512-L513](https://github.com/coreutils/coreutils/blob/v9.5/src/tsort.c#L512-L513) | L19-21: "The topological sort is done according to Algorithm T (Topological sort) in Donald E. Knuth". L513: "input contains a loop:" | 1 | yes |
| Go language: package variable initialisation | Spec defines initialisation as repeatedly picking the earliest-declared variable that is "ready"; leftover variables mean a cycle | [go_spec.html go1.22.0 L8028-L8036](https://github.com/golang/go/blob/go1.22.0/doc/go_spec.html#L8028-L8036) | L8028-8030: "Initialization proceeds by repeatedly initializing the next package-level variable that is earliest in declaration order and ready for initialization" | 2 | yes |
| Go `go list -deps` | Dependencies visited depth-first post-order, so a package appears after its dependencies | [cmd/go/alldocs.go go1.22.0 L938-L940](https://github.com/golang/go/blob/go1.22.0/src/cmd/go/alldocs.go#L938-L940) | "It visits them in a depth-first post-order traversal, so that a package is listed only after all its dependencies." | 2 | yes |
| GNU Make | Targets depend on prerequisites; on a loop it prints "Circular xxx <- yyy dependency dropped" and continues | [doc/make.texi 4.4.1 L581-L582, L13370-L13373](https://github.com/mirror/make/blob/4.4.1/doc/make.texi#L13370-L13373) (GitHub `mirror/make`, not upstream Savannah) | L13370-71: "Circular xxx <- yyy dependency dropped." / "make detected a loop in the dependency graph" | 2 | yes |
| Bazel | The "depends upon" relation over targets is a DAG | [Bazel: Dependencies](https://bazel.build/concepts/dependencies) (unversioned) | "The depends upon relation induces a Directed Acyclic Graph (DAG) over targets" | 2 | yes |
| systemd | `Before=`/`After=` give ordering; on an ordering cycle it deletes a job to break it and logs it | [man/systemd.unit.xml v255 L799-L812](https://github.com/systemd/systemd/blob/v255/man/systemd.unit.xml#L799-L812); [src/core/transaction.c L399-L411](https://github.com/systemd/systemd/blob/v255/src/core/transaction.c#L399-L411) | unit.xml L810: "After= ensures the opposite, that the listed unit is fully started up before the configured unit is started" (Before= text, L808-810). transaction.c L410: "deleted to break ordering cycle" | 2 + 1 | yes (transaction.c: string seen by grep, context lines read) |
| Kahn 1962 | The original ready-set/in-degree algorithm | ACM landing pages return 403; not opened | Name "Kahn's algorithm" applied to graphlib or tsort: [NEEDS SOURCE] (N5). Kahn's paper itself: [NEEDS SOURCE] (N4) | 3 | no |
| Go build action order, Bazel cycle rejection | How `go build` orders compile actions; whether Bazel errors on cycles | none opened | Go build ordering: [NEEDS SOURCE] (N6). Bazel cycle rejection (the opened page does not mention cycles): [NEEDS SOURCE] (N7) | - | no |

### Why the decision is interesting
tsort and graphlib solve the same problem with a counter of unmet predecessors, but expose different shapes: tsort emits one linear order and breaks cycles to keep going; graphlib hands out "ready" batches so independent nodes can be built in parallel and raises `CycleError` early ([graphlib.py L86-L106](https://github.com/python/cpython/blob/v3.12.4/Lib/graphlib.py#L86-L106)). Go's initialisation rule adds a tie-break (declaration order), which makes the output deterministic. Counter-based topological sort runs in O(V + E) worst case; I did not find that claim in a primary source, so treat it as general knowledge until cited.

### Build sketch
Build: `depsolve`, a dependency resolver reading `A B` edge lines ("A must come before B") from stdin and a command (`ORDER`, `READY`, `DONE x`, `CYCLE`).

Core Problems:
1. Parse edges; print in-degree of each node.
2. `ORDER`: counter-based topological sort with a fixed tie-break (smallest name first) so output is unique.
3. Cycle detection: print `CYCLE` or the order.
4. Print one actual cycle path (as tsort prints the loop).
5. Scheduler mode: `READY` prints all currently ready nodes, `DONE x` releases successors (the `get_ready`/`done` protocol).
6. Go-style initialisation: nodes carry a declaration index; repeatedly pick the earliest ready node; leftovers are an init cycle.
7. Rounds: print build "waves" (all nodes ready at once) and the critical-path length.

Extra Problems:
- Reverse dependencies: given a changed node, list everything that must rebuild, in order.
- systemd-style `Before=`/`After=` merge into one edge set; report ordering cycles and which unit would be dropped.

### Prerequisites
Hash tables, queues/linked lists, dynamic arrays. A basic graph representation (adjacency list) must be taught in the Topic itself or in a prior graph Topic.

### Source strength
Strong for the algorithm (two code files plus a language spec and `go list`), Medium for "real systems" breadth: Make, Bazel, and systemd are docs-only or partial, and Kahn's paper and Go build ordering are unsourced.

### Risks
- Many learners already know this from standard interview prep, so the Chapters must be about the systems' unusual choices (cycle policy, parallel batches, determinism).
- Some "systems" are a doc sentence, not a decision with code; keep the Chapters to graphlib, tsort, Go init order and systemd.
- Citing Kahn needs another source (N4, N5).

---

## 6. Union-find / disjoint sets

### Real systems

| System | Decision | Primary source | Quote / lines | Type | Opened |
|---|---|---|---|---|---|
| Linux kernel (`lib/union_find.c`) | Union by rank plus path compression, used in `generate_sched_domains` (L718) to merge overlapping cpusets into scheduler-domain partitions | [lib/union_find.c v6.12 L4-L49](https://github.com/torvalds/linux/blob/v6.12/lib/union_find.c#L4-L49); [Documentation/core-api/union_find.rst L14-L40](https://github.com/torvalds/linux/blob/v6.12/Documentation/core-api/union_find.rst#L14-L40); [kernel/cgroup/cpuset.c L821-L839](https://github.com/torvalds/linux/blob/v6.12/kernel/cgroup/cpuset.c#L821-L839) | union_find.c L5-6: "Find the root of a node and perform path compression". L26: "Merge two sets, using union by rank". rst L36-40 says each operation takes "average" O(alpha(n)); label that amortised. File is absent at v6.8 and v6.10 (404), present at v6.12 | 1 + 2 | yes |
| LLVM `EquivalenceClasses` | Tarjan's union-find over arbitrary ordered elements; leader plus member iteration; path compression in `findLeader` | [llvm/ADT/EquivalenceClasses.h llvmorg-18.1.8 L10-L11, L26-L29, L224-L229](https://github.com/llvm/llvm-project/blob/llvmorg-18.1.8/llvm/include/llvm/ADT/EquivalenceClasses.h#L10-L11) | L10-11: "equivalence classes through the use Tarjan's efficient union-find algorithm". L224-226: "This does the path-compression part that makes union-find 'union findy'." | 1 | yes |
| LLVM `IntEqClasses` | Dense-integer variant: leader is the smallest member; `compress()` renumbers classes and freezes the structure | [IntEqClasses.h L8-L16](https://github.com/llvm/llvm-project/blob/llvmorg-18.1.8/llvm/include/llvm/ADT/IntEqClasses.h#L8-L16), [lib/Support/IntEqClasses.cpp L32-L47](https://github.com/llvm/llvm-project/blob/llvmorg-18.1.8/llvm/lib/Support/IntEqClasses.cpp#L32-L47) | cpp L36-37: "Update pointers while searching for the leaders, compressing the paths incrementally." | 1 | yes |
| rustc type inference (via the `ena` crate) | Type variables unified through a union-find table | [rustc_infer/src/infer/type_variable.rs 1.80.0 L11, L29](https://github.com/rust-lang/rust/blob/1.80.0/compiler/rustc_infer/src/infer/type_variable.rs#L11-L29); [rustc_data_structures/src/lib.rs L45-L47](https://github.com/rust-lang/rust/blob/1.80.0/compiler/rustc_data_structures/src/lib.rs#L45-L47); [ena v0.14.0 src/unify/mod.rs L11, L154-L158](https://github.com/rust-lang/ena/blob/v0.14.0/src/unify/mod.rs#L154-L158) | ena L154-155: "We implement Tarjan's union-find algorithm". type_variable.rs L29: `eq_relations: ut::UnificationTableStorage<TyVidEqKey<'tcx>>` | 1 | yes |
| Boost.Graph Kruskal | Kruskal's MST using a disjoint-sets structure to test whether an edge joins two components | [boost/graph/kruskal_min_spanning_tree.hpp boost-1.85.0 L29, L36-L40, L66-L90](https://github.com/boostorg/graph/blob/boost-1.85.0/include/boost/graph/kruskal_min_spanning_tree.hpp#L66-L90) | L68: `disjoint_sets< Rank, Parent > dset(rank, parent);` L86-87: `find_set(source(e, G))`, `find_set(target(e, G))` | 1 | yes |
| OpenCV connected components | Labelling uses a union-find parent array with path compression (`find`, `set_union`, `flattenL`) inside the SAUF/BBDT/Spaghetti algorithms | [modules/imgproc/src/connectedcomponents.cpp 4.9.0 L221-L260](https://github.com/opencv/opencv/blob/4.9.0/modules/imgproc/src/connectedcomponents.cpp#L221-L260); [imgproc.hpp L3925-L3926](https://github.com/opencv/opencv/blob/4.9.0/modules/imgproc/include/opencv2/imgproc.hpp#L3925-L3926) | cpp L221: "Find the root of the tree of the node i and compress the path in the process". imgproc.hpp: ccltype picks "Bolelli (Spaghetti)... Grana (BBDT)... Wu's (SAUF)" | 1 | yes (docs.opencv.org returned 403; the header and source were read instead) |

Kruskal in "networking libraries": the only library found and opened is Boost.Graph, which is a general graph library, not a networking one. The Linux rst L28-30 names network routing as a use of Kruskal, but the kernel's own use is cpusets (above).

### Why the decision is interesting
Union-find answers "are these two things in the same group?" while groups merge over time. The kernel uses it to merge overlapping CPU sets into scheduling partitions (cpuset.c L826-L832), and rustc uses it to merge type variables that must be equal. Rank plus path compression gives amortised near-constant time per operation (inverse Ackermann; the Linux rst L36-L40 states it as "average time complexity", which I label amortised). Real code differs in the details: LLVM's `IntEqClasses` keeps the smallest member as leader and freezes after `compress()`, while OpenCV compresses paths as it labels pixels.

### Build sketch
Build: `groups`, a disjoint-set library driven by stdin (`MAKE n`, `UNION a b`, `FIND a`, `SAME a b`, `COUNT`, `SIZE a`).

Core Problems:
1. Parent array: `MAKE`, `FIND` without optimisation, `UNION`, `SAME`.
2. Union by size or rank; print tree height after each union.
3. Path compression (or halving, as in the kernel); print the parent array after a `FIND`.
4. `COUNT` of components and `SIZE a`; list each component with its leader.
5. Kruskal: read weighted edges, print the MST edges and total weight.
6. Grid labelling: read a 0/1 grid and print component labels for 4- and 8-connectivity (OpenCV style).
7. Unification: variables with optional ground values; `EQ a b` merges and reports a conflict if two different ground values meet (ena-style).

Extra Problems:
- LLVM-style leaders: iterate members of a class in a stable order; `COMPRESS` renumbers classes 0..M-1.
- Merge overlapping sets (cpuset style): given sets of CPU ids, print the partitions where any two overlapping sets are merged.

### Prerequisites
Dynamic arrays (parent array). Trees help to explain rank but are not required. Hash tables for non-integer elements.

### Source strength
Strong: five independent code bases at tags (Linux, LLVM, rustc/ena, Boost, OpenCV), all verified.

### Risks
- Plain union-find is also a popular Leetcode topic, so the "real systems" angle must carry the Topic.
- Time-complexity claims (inverse Ackermann) are stated in the Linux rst and the ena comment names Tarjan; I did not open Tarjan's paper (not claimed here).
- Linux needs v6.12 or later; earlier tags 404.

---

## 7. Append-only logs / write-ahead logs

### Real systems

| System | Decision | Primary source | Quote / lines | Type | Opened |
|---|---|---|---|---|---|
| Kafka log | Partition is an append-only log; serial appends always go to the last file; segment files rolled at a size; reading an offset locates the segment by binary search over an in-memory range | [docs/design.html 3.7.0 L78](https://github.com/apache/kafka/blob/3.7.0/docs/design.html#L78); [docs/implementation.html L178, L185](https://github.com/apache/kafka/blob/3.7.0/docs/implementation.html#L178) | impl L178: "The log allows serial appends which always go to the last file." L185: "The search is done as a simple binary search variation against an in-memory range maintained for each file." | 2 | yes |
| Kafka log compaction | Background cleaner recopies segments, removing records whose key reappears later | [docs/design.html L557-L562](https://github.com/apache/kafka/blob/3.7.0/docs/design.html#L557-L562) | L557: "Log compaction is handled by the log cleaner, a pool of background threads that recopy log segment files" | 2 | yes |
| PostgreSQL WAL | Log changes before data files are changed; crash recovery is REDO; commit needs only the WAL flushed | [PG 16 docs: WAL introduction](https://www.postgresql.org/docs/16/wal-intro.html) | "changes to data files ... must be written only after those changes have been logged" | 2 | yes |
| SQLite WAL | Changes are appended to a separate WAL file; original stays in the database; checkpoint copies back; a shared-memory `wal-index` lets readers find pages | [sqlite.org/wal.html](https://www.sqlite.org/wal.html) (unversioned, fetched 2026-10-04) | "The original content is preserved in the database file and the changes are appended into a separate WAL file." Default checkpoint at 1000 pages | 2 | yes |
| Redis AOF | Append every write command; replay on restart; `appendfsync` always / everysec / no; background rewrite to the minimal command set | [Redis persistence docs](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/) (unversioned, fetched 2026-10-04; I use only the text that covers both before and after 7.0) | "AOF persistence logs every write operation received by the server." "The suggested (and default) policy is to fsync every second." | 2 | yes |
| LevelDB log record format | Checksum, length, type (FULL/FIRST/MIDDLE/LAST) records in 32 KB blocks | [doc/log_format.md 1.23 L1-L30](https://github.com/google/leveldb/blob/1.23/doc/log_format.md#L1-L30) | L4: "a sequence of 32KB blocks" | 2 | yes |
| etcd-io/raft log | In-memory `raftLog` with stable `storage` and `unstable` entries; `findConflict` truncates at the first entry with same index but different term | [log.go v3.6.0 L23-L47](https://github.com/etcd-io/raft/blob/v3.6.0/log.go#L23-L47), [L107-L115](https://github.com/etcd-io/raft/blob/v3.6.0/log.go#L107-L115), [L142-L152](https://github.com/etcd-io/raft/blob/v3.6.0/log.go#L142-L152) | L149-150: "An entry is considered to be conflicting if it has the same index but a different term." | 1 | yes |
| Raft paper | Leader Append-Only and Log Matching properties | [In Search of an Understandable Consensus Algorithm (Extended)](https://raft.github.io/raft.pdf) (authors' own site), Figure 3 | "a leader never overwrites or deletes entries in its log; it only appends new entries." | 3 | yes |
| etcd server WAL on disk | How etcd persists the raft log | none opened | [NEEDS SOURCE] (N8). The raft library above leaves storage to the application (`Storage` interface, [storage.go L40-L46](https://github.com/etcd-io/raft/blob/v3.6.0/storage.go#L40-L46)) | - | no |

### Why the decision is interesting
Appending is cheap: Kafka says a persistent queue built on "simple reads and appends to files" makes "all operations O(1)" ([design.html L78](https://github.com/apache/kafka/blob/3.7.0/docs/design.html#L78)), and PostgreSQL says only the sequentially written WAL need be flushed at commit, which means fewer disk writes. The decision each system then makes is different: how often to fsync (Redis offers three policies, Kafka's M messages or S seconds, impl.html L178), how to keep the log from growing forever (Redis rewrite, Kafka compaction, SQLite checkpoint), and how to find a record (Kafka binary-searches segments; SQLite keeps a wal-index). Raft adds a rule for the log's tail: a follower deletes entries that conflict with the leader's, which is the only time an append-only log shrinks.

### Build sketch
Build: `logstore`, an append-only record log driven by stdin (`APPEND data`, `READ offset`, `RECOVER`, `COMPACT`) over an in-memory "file" byte array so crashes can be simulated by truncating it.

Core Problems:
1. `APPEND` returns the offset; `READ offset` returns the record (length-prefixed framing).
2. Checksums: each record carries a CRC; `READ` reports corruption.
3. Torn tail: a `TRUNCATE n` command simulates a crash; `RECOVER` keeps every valid record and drops the damaged tail (LevelDB and Redis behaviour).
4. Segments: roll a new segment at a size limit; locate the segment for an offset by binary search on base offsets (Kafka).
5. Replay: treat records as `SET k v`/`DEL k` and rebuild the key-value state on `RECOVER` (AOF/WAL).
6. Rewrite: `COMPACT` emits the minimal log with the latest value per key (Redis rewrite, Kafka compaction); a read after it must return the same state.
7. Raft-style append: `APPEND prevIndex prevTerm entries`; reject if prev does not match; truncate at the first conflicting entry.

Extra Problems:
- Fsync policy simulation: given a crash point and the policy (always / everysec / no), print which records survive.
- Sparse offset index: binary search the index, then scan forward.

### Prerequisites
Dynamic arrays, binary search, hash tables (for the replayed state). Linked lists not needed.

### Source strength
Medium: strong official docs for five systems, code only for etcd/raft and the LevelDB format doc, and etcd's on-disk WAL is unsourced (N8). Kafka's doc is in the repo at a tag but describes an older design in places (it reads like the original design notes).

### Risks
- Durability (fsync, torn writes) is hard to test faithfully by stdin and stdout; the Build must simulate crashes with explicit truncation commands.
- Redis, SQLite and the RocksDB-style docs are unversioned; state the fetch date or avoid version-specific claims.
- "Append-only log" overlaps with LSM and with consensus; keep this Topic to the log, framing, recovery and compaction.

---

## Ranking (best Topic first)

1. **LRU caches**: five code or doc sources agree on a clear contrast (exact vs sampled vs segmented), small steps, familiar prerequisites. Risk: the exact version is very well known.
2. **Skip lists**: four code sources plus the original paper; the ladder is clean and the Build is the same structure LevelDB and Redis use. Risk: Redis's "why" is unsourced (N1).
3. **Bloom filters**: strongest mix of code, official docs and papers; very small Build, and it feeds the LSM capstone. Risk: bit-exact tests need our own hash.
4. **Union-find**: five code bases at tags with real, varied uses (kernel, compiler, graphics). Risk: also a well-known Leetcode topic.
5. **Topological sort**: solid code sources (graphlib, tsort, Go spec); weaker on Make, Bazel, systemd and Kahn (N4 to N7).
6. **Append-only logs / WAL**: good docs but little code, and durability is hard to test via stdin.
7. **LSM trees**: best as a capstone after skip lists, Bloom filters and logs (see section 4).

## Suggested order

1. LRU caches (needs hash tables and linked lists)
2. Skip lists (linked lists, binary search)
3. Bloom filters (hash tables, bit arrays)
4. Union-find (arrays)
5. Topological sort (graphs, queues)
6. Append-only logs (arrays, binary search)
7. LSM trees, last, as a capstone built on 2, 3 and 6 (plus heaps for k-way merge)

Topics 4 and 5 can swap, and 1 to 3 can be reordered freely.

## Every [NEEDS SOURCE] marker

- N1 (section 2): Redis's stated reason for a skip list over a balanced tree. Only a second-hand summary found; no first-party page opened.
- N2 (section 3): HBase Bloom filter documentation. Book page too large to read; asciidoc source not found at the tags tried.
- N3 (section 3): that Chrome Safe Browsing ever used a Bloom filter. The opened v4 Update API page does not mention one.
- N4 (section 5): Kahn 1962 paper. ACM pages return 403.
- N5 (section 5): that the graphlib or tsort approach is "Kahn's algorithm". tsort's own header cites Knuth's Algorithm T instead.
- N6 (section 5): how `go build` orders its compile actions (only `go list -deps` order and the spec's initialisation rule are sourced).
- N7 (section 5): that Bazel rejects dependency cycles. The opened page says the relation is a DAG but does not mention cycles.
- N8 (section 7): etcd's on-disk WAL format and behaviour (only the raft library's log and `Storage` interface are sourced).

Total: 8 markers.

## Links opened

Code and in-repo docs (fetched with `curl` from raw.githubusercontent.com at the tag or SHA shown in the table):
- google/leveldb 1.23: db/skiplist.h, db/memtable.h, util/bloom.cc, doc/impl.md, doc/index.md, doc/log_format.md, db/log_writer.cc
- redis/redis 7.2.4: src/t_zset.c, src/evict.c, src/server.h, src/aof.c (opened, not cited)
- python/cpython v3.12.4: Lib/functools.py, Lib/graphlib.py
- golang/groupcache 2c02b8208cf8c02a3e358cb1d9b60950647543fc: lru/lru.go
- facebook/rocksdb v9.0.0: memtable/skiplist.h, include/rocksdb/memtablerep.h, util/bloom_impl.h, include/rocksdb/filter_policy.h
- openjdk/jdk jdk-21+35: ConcurrentSkipListMap.java
- memcached/memcached 1.6.21: doc/new_lru.txt
- torvalds/linux v6.8: mm/workingset.c, Documentation/admin-guide/mm/multigen_lru.rst
- torvalds/linux v6.12: include/linux/union_find.h, lib/union_find.c, Documentation/core-api/union_find.rst, kernel/cgroup/cpuset.c, kernel/cgroup/cpuset-v1.c
- coreutils/coreutils v9.5: src/tsort.c
- golang/go go1.22.0: src/cmd/go/alldocs.go, doc/go_spec.html, src/cmd/go/internal/load/pkg.go
- mirror/make 4.4.1: doc/make.texi
- systemd/systemd v255: man/systemd.unit.xml, src/core/transaction.c
- llvm/llvm-project llvmorg-18.1.8: ADT/EquivalenceClasses.h, ADT/IntEqClasses.h, lib/Support/IntEqClasses.cpp
- rust-lang/rust 1.80.0: compiler/rustc_infer/src/infer/type_variable.rs, compiler/rustc_data_structures/src/lib.rs
- rust-lang/ena v0.14.0: src/unify/mod.rs, src/lib.rs
- boostorg/graph boost-1.85.0: include/boost/graph/kruskal_min_spanning_tree.hpp
- opencv/opencv 4.9.0: modules/imgproc/src/connectedcomponents.cpp, modules/imgproc/include/opencv2/imgproc.hpp
- apache/kafka 3.7.0: docs/design.html, docs/implementation.html
- etcd-io/raft v3.6.0: log.go, log_unstable.go, storage.go

Docs, papers and wiki pages (WebFetch or `curl`):
- https://redis.io/docs/latest/develop/reference/eviction/
- https://redis.io/docs/latest/develop/data-types/sorted-sets/
- https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/
- http://antirez.com/news/109
- https://github.com/facebook/rocksdb/wiki/RocksDB-Bloom-Filter
- https://github.com/facebook/rocksdb/wiki/MemTable
- https://github.com/facebook/rocksdb/wiki/Leveled-Compaction
- https://www.postgresql.org/docs/16/bloom.html
- https://www.postgresql.org/docs/16/brin-builtin-opclasses.html
- https://www.postgresql.org/docs/16/wal-intro.html
- https://cassandra.apache.org/doc/4.1/cassandra/operating/bloom_filters.html
- https://cassandra.apache.org/doc/4.1/cassandra/architecture/storage_engine.html
- https://developers.google.com/safe-browsing/v4/update-api
- https://www.sqlite.org/wal.html
- https://docs.python.org/3.12/library/graphlib.html
- https://bazel.build/concepts/dependencies
- https://bazel.build/concepts/build-ref (read; contains nothing on cycles)
- https://15721.courses.cs.cmu.edu/spring2018/papers/08-oltpindexes1/pugh-skiplists-cacm1990.pdf (Pugh, via mirror)
- https://www.cs.princeton.edu/courses/archive/spr05/cos598E/bib/p422-bloom.pdf (Bloom, via mirror)
- https://research.google.com/archive/bigtable-osdi06.pdf
- https://www.cs.umb.edu/~poneil/lsmtree.pdf
- https://raft.github.io/raft.pdf

Tried and not usable (no claim relies on them):
- https://dl.acm.org/doi/10.1145/362686.362692 (403)
- https://docs.opencv.org/4.9.0/d3/dc0/group__imgproc__shape.html (403)
- https://www.freedesktop.org/software/systemd/man/latest/systemd.unit.html (403)
- https://kafka.apache.org/39/documentation.html (page body not returned; read the repo docs instead)
- https://hbase.apache.org/book.html (no Bloom section returned)
- https://www.gnu.org/software/make/manual/html_node/Rule-Syntax.html (429; read make.texi instead)
- https://cassandra.apache.org/doc/4.1/cassandra/architecture/storage-engine.html (404; the underscore URL worked)
