import sys

root = None  # the tree the commands work on
commands = {}

class Node:
    def __init__(self, value):
        self.value = value
        self.left = None
        self.right = None


def build(tokens):
    """Reads a tree from tokens in level order. `-` is an absent child."""
    if not tokens or tokens[0] == "-":
        return None
    top = Node(int(tokens[0]))
    queue = [top]
    pos = 1
    head = 0
    while head < len(queue):
        node = queue[head]
        head += 1
        if pos < len(tokens):
            token = tokens[pos]
            pos += 1
            if token != "-":
                node.left = Node(int(token))
                queue.append(node.left)
        if pos < len(tokens):
            token = tokens[pos]
            pos += 1
            if token != "-":
                node.right = Node(int(token))
                queue.append(node.right)
    return top


def height_of(node):
    if node is None:
        return 0
    return 1 + max(height_of(node.left), height_of(node.right))


def show(args):
    tokens = []
    queue = [root]
    head = 0
    while head < len(queue):
        node = queue[head]
        head += 1
        if node is None:
            tokens.append("-")
        else:
            tokens.append(str(node.value))
            queue.append(node.left)
            queue.append(node.right)
    while tokens and tokens[-1] == "-":
        tokens.pop()
    print(" ".join(tokens))


def height(args):
    print(height_of(root))


commands["show"] = show
commands["height"] = height

max_height = None  # the tallest tree `tree` may load; None means no limit


def accept(new):
    """Makes `new` the tree, unless it is taller than the limit."""
    global root
    if max_height is not None and height_of(new) > max_height:
        print("too deep")
        return
    root = new


def tree(args):
    accept(build(args))


def limit(args):
    global max_height
    max_height = None if args[0] == "off" else int(args[0])


commands["tree"] = tree
commands["limit"] = limit

def insert_value(value):
    global root
    if root is None:
        root = Node(value)
        return
    node = root
    while True:
        if value < node.value:
            if node.left is None:
                node.left = Node(value)
                return
            node = node.left
        elif value > node.value:
            if node.right is None:
                node.right = Node(value)
                return
            node = node.right
        else:
            return  # already there


def insert(args):
    for token in args:
        insert_value(int(token))


def find(args):
    value = int(args[0])
    node = root
    visited = 0
    while node is not None:
        visited += 1
        if value < node.value:
            node = node.left
        elif value > node.value:
            node = node.right
        else:
            print("found", visited)
            return
    print("missing", visited)


commands["insert"] = insert
commands["find"] = find

def is_search_tree(node, low, high):
    """Whether every value below node is above `low` and below `high` (None: no bound)."""
    if node is None:
        return True
    if low is not None and node.value <= low:
        return False
    if high is not None and node.value >= high:
        return False
    return is_search_tree(node.left, low, node.value) and is_search_tree(
        node.right, node.value, high
    )


def validate(args):
    print("valid" if is_search_tree(root, None, None) else "invalid")


commands["validate"] = validate

MAX_KEYS = 3  # a B-tree node holds at most this many keys
btree = None


class BNode:
    def __init__(self, keys, children):
        self.keys = keys
        self.children = children  # empty for a leaf, else one more than keys


def bt_insert(node, key):
    """Adds key below node. If node splits, returns (key to move up, new right node)."""
    i = 0
    while i < len(node.keys) and node.keys[i] < key:
        i += 1
    if i < len(node.keys) and node.keys[i] == key:
        return None
    if node.children:
        split = bt_insert(node.children[i], key)
        if split is None:
            return None
        node.keys.insert(i, split[0])
        node.children.insert(i + 1, split[1])
    else:
        node.keys.insert(i, key)
    if len(node.keys) <= MAX_KEYS:
        return None
    # Four keys: the second moves up, the first stays, the last two go to a new node.
    up = node.keys[1]
    right = BNode(node.keys[2:], node.children[2:])
    node.keys = node.keys[:1]
    node.children = node.children[:2]
    return up, right


def bt_add(key):
    global btree
    if btree is None:
        btree = BNode([key], [])
        return
    split = bt_insert(btree, key)
    if split is not None:
        btree = BNode([split[0]], [btree, split[1]])


def bt_show():
    level = [btree] if btree is not None else []
    while level:
        print(" ".join("[" + " ".join(str(k) for k in n.keys) + "]" for n in level))
        level = [child for n in level for child in n.children]


def bt_find(key):
    node = btree
    read = 0
    while node is not None:
        read += 1
        i = 0
        while i < len(node.keys) and node.keys[i] < key:
            i += 1
        if i < len(node.keys) and node.keys[i] == key:
            print("found", read)
            return
        node = node.children[i] if node.children else None
    print("missing", read)


def bt(args):
    if args[0] == "add":
        for token in args[1:]:
            bt_add(int(token))
    elif args[0] == "show":
        bt_show()
    elif args[0] == "find":
        bt_find(int(args[1]))


commands["bt"] = bt

def walk(args):
    order = args[0]
    values = []

    def visit(node):
        if node is None:
            return
        if order == "pre":
            values.append(node.value)
        visit(node.left)
        if order == "in":
            values.append(node.value)
        visit(node.right)
        if order == "post":
            values.append(node.value)

    visit(root)
    print(" ".join(str(v) for v in values))


commands["walk"] = walk

def levels_of(top):
    """The nodes of each level, from the root down."""
    result = []
    level = [top] if top is not None else []
    while level:
        result.append(level)
        level = [child for n in level for child in (n.left, n.right) if child is not None]
    return result


def levels(args):
    for level in levels_of(root):
        print(" ".join(str(n.value) for n in level))


commands["levels"] = levels

def path_to(node, value):
    """The nodes from node down to the one holding value, or None if it is not below node."""
    if node is None:
        return None
    if node.value == value:
        return [node]
    for child in (node.left, node.right):
        below = path_to(child, value)
        if below is not None:
            return [node] + below
    return None


def lca(args):
    first = path_to(root, int(args[0]))
    second = path_to(root, int(args[1]))
    if first is None or second is None:
        print("none")
        return
    common = None
    for a, b in zip(first, second):
        if a is not b:
            break
        common = a
    print(common.value)


commands["lca"] = lca

def encode(node):
    if node is None:
        return "."
    return "(" + str(node.value) + " " + encode(node.left) + " " + encode(node.right) + ")"


def save(args):
    print(encode(root))


def decode(text, pos):
    """Reads one subtree starting at text[pos]. Returns it and the position after it."""
    if text[pos] == ".":
        return None, pos + 1
    end = text.index(" ", pos)
    node = Node(int(text[pos + 1 : end]))
    node.left, pos = decode(text, end + 1)
    node.right, pos = decode(text, pos + 1)
    return node, pos + 1  # skip the ")"


def restore(args):
    new, _ = decode(" ".join(args), 0)
    accept(new)


commands["save"] = save
commands["restore"] = restore

for line in sys.stdin.read().splitlines():
    parts = line.split()
    if parts and parts[0] in commands:
        commands[parts[0]](parts[1:])
