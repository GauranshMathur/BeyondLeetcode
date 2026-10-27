import sys

values = []  # the sequence the commands work on
commands = {}


def load(args):
    global values
    values = [int(x) for x in args]


def show(args):
    print(" ".join(str(x) for x in values))


commands["load"] = load
commands["show"] = show


def blocks(args):
    k = int(args[0])
    if not values:
        print(0)
        return
    best = None
    for start in range(0, len(values), k):
        total = sum(values[start : start + k])
        if best is None or total > best:
            best = total
    print(best)


commands["blocks"] = blocks


for line in sys.stdin.read().splitlines():
    parts = line.split()
    if parts and parts[0] in commands:
        commands[parts[0]](parts[1:])
