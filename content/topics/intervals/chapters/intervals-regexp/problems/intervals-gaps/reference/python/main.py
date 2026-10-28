import sys

commands = {}


ivs = []  # every interval added so far, as [lo, hi]


def fmt(ranges):
    return " ".join(f"{lo}-{hi}" for lo, hi in ranges) if ranges else "none"


def add(args):
    ivs.append([int(args[0]), int(args[1])])


def merge_all():
    # Sort by start, then fold each interval into the last range when it overlaps or abuts it.
    out = []
    for lo, hi in sorted(ivs):
        if out and lo <= out[-1][1] + 1:
            out[-1][1] = max(out[-1][1], hi)
        else:
            out.append([lo, hi])
    return out


def merged(args):
    print(fmt(merge_all()))


commands["add"] = add
commands["merged"] = merged


def gaps(args):
    lo, hi = int(args[0]), int(args[1])
    out = []
    nxt = lo  # the first integer not yet known to be covered or gapped
    for a, b in merge_all():
        if b < nxt:
            continue
        if a > hi:
            break
        if a > nxt:
            out.append([nxt, a - 1])
        nxt = b + 1
    if nxt <= hi:
        out.append([nxt, hi])
    print(fmt(out))


commands["gaps"] = gaps


for line in sys.stdin.read().splitlines():
    parts = line.split()
    if parts and parts[0] in commands:
        commands[parts[0]](parts[1:])
