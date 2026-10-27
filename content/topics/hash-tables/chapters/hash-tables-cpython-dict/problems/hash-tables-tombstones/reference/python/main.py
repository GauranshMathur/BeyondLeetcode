import sys

EMPTY = -1
DUMMY = -2
MASK32 = 0xFFFFFFFF

impl = "cpython"

# CPython-style table: `slots` holds EMPTY, DUMMY or an index into `entries`.
slots = [EMPTY] * 8
entries = []  # [key, value] pairs in insertion order; None once deleted
used = 0



def parse_key(token):
    return int(token)






def make_table(n):
    global slots, entries, used
    if impl == "cpython":
        slots = [EMPTY] * n
        entries = []
        used = 0


# ---- CPython-style open addressing ----


def next_slot(i, perturb):
    perturb >>= 5
    return (i * 5 + perturb + 1) & (len(slots) - 1), perturb


def cp_find(key):
    """Returns (slot, entry index or -1, slots examined)."""
    i = key & (len(slots) - 1)
    perturb = key
    examined = 1
    while True:
        ix = slots[i]
        if ix == EMPTY:
            return i, -1, examined
        if ix >= 0 and entries[ix][0] == key:
            return i, ix, examined
        i, perturb = next_slot(i, perturb)
        examined += 1




def cp_put(key, value):
    global used
    i, ix, _ = cp_find(key)
    if ix >= 0:
        entries[ix][1] = value
        return i
    j = key & (len(slots) - 1)
    perturb = key
    while slots[j] >= 0:
        j, perturb = next_slot(j, perturb)
    slots[j] = len(entries)
    entries.append([key, value])
    used += 1
    return j


def cp_del(key):
    global used
    i, ix, _ = cp_find(key)
    if ix < 0:
        return False
    slots[i] = DUMMY
    entries[ix] = None
    used -= 1
    return True






out = []
for line in sys.stdin.read().splitlines():
    parts = line.split()
    if not parts:
        continue
    cmd = parts[0]
    if cmd == "table":
        make_table(int(parts[1]))
    elif cmd == "put":
        key = parse_key(parts[1])
        if impl == "cpython":
            out.append(str(cp_put(key, int(parts[2]))))
    elif cmd == "get":
        key = parse_key(parts[1])
        if impl == "cpython":
            _, ix, _ = cp_find(key)
            out.append(str(entries[ix][1]) if ix >= 0 else "error")
    elif cmd == "probes":
        key = parse_key(parts[1])
        if impl == "cpython":
            out.append(str(cp_find(key)[2]))
    elif cmd == "len":
        if impl == "cpython":
            out.append(str(used))
    elif cmd == "cap":
        if impl == "cpython":
            out.append(str(len(slots)))
    elif cmd == "dump":
        if impl == "cpython":
            cells = []
            for ix in slots:
                cells.append("." if ix == EMPTY else "x" if ix == DUMMY else str(entries[ix][0]))
            out.append(" ".join(cells))
    elif cmd == "del":
        out.append("ok" if cp_del(parse_key(parts[1])) else "error")
if out:
    print("\n".join(out))
