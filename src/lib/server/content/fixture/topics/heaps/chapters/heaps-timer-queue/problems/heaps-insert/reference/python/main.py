import sys

items = []
for line in sys.stdin.read().splitlines():
    parts = line.split()
    if not parts:
        continue
    if parts[0] == "insert":
        items.append(int(parts[1]))
    elif parts[0] == "min":
        print(min(items))
