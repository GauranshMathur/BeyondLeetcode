import sys

block = []  # a fixed-size block of slots; its size is the capacity
length = 0  # how many slots are in use
policy = "double"
copies = 0


def next_cap():
    """The capacity of the block that replaces a full one."""
    cap = len(block)
    if policy == "exact":
        return cap + 1
    return 1 if cap == 0 else cap * 2


def move_to(cap):
    """Replaces the block with one of `cap` slots, copying the items across."""
    global block, copies
    new_block = [0] * cap
    for i in range(length):
        new_block[i] = block[i]
    copies += length
    block = new_block


def append(value):
    global length
    if length == len(block):
        move_to(next_cap())
    block[length] = value
    length += 1


for line in sys.stdin.read().splitlines():
    parts = line.split()
    if not parts:
        continue
    command = parts[0]
    if command == "append":
        append(int(parts[1]))
    elif command == "get":
        i = int(parts[1])
        print(block[i] if 0 <= i < length else "error")
    elif command == "len":
        print(length)
    elif command == "policy":
        policy = parts[1]
    elif command == "cap":
        print(len(block))
    elif command == "copies":
        print(copies)
    elif command == "fill":
        for _ in range(int(parts[1])):
            append(int(parts[2]))
