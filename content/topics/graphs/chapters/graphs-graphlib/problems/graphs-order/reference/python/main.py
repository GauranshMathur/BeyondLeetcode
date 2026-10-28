import sys
from collections import deque
import heapq

names = []  # every node, in the order it first appeared
out = {}  # node -> the nodes it has an edge to, in the order the edges were added
commands = {}


def add_node(name):
    if name not in out:
        out[name] = []
        names.append(name)


def clear(args):
    names.clear()
    out.clear()


def edge(args):
    a, b = args[0], args[1]
    add_node(a)
    add_node(b)
    if b in out[a]:
        return  # a repeated edge changes nothing
    out[a].append(b)


def out_cmd(args):
    print(" ".join(out.get(args[0], [])))


def has(args):
    print("yes" if args[1] in out.get(args[0], []) else "no")


def count(args):
    print(len(names), sum(len(targets) for targets in out.values()))


commands["clear"] = clear
commands["edge"] = edge
commands["out"] = out_cmd
commands["has"] = has
commands["count"] = count


def matrix(args):
    for a in names:
        targets = set(out[a])
        print(" ".join("1" if b in targets else "0" for b in names))


def cells(args):
    v = len(names)
    e = sum(len(targets) for targets in out.values())
    print(v + e, v * v)


commands["matrix"] = matrix
commands["cells"] = cells


def shortest_path(start, goal):
    """The nodes of a path with the fewest edges from start to goal, or None."""
    if start not in out or goal not in out:
        return None
    came_from = {start: None}
    queue = deque([start])
    while queue and goal not in came_from:
        u = queue.popleft()
        for v in out[u]:
            if v not in came_from:
                came_from[v] = u
                queue.append(v)
    if goal not in came_from:
        return None
    route = []
    node = goal
    while node is not None:
        route.append(node)
        node = came_from[node]
    return route[::-1]


def path(args):
    route = shortest_path(args[0], args[1])
    print("none" if route is None else " ".join(route))


commands["path"] = path


def dfs(args):
    if args[0] not in out:
        print("")
        return
    seen = set()
    visited = []
    stack = [args[0]]
    while stack:
        u = stack.pop()
        if u in seen:
            continue
        seen.add(u)
        visited.append(u)
        for v in reversed(out[u]):  # reversed, so the first edge is explored first
            if v not in seen:
                stack.append(v)
    print(" ".join(visited))


commands["dfs"] = dfs


def in_degrees():
    degree = {n: 0 for n in names}
    for u in names:
        for v in out[u]:
            degree[v] += 1
    return degree


def order(args):
    degree = in_degrees()
    ready = [n for n in names if degree[n] == 0]
    heapq.heapify(ready)  # the smallest ready name comes out first
    built = []
    while ready:
        u = heapq.heappop(ready)
        built.append(u)
        for v in out[u]:
            degree[v] -= 1
            if degree[v] == 0:
                heapq.heappush(ready, v)
    print("cycle" if len(built) < len(names) else " ".join(built))


commands["order"] = order


for line in sys.stdin.read().splitlines():
    parts = line.split()
    if parts and parts[0] in commands:
        commands[parts[0]](parts[1:])
