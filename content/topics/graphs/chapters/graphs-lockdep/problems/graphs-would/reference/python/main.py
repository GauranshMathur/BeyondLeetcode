import sys
from collections import deque

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


def would(args):
    a, b = args[0], args[1]
    if a == b:
        print("cycle", a, a)
        return
    route = shortest_path(b, a)
    print("safe" if route is None else "cycle " + a + " " + " ".join(route))


commands["would"] = would


for line in sys.stdin.read().splitlines():
    parts = line.split()
    if parts and parts[0] in commands:
        commands[parts[0]](parts[1:])
