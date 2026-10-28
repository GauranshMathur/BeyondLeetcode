import sys


class Node:
    """One node of the trie. The edge that leads to it is stored in its parent."""

    def __init__(self):
        self.kids = {}  # next character -> child Node
        self.value = None  # the stored value, or None when no key ends here


root = Node()


def add(key, value):
    node = root
    for ch in key:
        if ch not in node.kids:
            node.kids[ch] = Node()
        node = node.kids[ch]
    node.value = value


def find(key):
    node = root
    for ch in key:
        node = node.kids.get(ch)
        if node is None:
            return None
    return node


def delete(key):
    path = [root]
    for ch in key:
        nxt = path[-1].kids.get(ch)
        if nxt is None:
            return 0
        path.append(nxt)
    if path[-1].value is None:
        return 0
    path[-1].value = None
    # Cut every node that no longer leads to a key.
    for i in range(len(key), 0, -1):
        node = path[i]
        if node.kids or node.value is not None:
            break
        del path[i - 1].kids[key[i - 1]]
    return 1


def walk(start=None):
    """Every (key, node) under `start` (the root by default) in key order, `start` included."""
    stack = [("", start or root)]
    while stack:
        key, node = stack.pop()
        yield key, node
        for ch in sorted(node.kids, reverse=True):
            stack.append((key + ch, node.kids[ch]))


for line in sys.stdin.read().splitlines():
    parts = line.split()
    if not parts:
        continue
    command = parts[0]
    if command == "add":
        add(parts[1], int(parts[2]))
    elif command == "get":
        node = find(parts[1])
        print(node.value if node is not None and node.value is not None else "none")
    elif command == "del":
        print(delete(parts[1]))
    elif command == "nodes":
        print(sum(1 for _ in walk()))
    elif command == "size":
        print(sum(1 for _, node in walk() if node.value is not None))
