# Linux lockdep: the shortest way round a cycle

A search asks one question about a graph: starting here, what can I reach? There are two orders to ask it in, and this Chapter reads a real program that had to pick one: the Linux kernel's lock validator, lockdep, in v6.6 ([kernel/locking/lockdep.c, lines 12 to 16](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/kernel/locking/lockdep.c#L12-L16)). In the Problems you build both searches. If you have walked a tree ([Walking a tree: Go goes deep, bfs goes wide](/chapters/trees-traversal)), the new part is that a graph node can be reached by more than one route, so a search must remember where it has been.

## Locks as a graph

Two tasks can freeze each other if one holds lock A and waits for B while the other holds B and waits for A. The kernel's validator, **lockdep**, looks for this in advance. Its source file says that it "will warn about the following classes of locking bugs:" and the list starts with "circular lock dependencies". ([kernel/locking/lockdep.c, lines 12 to 16](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/kernel/locking/lockdep.c#L12-L16)) The dependencies are the edges of a graph. A comment in the code defines one: "a path from the next lock to be acquired to a previous held lock indicates that adding the <prev> -> <next> lock dependency will produce a circle in the graph." ([lines 1446 to 1449](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/kernel/locking/lockdep.c#L1446-L1449)) So a lock is a node, and an edge from `prev` to `next` records taking `next` while holding `prev`. The header that defines a lock class says how the graph is stored: "These fields represent a directed graph of lock dependencies, to every node we attach a list of "forward" and a list of "backward" graph nodes." ([include/linux/lockdep_types.h, lines 111 to 113](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/lockdep_types.h#L111-L113)) That is an adjacency list for each node, in both directions. The design document says why a circle is a bug: "because this could lead to a deadlock - referred to as lock inversion deadlock - as attempts to acquire the two locks form a circle which could lead to the two contexts waiting for each other permanently." ([Documentation/locking/lockdep-design.rst, lines 148 to 150](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/Documentation/locking/lockdep-design.rst#L148-L150))

## One question for every new edge

Before lockdep records an edge it asks whether the edge would close a circle. The comment in `check_prev_add` gives the method: "Prove that the new <prev> -> <next> dependency would not create a circular dependency in the graph. (We do this by a breadth-first search into the graph starting at <next>, and check whether we can reach <prev>.)" ([lockdep.c, lines 3125 to 3128](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/kernel/locking/lockdep.c#L3125-L3128)) The new edge closes a circle exactly when `next` already leads back to `prev`. That is the Extra Problem `would`.

## Two orders: waves and depth

Boost's graph guide describes breadth-first search so: "the order of the traversal is such that the algorithm will explore all of the neighbors of a vertex before proceeding on to the neighbors of its neighbors." and "Vertices in the same "wave" are the same distance from the source vertex." ([Boost 1.85.0, Graph Theory Review, lines 328 to 333](https://github.com/boostorg/graph/blob/a649be53bd90ab3365c6c0c44414c80907cfd8a1/doc/graph_theory_review.html#L328-L333)) Depth-first search goes the other way: "When choosing which edge to explore next, this algorithm always chooses to go "deeper" into the graph." and "The algorithm will then backtrack to the previous vertex and continue along any as-yet unexplored edges from that vertex." ([lines 380 to 386](https://github.com/boostorg/graph/blob/a649be53bd90ab3365c6c0c44414c80907cfd8a1/doc/graph_theory_review.html#L380-L386)) (The page writes "wave" and "deeper" in doubled quotation marks.) A breadth-first search keeps the nodes it has found but not yet explored in a **queue**, first in and first out. A depth-first search keeps them in a **stack**, last in and first out, which is what a recursive call does for you.

## Why lockdep chose breadth-first

The comment above lockdep's queue states the choice: "Breadth-first search instead of depth-first search is used in order to find the shortest (circular) path." ([lockdep.c, lines 1449 to 1451](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/kernel/locking/lockdep.c#L1449-L1451)) The shortest circle is the one a person can read. Take the edges a to b, b to c, c to d and a to d, and search from a, taking each node's first edge first. Depth-first reaches d through a, b, c, d: three edges. Breadth-first explores a's neighbours b and d before it goes deeper, so it reaches d as a, d: one edge. Because it finishes each wave before the next, the first time a breadth-first search reaches a node it has used the fewest edges (the argument from the "wave" sentence; the Problem `path` has you build it).

To print a path and not only yes or no, lockdep remembers where each node was reached from: `lock->parent = parent;` ([lockdep.c, lines 1517 to 1521](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/kernel/locking/lockdep.c#L1517-L1521)). The comment on the printing code says what for: "After BFS we get a lock dependency path (linked via ->parent of lock_list), printing out each lock in the dependency path will help on understanding how the deadlock could happen." ([lines 2372 to 2374](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/kernel/locking/lockdep.c#L2372-L2374)) Follow the parents back from the target and you have the path:

```python
from collections import deque

def shortest_path(graph, start, goal):
    came_from = {start: None}  # the node each node was first reached from
    queue = deque([start])
    while queue and goal not in came_from:
        node = queue.popleft()
        for neighbour in graph[node]:
            if neighbour not in came_from:
                came_from[neighbour] = node
                queue.append(neighbour)
    if goal not in came_from:
        return None
    route = []
    while goal is not None:
        route.append(goal)
        goal = came_from[goal]
    return route[::-1]
```

This is the Chapter's own code, not lockdep's. Each node enters the queue once and each out-edge is looked at once, so with adjacency lists it is O(V + E) in the **worst case**, where Boost's page puts a search over a matrix at O(V2) ([adjacency_matrix.html, lines 47 to 50](https://github.com/boostorg/graph/blob/a649be53bd90ab3365c6c0c44414c80907cfd8a1/doc/adjacency_matrix.html#L47-L50)). A depth-first search also touches each node and edge once: the same bound, read off the loops.

## Real queues are bounded

lockdep's queue has a fixed size, and the search can fail on it: "The search is limited by the size of the circular queue (i.e., MAX_CIRCULAR_QUEUE_SIZE) which keeps track of a breadth of nodes in the graph whose neighbours are to be checked." ([lockdep.c, lines 3130 to 3132](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/kernel/locking/lockdep.c#L3130-L3132)) One of the result codes is named for it: "BFS_EQUEUEFULL: The queue is full while doing the bfs." ([line 1566](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/kernel/locking/lockdep.c#L1566)) The code also spends the queue carefully: "Note we only enqueue the first of the list into the queue, because we can always find a sibling dependency from one (see __bfs_next()), as a result the space of queue is saved." ([lines 1803 to 1806](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/kernel/locking/lockdep.c#L1803-L1806)) So the queue holds one entry for each list it expands, and the rest of that list is reached from the first entry. The Build keeps it simple and queues every node.

## What the Problems build

`path A B` is the breadth-first search: the route with the fewest edges, printed node by node. `dfs A` is the depth-first search: the order it visits nodes in. Run both on the four edges above. `would A B` asks lockdep's question, whether adding the edge from A to B would close a circle, and prints the circle if it would.
