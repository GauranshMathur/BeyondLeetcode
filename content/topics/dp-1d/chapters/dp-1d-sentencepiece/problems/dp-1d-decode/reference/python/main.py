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


def wrap(args):
    width = int(args[0])
    n = len(values)
    best = [None] * (n + 1)  # best[j]: cheapest cost of laying out the first j words, None if impossible
    best[0] = 0
    for j in range(1, n + 1):
        used = -1  # the line holds words i-1 .. j-1, with a space between neighbours
        for i in range(j, 0, -1):
            used += values[i - 1] + 1
            if used > width:
                break
            if best[i - 1] is None:
                continue
            cost = best[i - 1] + (0 if j == n else (width - used) ** 3)
            if best[j] is None or cost < best[j]:
                best[j] = cost
    print(-1 if best[n] is None else best[n])


commands["wrap"] = wrap


def pick(args):
    before = best = 0  # best total over the items up to two back, and up to one back
    for v in values:
        before, best = best, max(best, before + v)
    print(best)


commands["pick"] = pick


def spread(args):
    k = int(args[0])
    ring = [0] * k  # ring[j % k]: best total over the first j items, for the last k values of j
    best = 0
    for i, v in enumerate(values, start=1):
        best = max(best, ring[i % k] + v)  # ring[i % k] still holds the total k items back
        ring[i % k] = best
    print(best)


commands["spread"] = spread


def fewest(args):
    amount = int(args[0])
    table = [None] * (amount + 1)  # table[m]: fewest items that sum to m, None if none do
    table[0] = 0
    for m in range(1, amount + 1):
        for item in values:
            if item <= m and table[m - item] is not None:
                if table[m] is None or table[m - item] + 1 < table[m]:
                    table[m] = table[m - item] + 1
    print(-1 if table[amount] is None else table[amount])


commands["fewest"] = fewest


def decode(args):
    before, best = 0, 1  # splits of the first i-1 digits and of the first i digits, for i = 0
    for i, d in enumerate(values):
        total = best if d != 0 else 0  # d alone as a token
        if i > 0 and 10 <= values[i - 1] * 10 + d <= 26:
            total += before  # the last two digits as one token
        before, best = best, total % MOD
    print(best)


commands["decode"] = decode


for line in sys.stdin.read().splitlines():
    parts = line.split()
    if parts and parts[0] in commands:
        commands[parts[0]](parts[1:])
