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


def peak(args):
    k = int(args[0])
    n = len(values)
    if n == 0:
        print(0)
        return
    k = min(k, n)
    # Slide a window of k items: add the item that enters, subtract the one that leaves.
    window = sum(values[:k])
    best = window
    for i in range(k, n):
        window += values[i] - values[i - k]
        best = max(best, window)
    print(best)


commands["peak"] = peak


for line in sys.stdin.read().splitlines():
    parts = line.split()
    if parts and parts[0] in commands:
        commands[parts[0]](parts[1:])
