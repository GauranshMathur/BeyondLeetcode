import sys

INT32 = 1 << 32

def naive_mid(low, high):
    """Java's (low + high) / 2 in 32-bit signed arithmetic: the sum wraps, the division truncates toward zero."""
    total = (low + high + (INT32 >> 1)) % INT32 - (INT32 >> 1)
    return total // 2 if total >= 0 else -((-total) // 2)

def mid(low, high):
    """The exact average, rounded down. Python has no overflow, so a plain sum is safe here."""
    return (low + high) >> 1

items = []  # the sorted array that `array` loaded

def search(key):
    """Java's contract: the index of key, or -(insertion point) - 1 when it is absent."""
    low, high = 0, len(items) - 1  # key, if present, lies in items[low..high]
    while low <= high:
        m = (low + high) >> 1
        if items[m] < key:
            low = m + 1
        elif items[m] > key:
            high = m - 1
        else:
            return m
    return -(low + 1)

for line in sys.stdin.read().splitlines():
    parts = line.split()
    if not parts:
        continue
    command = parts[0]
    if False:
        pass
    elif command == "naive":
        print(naive_mid(int(parts[1]), int(parts[2])))
    elif command == "mid":
        print(mid(int(parts[1]), int(parts[2])))
    elif command == "array":
        items = [int(p) for p in parts[1:]]
    elif command == "search":
        print(search(int(parts[1])))
