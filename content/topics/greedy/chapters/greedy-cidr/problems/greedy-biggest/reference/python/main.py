import sys

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


for line in sys.stdin.read().splitlines():
    parts = line.split()
    if parts and parts[0] in commands:
        commands[parts[0]](parts[1:])
