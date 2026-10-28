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


def cache(args):
    n = int(args[0])
    # Replay the calls of a memoised ways(n). The first call with each value misses, the rest hit.
    reached = [False] * (n + 1)  # reached[m]: ways(m) is called at least once
    reached[n] = True
    calls = 1  # the call ways(n) itself
    misses = 0
    for m in range(n, -1, -1):
        if not reached[m]:
            continue
        misses += 1  # its first call computes it
        if m > 0:
            for step in values:
                if step <= m:
                    calls += 1  # computing ways(m) calls ways(m - step)
                    reached[m - step] = True
    print(calls - misses, misses)


commands["cache"] = cache


for line in sys.stdin.read().splitlines():
    parts = line.split()
    if parts and parts[0] in commands:
        commands[parts[0]](parts[1:])
