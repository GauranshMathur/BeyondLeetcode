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


def approx(args):
    k, limit = int(args[0]), int(args[1])
    over = 0
    prev = cur = 0  # total of the previous period, and of this one so far
    for i, v in enumerate(values):
        if i > 0 and i % k == 0:
            prev, cur = cur, 0
        cur += v
        elapsed = i % k + 1
        # estimate = prev * (k - elapsed) / k + cur, compared with limit after multiplying by k
        if prev * (k - elapsed) + cur * k > limit * k:
            over += 1
    print(over)


commands["approx"] = approx


for line in sys.stdin.read().splitlines():
    parts = line.split()
    if parts and parts[0] in commands:
        commands[parts[0]](parts[1:])
