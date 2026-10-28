# Python graphlib: tasks that are ready

A build has tasks, and some tasks must finish before others start. Draw an arrow from each task to the ones that wait for it and you have a directed graph, and the question is in what order to run the tasks. This Chapter reads how Python 3.13 answers it in the standard library's `graphlib` module, and what two other tools do differently.

## An order the arrows allow

The documentation defines the answer: "A topological order is a linear ordering of the vertices in a graph such that for every directed edge u -> v from vertex u to vertex v, vertex u comes before vertex v in the ordering." It gives the picture too: "the vertices of the graph may represent tasks to be performed, and the edges may represent constraints that one task must be performed before another" ([graphlib, Python 3.13 documentation](https://docs.python.org/3.13/library/graphlib.html)). In the Problems an edge from A to B means that A comes before B.

## Count what each task still waits for

`graphlib` does not search the graph for an order. It keeps a number on every node: "Number of predecessors, generally >= 0. When this value falls to 0, and is returned by get_ready(), this is set to _NODE_OUT and when the node is marked done by a call to done(), set to _NODE_DONE." Every node also has its successors: "List of successor nodes. The list can contain duplicated elements as long as they're all reflected in the successor's npredecessors attribute." ([Lib/graphlib.py, lines 16 to 22 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/graphlib.py#L16-L22)) A task is ready when its count is 0. When a task is done, each task that waits for it has one fewer to wait for:

```python
for successor in nodeinfo.successors:
    successor_info = n2i[successor]
    successor_info.npredecessors -= 1
    if successor_info.npredecessors == 0:
        self._ready_nodes.append(successor)
```

([Lib/graphlib.py, lines 191 to 195](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/graphlib.py#L191-L195)) Over the whole sort each edge is counted down once, so the work is O(V + E) in the **worst case**. This is the idea behind the Problem `order`.

## Ready nodes come out in batches

The module does not hand out one task at a time. Its `get_ready` method: "Initially it returns all nodes with no predecessors; once those are marked as processed by calling "done", further calls will return all new nodes that have all their predecessors already processed. Once no more progress can be made, empty tuples are returned." ([lines 111 to 114](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/graphlib.py#L111-L114)) The documentation says why: "The class is designed to easily support parallel processing of the nodes as they become ready." ([same documentation page](https://docs.python.org/3.13/library/graphlib.html)) A batch is a set of tasks that are ready together. The function that returns a plain order is only a loop over batches:

```python
self.prepare()
while self.is_active():
    node_group = self.get_ready()
    yield from node_group
    self.done(*node_group)
```

([lines 244 to 248](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/graphlib.py#L244-L248)) Its documentation admits the order is not unique: "The particular order that is returned may depend on the specific order in which the items were inserted in the graph." ([lines 238 to 239](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/graphlib.py#L238-L239)) The Problem `waves` prints the batches, and the Problem `order` fixes the choice: of the tasks that are ready, the one with the smallest name goes first, so there is one right answer. That rule is the Problem's, not graphlib's. A min-heap ([Heaps](/chapters/heaps-heapq)) gives the smallest ready name in O(log V), so the whole sort is O(E + V log V) in the **worst case**.

## What if the arrows loop

No order exists when tasks wait for each other. The module still hands out what it can: "If any cycle is detected, "CycleError" will be raised, but "get_ready" can still be used to obtain as many nodes as possible until cycles block more progress." ([lines 89 to 91](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/graphlib.py#L89-L91)) And it names the loop: "In the reported list, the first and the last node will be the same, to make it clear that it is cyclic." ([lines 34 to 35](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/graphlib.py#L34-L35)) With several loops it makes no promise about which one: "If multiple cycles exist, only one undefined choice among them will be reported" ([line 30](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/graphlib.py#L30)). The Problem `waves` follows the first behaviour: it prints the batches that can be run and then `cycle`. The Problem `order`, which needs every node, prints only `cycle`.

## Another tool, another choice

GNU `tsort` reads pairs of names and prints an order. Its header says which algorithm: "The topological sort is done according to Algorithm T (Topological sort) in Donald E. Knuth, The Art of Computer Programming, Volume 1/Fundamental Algorithms, page 262." ([src/tsort.c, lines 19 to 21 (coreutils v9.5)](https://github.com/coreutils/coreutils/blob/cc8689a07c8cfece66707936e3b914174912bd36/src/tsort.c#L19-L21)) When the pairs loop it does not give up. The comment on its loop finder says what it does: "If we have detected that K is part of a loop, print the loop on standard error, remove a relation to break the loop, and return true." ([lines 302 to 304](https://github.com/coreutils/coreutils/blob/cc8689a07c8cfece66707936e3b914174912bd36/src/tsort.c#L302-L304)) It reports "input contains a loop:" ([line 513](https://github.com/coreutils/coreutils/blob/cc8689a07c8cfece66707936e3b914174912bd36/src/tsort.c#L513)) and then prints the loop. The Extra Problem `loop` prints one loop, with a rule of its own for which one.

## A third way to an order

The Go tool lists a package's dependencies in an order that is also a topological order: "The -deps flag causes list to iterate over not just the named packages but also all their dependencies. It visits them in a depth-first post-order traversal, so that a package is listed only after all its dependencies." ([cmd/go/alldocs.go, lines 938 to 940 (Go 1.22.0)](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/cmd/go/alldocs.go#L938-L940)) That is the depth-first search from the last Chapter, writing each node down after everything it leads to, where `graphlib` counts.
