import sys

frames = []  # the sizes in bytes of the live frames, oldest first
used = 0  # bytes in use: the sum of the sizes in frames
segment = 2048  # bytes the stack owns
moved = 0  # bytes copied each time the stack moves to a new segment
max_stack = 1000000000  # the largest segment allowed
data = [0] * 10  # the slots behind the value stack
count = 0  # how many slots hold an item
copies = 0  # items copied when the value stack grew
mins = []  # mins[i] is the smallest of the first i + 1 items


def call(n):
    global used
    if used + n > segment:
        new_size = segment * 2
        while new_size < used + n:
            new_size *= 2
        if new_size > max_stack:
            print("stack overflow")
            raise SystemExit
        move_to(new_size)
    frames.append(n)
    used += n


def move_to(size):
    global segment, moved
    moved += used
    segment = size


def collect():
    half = segment // 2
    if half >= 2048 and used < segment // 4:
        move_to(half)


def push(x):
    global data, count, copies
    if count == len(data):
        bigger = [0] * (len(data) * 2)
        for i in range(count):
            bigger[i] = data[i]
        copies += count
        data = bigger
    data[count] = x
    count += 1
    mins.append(min(x, mins[-1]) if mins else x)


def pop():
    global count
    if count == 0:
        return "error"
    count -= 1
    item = data[count]
    data[count] = 0
    mins.pop()
    return str(item)


for text in sys.stdin.read().splitlines():
    parts = text.split()
    if not parts:
        continue
    command, args = parts[0], parts[1:]
    if command == "call":
        call(int(args[0]))
    elif command == "ret":
        if not frames:
            print("error")
        else:
            size = frames.pop()
            used -= size
            print(size)
    elif command == "depth":
        print(len(frames))
    elif command == "used":
        print(used)
    elif command == "segment":
        print(segment)
    elif command == "moved":
        print(moved)
    elif command == "limit":
        max_stack = int(args[0])
    elif command == "gc":
        collect()
    elif command == "push":
        push(int(args[0]))
    elif command == "pop":
        print(pop())
    elif command == "peek":
        print(data[count - 1] if count > 0 else "error")
    elif command == "empty":
        print("true" if count == 0 else "false")
    elif command == "search":
        found = -1
        for i in range(count - 1, -1, -1):
            if data[i] == int(args[0]):
                found = count - i
                break
        print(found)
    elif command == "size":
        print(count)
    elif command == "capacity":
        print(len(data))
    elif command == "copies":
        print(copies)
    elif command == "min":
        print(mins[-1] if mins else "error")
