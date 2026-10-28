import sys

commands = {}


regions = []  # merged ranges as [lo, hi], sorted, none overlapping or abutting
covered = 0  # how many integers the regions hold


def fmt(ranges):
    return " ".join(f"{lo}-{hi}" for lo, hi in ranges) if ranges else "none"


def first_reaching(x):
    # Binary search: the index of the first region whose hi is at least x.
    lo, hi = 0, len(regions)
    while lo < hi:
        mid = (lo + hi) // 2
        if regions[mid][1] >= x:
            hi = mid
        else:
            lo = mid + 1
    return lo


def place_range(a, b):
    global covered
    i = first_reaching(a - 1)  # the first region that overlaps or abuts [a, b] on the left
    j = i
    while j < len(regions) and regions[j][0] <= b + 1:
        a = min(a, regions[j][0])
        b = max(b, regions[j][1])
        covered -= regions[j][1] - regions[j][0] + 1
        j += 1
    regions[i:j] = [[a, b]]
    covered += b - a + 1


def merged(args):
    print(fmt(regions))


commands["merged"] = merged


def add(args):
    place_range(int(args[0]), int(args[1]))


def place(args):
    place_range(int(args[0]), int(args[1]))
    print(len(regions), covered)


commands["add"] = add
commands["place"] = place


for line in sys.stdin.read().splitlines():
    parts = line.split()
    if parts and parts[0] in commands:
        commands[parts[0]](parts[1:])
