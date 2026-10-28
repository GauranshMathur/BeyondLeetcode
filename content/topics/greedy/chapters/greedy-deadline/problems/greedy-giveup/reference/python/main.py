import heapq
import sys

values = []  # the sequence the commands work on
jobs = []  # (run time, deadline) pairs
commands = {}


def cidr(args):
    first, last = int(args[0]), int(args[1])
    count = 0
    while first <= last:
        # The biggest block that starts at `first`: 2^k numbers, `first` a multiple of 2^k, ending by `last`.
        size = 1
        while first % (size * 2) == 0 and first + size * 2 - 1 <= last:
            size *= 2
        first += size
        count += 1
    print(count)


commands["cidr"] = cidr


def load(args):
    global values
    values = [int(x) for x in args]


def show(args):
    print(" ".join(str(x) for x in values))


commands["load"] = load
commands["show"] = show


def huffman(args):
    heap = [x for x in values if x > 0]
    if not heap:
        print(0)
        return
    if len(heap) == 1:
        # zlib forces a second code, so the one symbol still costs one bit each time.
        print(heap[0])
        return
    heapq.heapify(heap)
    total = 0
    while len(heap) > 1:
        merged = heapq.heappop(heap) + heapq.heappop(heap)
        total += merged  # every symbol below the new node gets one bit longer
        heapq.heappush(heap, merged)
    print(total)


commands["huffman"] = huffman


def load_jobs(args):
    global jobs
    numbers = [int(x) for x in args]
    jobs = list(zip(numbers[0::2], numbers[1::2]))


commands["jobs"] = load_jobs


def edf(args):
    clock = worst = 0
    # Earliest deadline first: run the jobs in order of deadline and track the largest tardiness.
    for run, deadline in sorted(jobs, key=lambda job: job[1]):
        clock += run
        worst = max(worst, clock - deadline)
    print(worst)


commands["edf"] = edf


def ontime(args):
    kept = []  # run times of the jobs kept so far, negated so the longest is on top
    clock = 0
    for run, deadline in sorted(jobs, key=lambda job: job[1]):
        heapq.heappush(kept, -run)
        clock += run
        if clock > deadline:
            clock += heapq.heappop(kept)  # give up the longest kept job
    print(len(kept))


commands["ontime"] = ontime


for line in sys.stdin.read().splitlines():
    parts = line.split()
    if parts and parts[0] in commands:
        commands[parts[0]](parts[1:])
