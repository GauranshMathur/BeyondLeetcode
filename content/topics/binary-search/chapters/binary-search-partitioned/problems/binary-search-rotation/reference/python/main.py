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

def lower(key):
    """First index whose item is >= key (len(items) if none). The answer lies in [low, high]."""
    low, high = 0, len(items)
    while low < high:
        m = (low + high) >> 1
        if items[m] < key:
            low = m + 1
        else:
            high = m
    return low

def upper(key):
    """First index whose item is > key (len(items) if none)."""
    low, high = 0, len(items)
    while low < high:
        m = (low + high) >> 1
        if items[m] <= key:
            low = m + 1
        else:
            high = m
    return low

def bisect(commits, first_bad):
    """Commits 1..commits; commit `commits` is known bad. Returns (first bad commit, tests run)."""
    low, high, tests = 1, commits, 0  # the first bad commit lies in [low, high]
    while low < high:
        m = (low + high) >> 1
        tests += 1
        if m >= first_bad:  # the test of commit m says "bad"
            high = m
        else:
            low = m + 1
    return low, tests

def hours_needed(rate):
    return sum((pile + rate - 1) // rate for pile in items)

def slowest_rate(hours):
    """Smallest rate in [1, max(items)] with hours_needed(rate) <= hours."""
    low, high = 1, max(items)
    while low < high:
        m = (low + high) >> 1
        if hours_needed(m) <= hours:
            high = m
        else:
            low = m + 1
    return low

def rotation():
    """Index of the smallest item of a rotated, strictly ascending array; -1 if it is empty."""
    if not items:
        return -1
    low, high = 1, len(items)  # first index in [low, high] whose item is below items[0]
    while low < high:
        m = (low + high) >> 1
        if items[m] >= items[0]:
            low = m + 1
        else:
            high = m
    return 0 if low == len(items) else low

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
    elif command == "lower":
        print(lower(int(parts[1])))
    elif command == "upper":
        print(upper(int(parts[1])))
    elif command == "count":
        print(upper(int(parts[1])) - lower(int(parts[1])))
    elif command == "bisect":
        found, tests = bisect(int(parts[1]), int(parts[2]))
        print(found, tests)
    elif command == "rate":
        print(slowest_rate(int(parts[1])))
    elif command == "rotation":
        print(rotation())
