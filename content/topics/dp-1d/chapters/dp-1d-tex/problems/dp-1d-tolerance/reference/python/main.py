import sys

MOD = 1_000_000_007
values = []  # the sequence the commands work on
commands = {}


def load(args):
    global values
    values = [int(x) for x in args]


def show(args):
    print(" ".join(str(x) for x in values))


commands["load"] = load
commands["show"] = show


def ways(args):
    n = int(args[0])
    table = [0] * (n + 1)  # table[m]: ways to climb m steps, modulo MOD
    table[0] = 1
    for m in range(1, n + 1):
        total = 0
        for step in values:
            if step <= m:
                total += table[m - step]
        table[m] = total % MOD
    print(table[n])


commands["ways"] = ways


def lay_out(width, tolerance):
    """Cheapest cost of laying the words out in lines of `width`, or None if no layout is allowed."""
    n = len(values)
    best = [None] * (n + 1)  # best[j]: cheapest cost of laying out the first j words
    best[0] = 0
    for j in range(1, n + 1):
        used = -1  # the line holds words i-1 .. j-1, with a space between neighbours
        for i in range(j, 0, -1):
            used += values[i - 1] + 1
            if used > width:
                break
            slack = width - used
            if j < n and slack > tolerance:
                continue  # too loose, and not the last line
            if best[i - 1] is None:
                continue
            cost = best[i - 1] + (0 if j == n else slack**3)
            if best[j] is None or cost < best[j]:
                best[j] = cost
    return best[n]


def wrap(args):
    best = lay_out(int(args[0]), int(args[0]))
    print(-1 if best is None else best)


def tolerant(args):
    best = lay_out(int(args[0]), int(args[1]))
    print(-1 if best is None else best)


commands["wrap"] = wrap
commands["tolerant"] = tolerant


for line in sys.stdin.read().splitlines():
    parts = line.split()
    if parts and parts[0] in commands:
        commands[parts[0]](parts[1:])
