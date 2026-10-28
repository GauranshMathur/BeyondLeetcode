import sys

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


for line in sys.stdin.read().splitlines():
    parts = line.split()
    if parts and parts[0] in commands:
        commands[parts[0]](parts[1:])
