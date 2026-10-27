import sys

frames = []  # the sizes in bytes of the live frames, oldest first
used = 0  # bytes in use: the sum of the sizes in frames
segment = 2048  # bytes the stack owns
moved = 0  # bytes copied each time the stack moves to a new segment
max_stack = 1000000000  # the largest segment allowed


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
