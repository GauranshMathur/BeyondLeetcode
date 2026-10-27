import sys

frames = []  # the sizes in bytes of the live frames, oldest first
used = 0  # bytes in use: the sum of the sizes in frames


def call(n):
    global used
    frames.append(n)
    used += n


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
