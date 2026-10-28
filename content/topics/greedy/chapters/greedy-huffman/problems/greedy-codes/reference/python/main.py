import heapq
import sys

values = []  # the sequence the commands work on
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
        # One symbol that occurs still costs one bit each time (the Problem's rule).
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


for line in sys.stdin.read().splitlines():
    parts = line.split()
    if parts and parts[0] in commands:
        commands[parts[0]](parts[1:])
