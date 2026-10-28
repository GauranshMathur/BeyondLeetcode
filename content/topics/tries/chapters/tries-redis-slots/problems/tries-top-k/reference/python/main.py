import sys


class Node:
    """One node of the trie. The edge that leads to it is stored in its parent."""

    def __init__(self):
        self.kids = {}  # next character -> child Node
        self.value = None  # the stored value, or None when no key ends here
        self.is_map = False  # set once the node has held more than 8 children


root = Node()
# The route table: a trie over the 32 bits of an address, one bit per level.
route_root = {"kids": [None, None], "text": None}
# The router: a trie over path segments. A wildcard child has the key "{}".
router_root = {"kids": {}, "value": None, "names": []}


def add(key, value):
    node = root
    for ch in key:
        if ch not in node.kids:
            node.kids[ch] = Node()
            if len(node.kids) > 8:
                node.is_map = True
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


def compressed_nodes():
    """Nodes left when each chain of single-child, non-key nodes shares one node."""
    absorbed = 0
    for _, node in walk():
        if len(node.kids) == 1:
            child = next(iter(node.kids.values()))
            if len(child.kids) == 1 and child.value is None:
                absorbed += 1
    return sum(1 for _ in walk()) - absorbed


def parse_cidr(text):
    address, length = text.split("/")
    a, b, c, d = (int(x) for x in address.split("."))
    return (a << 24) | (b << 16) | (c << 8) | d, int(length)


def route(text, value):
    address, length = parse_cidr(text)
    if length < 32 and address & ((1 << (32 - length)) - 1):
        print("error")
        return
    node = route_root
    for i in range(length):
        bit = (address >> (31 - i)) & 1
        if node["kids"][bit] is None:
            node["kids"][bit] = {"kids": [None, None], "text": None}
        node = node["kids"][bit]
    node["text"] = f"{text} {value}"


def match(text):
    address = parse_cidr(text + "/32")[0]
    node = route_root
    best = node["text"]
    for i in range(32):
        node = node["kids"][(address >> (31 - i)) & 1]
        if node is None:
            break
        if node["text"] is not None:
            best = node["text"]
    print(best if best is not None else "none")


def shape():
    slices = maps = 0
    for _, node in walk():
        if node.is_map:
            maps += 1
        elif node.kids:
            slices += 1
    print(slices, maps)


def segments(path):
    return [] if path == "/" else path[1:].split("/")


def handle(pattern, value):
    node = router_root
    names = []
    for seg in segments(pattern):
        if seg.startswith("{"):
            names.append(seg[1:-1])
            seg = "{}"
        node = node["kids"].setdefault(seg, {"kids": {}, "value": None, "names": []})
    if node["value"] is not None:
        print("conflict")
        return
    node["value"] = value
    node["names"] = names


def search(node, segs, i, seen):
    """The first match, trying a literal before a wildcard at every segment."""
    if i == len(segs):
        return (node, seen) if node["value"] is not None else None
    literal = node["kids"].get(segs[i])
    if literal is not None:
        found = search(literal, segs, i + 1, seen)
        if found:
            return found
    wild = node["kids"].get("{}")
    if wild is not None:
        return search(wild, segs, i + 1, seen + [segs[i]])
    return None


def serve(path):
    found = search(router_root, segments(path), 0, [])
    if found is None:
        print("404")
        return
    node, seen = found
    pairs = [f"{name}={seg}" for name, seg in zip(node["names"], seen)]
    print(" ".join([node["value"]] + pairs))


def keys_under(prefix):
    node = find(prefix)
    if node is None:
        return []
    return [(prefix + k, n.value) for k, n in walk(node) if n.value is not None]


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
    elif command == "rnodes":
        print(compressed_nodes())
    elif command == "route":
        route(parts[1], parts[2])
    elif command == "match":
        match(parts[1])
    elif command == "shape":
        shape()
    elif command == "handle":
        handle(parts[1], parts[2])
    elif command == "serve":
        serve(parts[1])
    elif command == "list":
        found = keys_under(parts[1] if len(parts) > 1 else "")
        print(" ".join(k for k, _ in found) if found else "none")
    elif command == "count":
        print(len(keys_under(parts[1] if len(parts) > 1 else "")))
    elif command == "top":
        found = keys_under(parts[1])
        found.sort(key=lambda kv: (-kv[1], kv[0]))
        k = int(parts[2])
        print(" ".join(key for key, _ in found[:k]) if found and k > 0 else "none")
