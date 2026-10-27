import sys

INT32 = 1 << 32

def naive_mid(low, high):
    """Java's (low + high) / 2 in 32-bit signed arithmetic: the sum wraps, the division truncates toward zero."""
    total = (low + high + (INT32 >> 1)) % INT32 - (INT32 >> 1)
    return total // 2 if total >= 0 else -((-total) // 2)

def mid(low, high):
    """The exact average, rounded down. Python has no overflow, so a plain sum is safe here."""
    return (low + high) >> 1

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
