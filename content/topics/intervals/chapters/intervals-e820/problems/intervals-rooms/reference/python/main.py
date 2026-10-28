import heapq
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


ivs = []  # every interval added or placed, as [lo, hi], in the order they came
order = []  # the intervals sorted by lo; equal lo keep the order they came in
sub = []  # sub[m] is the largest hi in the part of `order` that m is the middle of
dirty = False  # whether `ivs` changed since `order` was built


def add(args):
    global dirty
    a, b = int(args[0]), int(args[1])
    ivs.append([a, b])
    dirty = True
    place_range(a, b)


def place(args):
    add(args)
    print(len(regions), covered)


commands["add"] = add
commands["place"] = place


def build(lo, hi):
    # The middle item of order[lo:hi] is the root of that part; return its index (-1 if empty).
    if lo >= hi:
        return -1
    mid = (lo + hi) // 2
    best = order[mid][1]
    for child in (build(lo, mid), build(mid + 1, hi)):
        if child >= 0:
            best = max(best, sub[child])
    sub[mid] = best
    return mid


def search(lo, hi, a, b, out):
    if lo >= hi:
        return
    mid = (lo + hi) // 2
    if sub[mid] < a:  # nothing in this part reaches a
        return
    search(lo, mid, a, b, out)
    if order[mid][0] <= b:  # otherwise this item and everything after it starts too late
        if order[mid][1] >= a:
            out.append(order[mid])
        search(mid + 1, hi, a, b, out)


def find(args):
    global order, sub, dirty
    a, b = int(args[0]), int(args[1])
    if dirty:
        order = sorted(ivs, key=lambda iv: iv[0])  # stable
        sub = [0] * len(order)
        build(0, len(order))
        dirty = False
    out = []
    search(0, len(order), a, b, out)
    print(fmt(out))


commands["find"] = find


def depth(args):
    # Each interval [lo, hi] opens at lo and closes at hi + 1; closes sort before opens at a tie.
    events = []
    for lo, hi in ivs:
        events.append((lo, 1))
        events.append((hi + 1, -1))
    events.sort()
    now = best = 0
    for _, step in events:
        now += step
        best = max(best, now)
    print(best)


commands["depth"] = depth


def rooms(args):
    order_by_lo = sorted(range(len(ivs)), key=lambda i: ivs[i][0])  # stable
    busy = []  # (hi, room) of the interval each taken room holds, soonest to end first
    free = []  # numbers of the rooms that are free, lowest first
    next_room = 1
    room_of = [0] * len(ivs)
    for i in order_by_lo:
        lo, hi = ivs[i]
        while busy and busy[0][0] < lo:
            heapq.heappush(free, heapq.heappop(busy)[1])
        if free:
            room = heapq.heappop(free)
        else:
            room = next_room
            next_room += 1
        room_of[i] = room
        heapq.heappush(busy, (hi, room))
    print(" ".join(map(str, room_of)) if room_of else "none")


commands["rooms"] = rooms


for line in sys.stdin.read().splitlines():
    parts = line.split()
    if parts and parts[0] in commands:
        commands[parts[0]](parts[1:])
