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

def tree(args):
    global root
    root = build(args)


commands["tree"] = tree

for line in sys.stdin.read().splitlines():
    parts = line.split()
    if parts and parts[0] in commands:
        commands[parts[0]](parts[1:])
