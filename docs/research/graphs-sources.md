# Graphs: sources

Research for the Topic `graphs` (card C117, issue #257). Every claim about a real system that the five Chapters make is listed below with its source. The Problems follow the same sources: the rules in each statement are the rules in the code or text quoted here, except where a statement says it is written for the Problem.

Pinned versions. Code links in the Chapters use the commit SHA, never a branch or a tag.

| Project | Tag | Commit |
|---|---|---|
| Boost.Graph | `boost-1.85.0` | `a649be53bd90ab3365c6c0c44414c80907cfd8a1` (lightweight tag in `boostorg/graph`; its `doc/` and `include/` folders) |
| Linux | `v6.6` | `ffc253263a1375a65fa6c9f62a893e9767fbebfa` (annotated tag object `5260836abb7056beed3f3f0d0e4262c11f36f0d0`; the pin of the Sliding window Topic) |
| Linux | `v6.12` | `adc218676eef25575469234709c2d87185ca223a` (annotated tag object `06090c9b622a7e1f797e775db4c035e0d779b76e`; `lib/union_find.c` is absent at v6.8 and v6.10) |
| CPython | `v3.13.0` | `60403a5409ff2c3f3b07dd2ca91a7a3e096839c7` (annotated tag object `3f27099d916c7b885e3daf1fabedcc119462014d`; the pin of the Hash tables Topic) |
| GNU coreutils | `v9.5` | `cc8689a07c8cfece66707936e3b914174912bd36` (annotated tag object `143eb39b9664c5db21093f7d6b1e63e2d788cb44`) |
| Go | `go1.22.0` | `a10e42f219abb9c5bc4e7d86d9464700a42c7d57` (lightweight tag) |
| OpenCV | `4.9.0` | `dad8af6b17f8e60d7b95a1203a1b4d22f56574cf` (annotated tag object `d7d867066ae146114613661bd3a20a53cda9c16c`) |
| FRRouting | `frr-10.0` | `03a143cd49ed1b190cb38f48a31ef4d71fa01a02` (annotated tag object `f7a4bae1d143130bba8c958d0d0e875e9ab95bef`) |
| RFC 2328 | April 1998 | `https://www.rfc-editor.org/rfc/rfc2328.html` (the RFC is immutable once published) |
| Python docs | 3.13 | `https://docs.python.org/3.13/library/graphlib.html` (fetched 2026-10-28; the page follows the latest 3.13 release, so it is not pinned to 3.13.0) |

Method. Code and documentation files in repositories were fetched with `curl` from `raw.githubusercontent.com/<org>/<repo>/<sha>/<path>` and line numbers read from the fetched file by a script that finds each quoted string, with whitespace normalised, comment markers dropped and HTML markup removed, and reports the lines it spans; a second script checks that, in every Chapter, Problem statement and solution, each quoted string lies inside the line range of the first link after it in the same paragraph. The RFC and the Python docs page were fetched as HTML from the project's own site and read as text; the RFC's HTML offers anchors down to the section number only (`#section-16` for 16.1 and 16.8), so those links name the subsection in their text. Source types: 1 = source code, 2 = official documentation, 3 = standard or original paper, 4 = a post by the system's own engineers. The fetched agent copy is a check that the quote is there; no human has opened any link (see `docs/research/human-review-queue.md`).

## Observed, not cited

- **The oracle.** The expected outputs of every Test come from a second implementation of all the commands, written with other techniques (Floyd-Warshall for costs and hop counts, repeated minimum selection for `order`, recomputed components for `same`, `groups` and `redundant`, a lexicographically smallest walk found by dynamic programming for `path`, `would` and `loop`). The Reference Code of the last stage, in each Language, was compared with it on random command scripts (see the PR for the counts) before the content check ran it.
- **Reference Code.** Python, TypeScript (Node) and Go were each run on every Test in the Problem's scope in the real Sandbox by the content check.
- **The Chapters' own code.** The Python of the Chapters (the breadth-first search of the lockdep Chapter) was run before it was shown.

## Leads that changed

- The issue's lead for Chapter 1 was "adjacency list versus matrix", with no system. The Chapter reads Boost.Graph, which ships both and documents when to use which.
- The issue's Chapter 2 is "breadth-first and depth-first search on a graph", with no system. The Chapter reads the Linux kernel's lock validator, which chose breadth first and says why. Depth-first search has no system of its own in this Topic: it is a section of that Chapter, with Boost's description of it cited, and the Problem `dfs`.
- The issue's lead for Chapter 3 was "a build tool's dependency graph". Make, Bazel and systemd, listed as leads in `candidates-storage-probabilistic-graphs.md`, are not read: their sources there are documentation sentences without a decision to read. The Chapter reads Python's `graphlib`, with `tsort` and `go list -deps` beside it.
- Chapter 4 had no lead in the issue. The Chapter reads the kernel's union-find and its use in cpusets; OpenCV is a section for the Extra Problem `islands`. LLVM, rustc and Boost's Kruskal, in the same research file, are not used.
- The issue's lead for Chapter 5 was "link-state routing". The Chapter reads RFC 2328 and FRRouting's implementation of its shortest-path step.
- Candidate Problems used: Number of Islands (`islands`, Extra), Course Schedule (`order` and `waves` answer it with `cycle`), Redundant Connection (`redundant`), Network Delay Time (`farthest`). Not used: Clone Graph (a copy of a graph prints nothing the Build's `out` does not already print, so it is not a step), Rotting Oranges (a multi-source breadth-first search by rounds on a grid; `waves` is the same idea on the Build's graph, and no system of the five frames it), Word Ladder (its graph is implicit, with words joined when they differ by one letter, and the Build's edges are made by commands).

## Claims cut for want of a source

- That a batch from `get_ready` is "why the module is built this way": replaced by the documentation sentence "designed to easily support parallel processing" (claim 3.5).
- That OSPF "is how many routers learn where to send each packet", and that an OSPF router "keeps every first step of a tie": replaced by what the RFC says (claims 5.1, 5.8).
- That the scheduler "needs to know which CPUs may share work": cut; the Chapter quotes what `generate_sched_domains` says it does (claim 4.8).
- That lists and sets of graph code are "what most graph code does", that a depth-first search "is deeper than some languages allow a recursive call to go", that "the queues of Python, Go and the Build's own heap have no cheap way to remove an entry": cut as unsourced or untrue (Go's `container/heap` has `Remove`).
- The name "path halving" for the kernel's `uf_find` loop: not used; the Chapter says what the loop does and quotes the comment's word, path compression.

---

## Chapter 1: Boost.Graph: a matrix or a list (`graphs-boost`)

### Claim 1.1. The deciding property of a graph is sparsity; E close to V squared is dense.
- Link: [doc/graph_theory_review.html (Boost 1.85.0), lines 196 to 199](https://github.com/boostorg/graph/blob/a649be53bd90ab3365c6c0c44414c80907cfd8a1/doc/graph_theory_review.html#L196-L199)
- Quote: "The primary property of a graph to consider when deciding which data structure to use is sparsity, the number of edges relative to the number of vertices in the graph."
- Quote: "A graph where E is close to V2 is a dense graph"
- Type 2. Status: sourced. The page italicises "sparsity" and "dense"; the quotes drop the markup. V2 in the page is V squared (a superscript).

### Claim 1.2. Dense graphs suit the adjacency matrix, sparse graphs the adjacency list.
- Link: [doc/graph_theory_review.html (Boost 1.85.0), lines 201 to 204](https://github.com/boostorg/graph/blob/a649be53bd90ab3365c6c0c44414c80907cfd8a1/doc/graph_theory_review.html#L201-L204)
- Quote: "For dense graphs, the adjacency-matrix representation is usually the best choice, whereas for sparse graphs the adjacency-list representation is a better choice."
- Type 2. Status: sourced.

### Claim 1.3. The matrix is a V x V array of Booleans.
- Link: [doc/graph_theory_review.html (Boost 1.85.0), lines 213 to 215](https://github.com/boostorg/graph/blob/a649be53bd90ab3365c6c0c44414c80907cfd8a1/doc/graph_theory_review.html#L213-L215)
- Quote: "An adjacency-matrix representation of a graph is a 2-dimensional V x V array."
- Quote: "stores a Boolean value saying whether the edge (u,v) is in the graph."
- Type 2. Status: sourced. The sub- and superscripts of the page's markup are dropped.

### Claim 1.4. Any edge of a matrix is accessed, added or removed in O(1); adding a vertex is O(V2).
- Link: [doc/graph_theory_review.html (Boost 1.85.0), lines 219 to 220](https://github.com/boostorg/graph/blob/a649be53bd90ab3365c6c0c44414c80907cfd8a1/doc/graph_theory_review.html#L219-L220)
- Quote: "Any edge can be accessed, added, or removed in O(1) time."
- Link: [doc/graph_theory_review.html (Boost 1.85.0), lines 220 to 222](https://github.com/boostorg/graph/blob/a649be53bd90ab3365c6c0c44414c80907cfd8a1/doc/graph_theory_review.html#L220-L222)
- Quote: "To add or remove a vertex requires reallocating and copying the whole graph, an O(V2) operation."
- Type 2. Status: sourced. Rendered text: V2 is V squared.

### Claim 1.5. adjacency_matrix sizes its array V x V (directed) or V(V+1)/2 (undirected), and finds a cell with u and v swapped so v is not greater.
- Link: [include/boost/graph/adjacency_matrix.hpp (Boost 1.85.0), lines 561 to 562](https://github.com/boostorg/graph/blob/a649be53bd90ab3365c6c0c44414c80907cfd8a1/include/boost/graph/adjacency_matrix.hpp#L561-L562)
- Link: [include/boost/graph/adjacency_matrix.hpp (Boost 1.85.0), lines 641 to 645](https://github.com/boostorg/graph/blob/a649be53bd90ab3365c6c0c44414c80907cfd8a1/include/boost/graph/adjacency_matrix.hpp#L641-L645)
- Type 1. Status: sourced. Code, shown in the Chapter as a block: `m_matrix(Directed::is_directed ? (n_vertices * n_vertices)` then `: (n_vertices * (n_vertices + 1) / 2))` (lines 561 to 562; the constructor appears again at lines 573 to 574), and in `get_edge` `if (v > u) std::swap(u, v);` `return m_matrix[u * (u + 1) / 2 + v];` (lines 641 to 645; the non-const `get_edge` repeats it a few lines below). Checked by reading the lines.

### Claim 1.6. The adjacency list stores an out-edge sequence per vertex and needs O(V + E) memory.
- Link: [doc/graph_theory_review.html (Boost 1.85.0), lines 246 to 248](https://github.com/boostorg/graph/blob/a649be53bd90ab3365c6c0c44414c80907cfd8a1/doc/graph_theory_review.html#L246-L248)
- Quote: "An adjacency-list representation of a graph stores an out-edge sequence for each vertex."
- Quote: "For sparse graphs this saves space since only O(V + E) memory is required."
- Type 2. Status: sourced.

### Claim 1.7. List edge insertion is O(1); accessing a given edge is O(alpha), alpha the maximum number of out-edges of a vertex.
- Link: [doc/graph_theory_review.html (Boost 1.85.0), lines 249 to 252](https://github.com/boostorg/graph/blob/a649be53bd90ab3365c6c0c44414c80907cfd8a1/doc/graph_theory_review.html#L249-L252)
- Quote: "Edge insertion is O(1), though accessing any given edge is O(alpha), where alpha is the sparsity factor of the matrix (which is equal to the maximum number of out-edges for any vertex in the graph)."
- Type 2. Status: sourced. The page italicises "alpha"; the words are the page's.

### Claim 1.8. A matrix makes a search that traverses all out-edges O(V2) where a list makes it O(V + E).
- Link: [doc/adjacency_matrix.html (Boost 1.85.0), lines 47 to 50](https://github.com/boostorg/graph/blob/a649be53bd90ab3365c6c0c44414c80907cfd8a1/doc/adjacency_matrix.html#L47-L50)
- Quote: "The second is that operations that traverse all the out-edges of each vertex (such as breadth-first search) run in O(V2) time instead of O(V + E) time for the adjacency list."
- Type 2. Status: sourced. Rendered text: V2 is V squared.

### Claim 1.9. adjacency_list takes a selector for each vertex's edge container; setS and hash_setS disallow parallel edges; adding a repeat to such a graph adds nothing.
- Link: [doc/adjacency_list.html (Boost 1.85.0), lines 101 to 102](https://github.com/boostorg/graph/blob/a649be53bd90ab3365c6c0c44414c80907cfd8a1/doc/adjacency_list.html#L101-L102)
- Quote: "The selector for the container used to represent the edge-list for each of the vertices."
- Link: [doc/adjacency_list.html (Boost 1.85.0), lines 463 to 465](https://github.com/boostorg/graph/blob/a649be53bd90ab3365c6c0c44414c80907cfd8a1/doc/adjacency_list.html#L463-L465)
- Quote: "The setS and hash_setS variants disallow parallel edges while the others allow parallel edges."
- Link: [doc/adjacency_list.html (Boost 1.85.0), lines 798 to 800](https://github.com/boostorg/graph/blob/a649be53bd90ab3365c6c0c44414c80907cfd8a1/doc/adjacency_list.html#L798-L800)
- Quote: "For graphs that do not allow parallel edges, if the edge is already in the graph then a duplicate will not be added and the bool flag will be false."
- Type 2. Status: sourced.

### Claim 1.10. vecS is the choice when memory and traversal speed matter more than stable descriptors.
- Link: [doc/adjacency_list.html (Boost 1.85.0), lines 304 to 307](https://github.com/boostorg/graph/blob/a649be53bd90ab3365c6c0c44414c80907cfd8a1/doc/adjacency_list.html#L304-L307)
- Quote: "If you are not as concerned about descriptor and iterator stability, and are more concerned about memory consumption and graph traversal speed, use vecS for the VertexList and/or OutEdgeList template parameters."
- Type 2. Status: sourced.


---

## Chapter 2: Linux lockdep: the shortest way round a cycle (`graphs-lockdep`)

### Claim 2.1. lockdep maps lock dependencies and warns about circular lock dependencies.
- Link: [kernel/locking/lockdep.c (Linux v6.6), lines 12 to 16](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/kernel/locking/lockdep.c#L12-L16)
- Quote: "this code maps all the lock dependencies as they occur in a live kernel and will warn about the following classes of locking bugs:"
- Quote: "circular lock dependencies"
- Type 1. Status: sourced.

### Claim 2.2. An edge prev -> next is a dependency between a previously held lock and the next lock to be acquired.
- Link: [kernel/locking/lockdep.c (Linux v6.6), lines 1446 to 1449](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/kernel/locking/lockdep.c#L1446-L1449)
- Quote: "In deadlock checks, a path from the next lock to be acquired to a previous held lock indicates that adding the <prev> -> <next> lock dependency will produce a circle in the graph."
- Type 1. Status: sourced.

### Claim 2.3. The lock-dependency graph is stored as a forward and a backward list per node.
- Link: [include/linux/lockdep_types.h (Linux v6.6), lines 111 to 113](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/lockdep_types.h#L111-L113)
- Quote: "These fields represent a directed graph of lock dependencies, to every node we attach a list of "forward" and a list of "backward" graph nodes."
- Type 1. Status: sourced.

### Claim 2.4. Taking two locks in inverse order can deadlock; the locks form a circle.
- Link: [Documentation/locking/lockdep-design.rst (Linux v6.6), lines 148 to 150](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/Documentation/locking/lockdep-design.rst#L148-L150)
- Quote: "because this could lead to a deadlock - referred to as lock inversion deadlock - as attempts to acquire the two locks form a circle which could lead to the two contexts waiting for each other permanently."
- Type 1. Status: sourced. Source is documentation in the kernel tree (type 2 in content-standards' order).

### Claim 2.5. Before a new dependency is added, lockdep searches breadth first from next for prev.
- Link: [kernel/locking/lockdep.c (Linux v6.6), lines 3125 to 3128](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/kernel/locking/lockdep.c#L3125-L3128)
- Quote: "Prove that the new <prev> -> <next> dependency would not create a circular dependency in the graph. (We do this by a breadth-first search into the graph starting at <next>, and check whether we can reach <prev>.)"
- Type 1. Status: sourced.

### Claim 2.6. Breadth-first search explores all neighbours before the neighbours' neighbours; a wave is the same distance from the source.
- Link: [doc/graph_theory_review.html (Boost 1.85.0), lines 328 to 333](https://github.com/boostorg/graph/blob/a649be53bd90ab3365c6c0c44414c80907cfd8a1/doc/graph_theory_review.html#L328-L333)
- Quote: "the order of the traversal is such that the algorithm will explore all of the neighbors of a vertex before proceeding on to the neighbors of its neighbors."
- Quote: "Vertices in the same "wave" are the same distance from the source vertex."
- Type 2. Status: sourced. The page writes "wave" in doubled quotation marks; the quote shows plain ones.

### Claim 2.7. Depth-first search goes deeper and backtracks.
- Link: [doc/graph_theory_review.html (Boost 1.85.0), lines 380 to 386](https://github.com/boostorg/graph/blob/a649be53bd90ab3365c6c0c44414c80907cfd8a1/doc/graph_theory_review.html#L380-L386)
- Quote: "When choosing which edge to explore next, this algorithm always chooses to go "deeper" into the graph."
- Quote: "The algorithm will then backtrack to the previous vertex and continue along any as-yet unexplored edges from that vertex."
- Type 2. Status: sourced. The page writes "deeper" in doubled quotation marks; the quote shows plain ones.

### Claim 2.8. lockdep uses breadth-first search to find the shortest (circular) path.
- Link: [kernel/locking/lockdep.c (Linux v6.6), lines 1449 to 1451](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/kernel/locking/lockdep.c#L1449-L1451)
- Quote: "Breadth-first search instead of depth-first search is used in order to find the shortest (circular) path."
- Type 1. Status: sourced.

### Claim 2.9. The search remembers where each node was reached from (->parent), and that chain prints the dependency path.
- Link: [kernel/locking/lockdep.c (Linux v6.6), lines 1517 to 1521](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/kernel/locking/lockdep.c#L1517-L1521)
- Quote: "lock->parent = parent;"
- Link: [kernel/locking/lockdep.c (Linux v6.6), lines 2372 to 2374](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/kernel/locking/lockdep.c#L2372-L2374)
- Quote: "After BFS we get a lock dependency path (linked via ->parent of lock_list), printing out each lock in the dependency path will help on understanding how the deadlock could happen."
- Type 1. Status: sourced. `lock->parent = parent;` is line 1520, inside the function `visit_lock_entry` (lines 1517 to 1521).

### Claim 2.10. Breadth-first search is O(V + E) over a list.
- Link: [doc/adjacency_matrix.html (Boost 1.85.0), lines 47 to 50](https://github.com/boostorg/graph/blob/a649be53bd90ab3365c6c0c44414c80907cfd8a1/doc/adjacency_matrix.html#L47-L50)
- Quote: "The second is that operations that traverse all the out-edges of each vertex (such as breadth-first search) run in O(V2) time instead of O(V + E) time for the adjacency list."
- Type 2. Status: sourced. The O(V + E) for a depth-first search is the Chapter's own reading of the loops, said so in the text.

### Claim 2.11. lockdep's queue is bounded; the search can fail with BFS_EQUEUEFULL; only the first entry of a list is queued.
- Link: [kernel/locking/lockdep.c (Linux v6.6), lines 3130 to 3132](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/kernel/locking/lockdep.c#L3130-L3132)
- Quote: "The search is limited by the size of the circular queue (i.e., MAX_CIRCULAR_QUEUE_SIZE) which keeps track of a breadth of nodes in the graph whose neighbours are to be checked."
- Link: [kernel/locking/lockdep.c (Linux v6.6), line 1566](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/kernel/locking/lockdep.c#L1566)
- Quote: "BFS_EQUEUEFULL: The queue is full while doing the bfs."
- Link: [kernel/locking/lockdep.c (Linux v6.6), lines 1803 to 1806](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/kernel/locking/lockdep.c#L1803-L1806)
- Quote: "Note we only enqueue the first of the list into the queue, because we can always find a sibling dependency from one (see __bfs_next()), as a result the space of queue is saved."
- Type 1. Status: sourced.


---

## Chapter 3: Python graphlib: tasks that are ready (`graphs-graphlib`)

### Claim 3.1. A topological order puts u before v for every edge u -> v; the vertices may be tasks.
- Link: [graphlib, Python 3.13 documentation](https://docs.python.org/3.13/library/graphlib.html)
- Quote: "A topological order is a linear ordering of the vertices in a graph such that for every directed edge u -> v from vertex u to vertex v, vertex u comes before vertex v in the ordering."
- Quote: "the vertices of the graph may represent tasks to be performed, and the edges may represent constraints that one task must be performed before another"
- Type 2. Status: sourced. Docs page, fetched as HTML and read as text; there are no line numbers.

### Claim 3.2. graphlib keeps a predecessor counter and a successor list per node.
- Link: [Lib/graphlib.py (CPython 3.13.0), lines 16 to 22](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/graphlib.py#L16-L22)
- Quote: "Number of predecessors, generally >= 0. When this value falls to 0, and is returned by get_ready(), this is set to _NODE_OUT and when the node is marked done by a call to done(), set to _NODE_DONE."
- Quote: "List of successor nodes. The list can contain duplicated elements as long as they're all reflected in the successor's npredecessors attribute."
- Type 1. Status: sourced.

### Claim 3.3. When a node is done, each successor's counter drops by one and at zero the successor is ready.
- Link: [Lib/graphlib.py (CPython 3.13.0), lines 191 to 195](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/graphlib.py#L191-L195)
- Type 1. Status: sourced. Code block in the Chapter, lines 191 to 195 verbatim: `for successor in nodeinfo.successors:` ... `self._ready_nodes.append(successor)`.

### Claim 3.4. get_ready returns all ready nodes as a batch until no more progress can be made.
- Link: [Lib/graphlib.py (CPython 3.13.0), lines 111 to 114](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/graphlib.py#L111-L114)
- Quote: "Initially it returns all nodes with no predecessors; once those are marked as processed by calling "done", further calls will return all new nodes that have all their predecessors already processed. Once no more progress can be made, empty tuples are returned."
- Type 1. Status: sourced.

### Claim 3.5. The class is designed to support parallel processing of the nodes as they become ready.
- Link: [graphlib, Python 3.13 documentation](https://docs.python.org/3.13/library/graphlib.html)
- Quote: "The class is designed to easily support parallel processing of the nodes as they become ready."
- Type 2. Status: sourced.

### Claim 3.6. static_order is a loop over prepare, get_ready and done.
- Link: [Lib/graphlib.py (CPython 3.13.0), lines 244 to 248](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/graphlib.py#L244-L248)
- Type 1. Status: sourced. Code block in the Chapter, lines 244 to 248 verbatim.

### Claim 3.7. The order returned may depend on insertion order.
- Link: [Lib/graphlib.py (CPython 3.13.0), lines 238 to 239](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/graphlib.py#L238-L239)
- Quote: "The particular order that is returned may depend on the specific order in which the items were inserted in the graph."
- Type 1. Status: sourced.

### Claim 3.8. On a cycle graphlib raises CycleError but get_ready still yields what it can; the reported cycle repeats its first node; with several cycles one undefined choice is reported.
- Link: [Lib/graphlib.py (CPython 3.13.0), lines 89 to 91](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/graphlib.py#L89-L91)
- Quote: "If any cycle is detected, "CycleError" will be raised, but "get_ready" can still be used to obtain as many nodes as possible until cycles block more progress."
- Link: [Lib/graphlib.py (CPython 3.13.0), lines 34 to 35](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/graphlib.py#L34-L35)
- Quote: "In the reported list, the first and the last node will be the same, to make it clear that it is cyclic."
- Link: [Lib/graphlib.py (CPython 3.13.0), line 30](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/graphlib.py#L30)
- Quote: "If multiple cycles exist, only one undefined choice among them will be reported"
- Type 1. Status: sourced.

### Claim 3.9. tsort uses Knuth's Algorithm T; on a loop it prints the loop and removes a relation to break it.
- Link: [src/tsort.c (coreutils v9.5), line 83](https://github.com/coreutils/coreutils/blob/cc8689a07c8cfece66707936e3b914174912bd36/src/tsort.c#L83)
- Quote: "Write totally ordered list consistent with the partial ordering in FILE."
- Link: [src/tsort.c (coreutils v9.5), lines 19 to 21](https://github.com/coreutils/coreutils/blob/cc8689a07c8cfece66707936e3b914174912bd36/src/tsort.c#L19-L21)
- Quote: "The topological sort is done according to Algorithm T (Topological sort) in Donald E. Knuth, The Art of Computer Programming, Volume 1/Fundamental Algorithms, page 262."
- Link: [src/tsort.c (coreutils v9.5), lines 302 to 304](https://github.com/coreutils/coreutils/blob/cc8689a07c8cfece66707936e3b914174912bd36/src/tsort.c#L302-L304)
- Quote: "If we have detected that K is part of a loop, print the loop on standard error, remove a relation to break the loop, and return true."
- Link: [src/tsort.c (coreutils v9.5), line 513](https://github.com/coreutils/coreutils/blob/cc8689a07c8cfece66707936e3b914174912bd36/src/tsort.c#L513)
- Quote: "input contains a loop:"
- Type 1. Status: sourced.

### Claim 3.10. go list -deps visits dependencies in depth-first post-order so a package is listed after its dependencies.
- Link: [src/cmd/go/alldocs.go (Go 1.22.0), lines 938 to 940](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/cmd/go/alldocs.go#L938-L940)
- Quote: "The -deps flag causes list to iterate over not just the named packages but also all their dependencies. It visits them in a depth-first post-order traversal, so that a package is listed only after all its dependencies."
- Type 2. Status: sourced. Generated documentation of the go command, read in its source file at the tag's commit.


---

## Chapter 4: Linux cpusets: merging overlapping sets (`graphs-cpuset`)

### Claim 4.1. Union-find handles merging and querying of disjoint sets; find checks whether two elements are in one set.
- Link: [Documentation/core-api/union_find.rst (Linux v6.12), lines 14 to 22](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/Documentation/core-api/union_find.rst#L14-L22)
- Quote: "Union-find is a data structure used to handle the merging and querying of disjoint sets."
- Quote: "This operation is used to check if two elements are in the same set."
- Type 2. Status: sourced.

### Claim 4.2. A uf_node is a parent pointer and a rank.
- Link: [include/linux/union_find.h (Linux v6.12), lines 14 to 17](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/include/linux/union_find.h#L14-L17)
- Type 1. Status: sourced. Code block in the Chapter, lines 14 to 17 verbatim.

### Claim 4.3. Nodes with the same root are in the same set.
- Link: [Documentation/core-api/union_find.rst (Linux v6.12), line 85](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/Documentation/core-api/union_find.rst#L85)
- Quote: "If they have the same root, they are in the same set."
- Type 2. Status: sourced.

### Claim 4.4. uf_find returns the root and compresses the path.
- Link: [lib/union_find.c (Linux v6.12), lines 5 to 9](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/lib/union_find.c#L5-L9)
- Quote: "uf_find - Find the root of a node and perform path compression"
- Quote: "This function returns the root of the node by following the parent pointers. It also performs path compression, making the tree shallower."
- Link: [lib/union_find.c (Linux v6.12), lines 17 to 22](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/lib/union_find.c#L17-L22)
- Type 1. Status: sourced. Code block in the Chapter, lines 17 to 22 verbatim. That each step points the node at its grandparent is the Chapter's reading of `node->parent = parent->parent;`.

### Claim 4.5. uf_union merges by rank and returns early when the roots are equal.
- Link: [lib/union_find.c (Linux v6.12), line 26](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/lib/union_find.c#L26)
- Quote: "uf_union - Merge two sets, using union by rank"
- Link: [lib/union_find.c (Linux v6.12), lines 38 to 48](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/lib/union_find.c#L38-L48)
- Type 1. Status: sourced. Code block in the Chapter, lines 38 to 48 verbatim.

### Claim 4.6. Rank represents the height; the smaller-rank tree goes under the larger.
- Link: [Documentation/core-api/union_find.rst (Linux v6.12), lines 63 to 65](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/Documentation/core-api/union_find.rst#L63-L65)
- Quote: "The rank field represents the height of the current tree. During a union operation, the tree with the smaller rank is attached under the tree with the larger rank to maintain balance."
- Type 2. Status: sourced. That rank is an upper bound once find shortens paths is the Chapter's reading, said so in the text.

### Claim 4.7. Each operation costs O(alpha(n)) on average, roughly constant in practice; space is O(n).
- Link: [Documentation/core-api/union_find.rst (Linux v6.12), lines 38 to 41](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/Documentation/core-api/union_find.rst#L38-L41)
- Quote: "These optimizations reduce the average time complexity of each find and union operation to O(α(n)), where α(n) is the inverse Ackermann function. This can be roughly considered a constant time complexity for practical purposes."
- Link: [Documentation/core-api/union_find.rst (Linux v6.12), line 34](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/Documentation/core-api/union_find.rst#L34)
- Quote: "Space Complexity: O(n), where n is the number of nodes."
- Type 2. Status: sourced. The document says average; the Chapter labels it amortised and explains why in one sentence.

### Claim 4.8. generate_sched_domains builds a partial partition; overlapping cpusets are merged with uf_union and the roots are counted.
- Link: [kernel/cgroup/cpuset.c (Linux v6.12), lines 671 to 673](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/kernel/cgroup/cpuset.c#L671-L673)
- Quote: "This function builds a partial partition of the systems CPUs"
- Quote: "A 'partial partition' is a set of non-overlapping subsets whose union is a subset of that set."
- Link: [kernel/cgroup/cpuset.c (Linux v6.12), line 626](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/kernel/cgroup/cpuset.c#L626)
- Quote: "Do cpusets a, b have overlapping effective cpus_allowed masks?"
- Link: [kernel/cgroup/cpuset.c (Linux v6.12), lines 823 to 841](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/kernel/cgroup/cpuset.c#L823-L841)
- Type 1. Status: sourced. Code block in the Chapter, lines 823 to 841 with the comment and the `WARN_ON_ONCE(cgrpv2);` lines elided as `...` (the Chapter says so).

### Claim 4.9. OpenCV labels connected components with 4- or 8-way connectivity; its union-find compresses paths and keeps the smaller root.
- Link: [modules/imgproc/include/opencv2/imgproc.hpp (OpenCV 4.9.0), lines 3920 to 3923](https://github.com/opencv/opencv/blob/dad8af6b17f8e60d7b95a1203a1b4d22f56574cf/modules/imgproc/include/opencv2/imgproc.hpp#L3920-L3923)
- Quote: "computes the connected components labeled image of boolean image"
- Quote: "image with 4 or 8 way connectivity - returns N, the total number of labels [0, N-1] where 0 represents the background label."
- Link: [modules/imgproc/include/opencv2/imgproc.hpp (OpenCV 4.9.0), line 3934](https://github.com/opencv/opencv/blob/dad8af6b17f8e60d7b95a1203a1b4d22f56574cf/modules/imgproc/include/opencv2/imgproc.hpp#L3934)
- Quote: "connectivity 8 or 4 for 8-way or 4-way connectivity respectively"
- Link: [modules/imgproc/src/connectedcomponents.cpp (OpenCV 4.9.0), line 221](https://github.com/opencv/opencv/blob/dad8af6b17f8e60d7b95a1203a1b4d22f56574cf/modules/imgproc/src/connectedcomponents.cpp#L221)
- Quote: "Find the root of the tree of the node i and compress the path in the process"
- Link: [modules/imgproc/src/connectedcomponents.cpp (OpenCV 4.9.0), lines 237 to 239](https://github.com/opencv/opencv/blob/dad8af6b17f8e60d7b95a1203a1b4d22f56574cf/modules/imgproc/src/connectedcomponents.cpp#L237-L239)
- Quote: "if (root > rootj){"
- Type 1. Status: sourced. The quotes of C1 to C3 also appear in the docs of the other `connectedComponents` overloads; the Chapter cites the first, lines 3920 to 3934. Code block in the Chapter, lines 237 to 239 verbatim (the indentation is the source's).


---

## Chapter 5: OSPF: every router runs Dijkstra (`graphs-ospf`)

### Claim 5.1. RFC 2328 specifies OSPF.
- Link: [RFC 2328, section 1](https://www.rfc-editor.org/rfc/rfc2328.html#section-1)
- Quote: "This document is a specification of the Open Shortest Path First (OSPF) TCP/IP internet routing protocol."
- Type 3. Status: sourced. Section 1. The RFC is immutable once published.

### Claim 5.2. Every router builds a tree of shortest paths with itself as root.
- Link: [RFC 2328, section 1](https://www.rfc-editor.org/rfc/rfc2328.html#section-1)
- Quote: "All routers run the exact same algorithm, in parallel. From the link-state database, each router constructs a tree of shortest paths with itself as root."
- Type 3. Status: sourced. Section 1.

### Claim 5.3. The link-state database is a directed graph; a path's cost is the sum of its links' costs.
- Link: [RFC 2328, section 16.1 (and 16.8)](https://www.rfc-editor.org/rfc/rfc2328.html#section-16)
- Quote: "The area's link state database is represented as a directed graph."
- Quote: "The link state cost of a path is calculated as the sum of the costs of the path's constituent links (as advertised in router-LSAs and network-LSAs)."
- Quote: "One path is said to be "shorter" than another if it has a smaller link state cost."
- Type 3. Status: sourced. Section 16.1. The HTML anchors the RFC offers go down to the section number only (`#section-16`); the text sits in subsection 16.1.

### Claim 5.4. The cheapest candidate is guaranteed shortest, joins the tree, and the algorithm ends when the candidate list is empty.
- Link: [RFC 2328, section 16.1 (and 16.8)](https://www.rfc-editor.org/rfc/rfc2328.html#section-16)
- Quote: "the paths to the candidate vertex that is closest to the root are guaranteed to be shortest; this vertex is added to the shortest-path tree, removed from the candidate list, and its adjacent vertices are examined for possible addition to/modification of the candidate list."
- Quote: "It terminates when the candidate list becomes empty."
- Type 3. Status: sourced. Section 16.1; the sentences run over a page break in the RFC.

### Claim 5.5. FRRouting's main loop follows the RFC's steps and pops the next candidate from vertex_pqueue.
- Link: [ospfd/ospf_spf.c (FRRouting frr-10.0), lines 1750 to 1757](https://github.com/FRRouting/frr/blob/03a143cd49ed1b190cb38f48a31ef4d71fa01a02/ospfd/ospf_spf.c#L1750-L1757)
- Quote: "RFC2328 16.1. (2)."
- Quote: "RFC2328 16.1. (3)."
- Quote: "No more vertices left."
- Type 1. Status: sourced.

### Claim 5.6. The queue is called a heap in the comments but declared as a skip list.
- Link: [ospfd/ospf_spf.c (FRRouting frr-10.0), line 1729](https://github.com/FRRouting/frr/blob/03a143cd49ed1b190cb38f48a31ef4d71fa01a02/ospfd/ospf_spf.c#L1729)
- Quote: "Create a new heap for the candidates."
- Link: [ospfd/ospf_spf.c (FRRouting frr-10.0), lines 63 to 64](https://github.com/FRRouting/frr/blob/03a143cd49ed1b190cb38f48a31ef4d71fa01a02/ospfd/ospf_spf.c#L63-L64)
- Quote: "Heap related functions, for the managment of the candidates, to be used with pqueue."
- Link: [ospfd/ospf_spf.c (FRRouting frr-10.0), line 81](https://github.com/FRRouting/frr/blob/03a143cd49ed1b190cb38f48a31ef4d71fa01a02/ospfd/ospf_spf.c#L81)
- Quote: "DECLARE_SKIPLIST_NONUNIQ(vertex_pqueue, struct vertex, pqi, vertex_cmp);"
- Link: [lib/typesafe.h (FRRouting frr-10.0), line 970](https://github.com/FRRouting/frr/blob/03a143cd49ed1b190cb38f48a31ef4d71fa01a02/lib/typesafe.h#L970)
- Quote: "skiplist, sorted."
- Type 1. Status: sourced. The source spells "managment" so; the quote keeps it.

### Claim 5.7. A cheaper route to a waiting candidate deletes and re-adds it.
- Link: [ospfd/ospf_spf.c (FRRouting frr-10.0), lines 1304 to 1306](https://github.com/FRRouting/frr/blob/03a143cd49ed1b190cb38f48a31ef4d71fa01a02/ospfd/ospf_spf.c#L1304-L1306)
- Quote: "Update the list of candidates with any vertices not already on the list. If a lower-cost path is found to a vertex already on the candidate list, store the new cost."
- Link: [ospfd/ospf_spf.c (FRRouting frr-10.0), lines 1496 to 1519](https://github.com/FRRouting/frr/blob/03a143cd49ed1b190cb38f48a31ef4d71fa01a02/ospfd/ospf_spf.c#L1496-L1519)
- Type 1. Status: sourced. Code block in the Chapter, lines 1496 to 1519 with the comments cut to their first line and the call arguments elided as `...` (the Chapter says so); the full comments are at lines 1500 to 1503 and 1508 to 1514.

### Claim 5.8. Equal-cost paths are found and kept: a code comment, RFC section 2, RFC section 16.
- Link: [ospfd/ospf_spf.c (FRRouting frr-10.0), line 1501](https://github.com/FRRouting/frr/blob/03a143cd49ed1b190cb38f48a31ef4d71fa01a02/ospfd/ospf_spf.c#L1501)
- Quote: "Found an equal-cost path to W."
- Link: [RFC 2328, section 2.4](https://www.rfc-editor.org/rfc/rfc2328.html#section-2)
- Quote: "if multiple equal-cost routes to a destination exist, they are all discovered and used."
- Link: [RFC 2328, section 16.8](https://www.rfc-editor.org/rfc/rfc2328.html#section-16)
- Quote: "The OSPF protocol maintains multiple equal-cost routes to all destinations."
- Link: [RFC 2328, section 16.1 (and 16.8)](https://www.rfc-editor.org/rfc/rfc2328.html#section-16)
- Quote: "There can be multiple shortest paths due to the equal-cost multipath capability."
- Type 3. Status: sourced. Sections 2.4, 16.8 and 16.1 of the RFC. The Chapter's text says OSPF "maintains" multiple equal-cost routes (16.8), the RFC adds that an implementation may keep only a fixed number; the Chapter does not claim more.
