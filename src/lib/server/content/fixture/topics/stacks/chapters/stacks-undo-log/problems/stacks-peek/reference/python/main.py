import sys

items = []
for line in sys.stdin.read().splitlines():
    parts = line.split()
    if not parts:
        continue
    if parts[0] == "push":
        items.append(int(parts[1]))
    elif parts[0] == "size":
        print(len(items))
    elif parts[0] == "peek":
        print(items[-1])
