import sys

EMPTY = -1
DUMMY = -2
MASK32 = 0xFFFFFFFF

impl = "cpython"
resize_on = False
moved = 0

# CPython-style table: `slots` holds EMPTY, DUMMY or an index into `entries`.
slots = [EMPTY] * 8
entries = []  # [key, value] pairs in insertion order; None once deleted
used = 0

# Java-style table: one list of [key, value] nodes per bin.
bins = [[] for _ in range(16)]
is_tree = [False] * 16


def parse_key(token):
    return int(token)


def java_hash(key):
    return key & MASK32


def spread(h):
    return h ^ (h >> 16)


def bin_index(key):
    return (len(bins) - 1) & spread(java_hash(key))


def make_table(n):
    global slots, entries, used, bins, is_tree, moved
    moved = 0
    if impl == "cpython":
        slots = [EMPTY] * n
        entries = []
        used = 0
    else:
        bins = [[] for _ in range(n)]
        is_tree = [False] * n


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


def cp_resize():
    global slots, entries, moved
    m = used * 3
    size = 1 << (((m | 8) - 1) | 7).bit_length()
    live = [e for e in entries if e is not None]
    slots = [EMPTY] * size
    entries = live
    for ix, (key, _) in enumerate(live):
        j = key & (size - 1)
        perturb = key
        while slots[j] != EMPTY:
            j, perturb = next_slot(j, perturb)
        slots[j] = ix
    moved += len(live)


def cp_put(key, value):
    global used
    i, ix, _ = cp_find(key)
    if ix >= 0:
        entries[ix][1] = value
        return i
    if resize_on and len(entries) >= len(slots) * 2 // 3:
        cp_resize()
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


# ---- Java-style chaining ----

def jb_resize():
    global bins, is_tree, moved
    old_cap = len(bins)
    new_bins = [[] for _ in range(old_cap * 2)]
    new_tree = [False] * (old_cap * 2)
    for j, chain in enumerate(bins):
        lo = [n for n in chain if spread(java_hash(n[0])) & old_cap == 0]
        hi = [n for n in chain if spread(java_hash(n[0])) & old_cap != 0]
        for index, part in ((j, lo), (j + old_cap, hi)):
            new_bins[index] = part
            new_tree[index] = is_tree[j] and len(part) > 6
        moved += len(chain)
    bins = new_bins
    is_tree = new_tree


def jb_put(key, value):
    index = bin_index(key)
    chain = bins[index]
    for node in chain:
        if node[0] == key:
            node[1] = value
            return index
    chain.append([key, value])
    if not is_tree[index] and len(chain) >= 9:
        if len(bins) < 64:
            jb_resize()
        else:
            is_tree[index] = True
    if resize_on and sum(len(c) for c in bins) > len(bins) * 3 // 4:
        jb_resize()
    return bin_index(key)


def jb_find(key):
    chain = bins[bin_index(key)]
    for visited, node in enumerate(chain, 1):
        if node[0] == key:
            return node, visited
    return None, len(chain)






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
        else:
            out.append(str(jb_put(key, int(parts[2]))))
    elif cmd == "get":
        key = parse_key(parts[1])
        if impl == "cpython":
            _, ix, _ = cp_find(key)
            out.append(str(entries[ix][1]) if ix >= 0 else "error")
        else:
            node, _ = jb_find(key)
            out.append(str(node[1]) if node else "error")
    elif cmd == "probes":
        key = parse_key(parts[1])
        if impl == "cpython":
            out.append(str(cp_find(key)[2]))
        else:
            out.append(str(jb_find(key)[1]))
    elif cmd == "len":
        if impl == "cpython":
            out.append(str(used))
        else:
            out.append(str(sum(len(c) for c in bins)))
    elif cmd == "cap":
        if impl == "cpython":
            out.append(str(len(slots)))
        else:
            out.append(str(len(bins)))
    elif cmd == "dump":
        if impl == "cpython":
            cells = []
            for ix in slots:
                cells.append("." if ix == EMPTY else "x" if ix == DUMMY else str(entries[ix][0]))
            out.append(" ".join(cells))
        else:
            for index, chain in enumerate(bins):
                if not chain:
                    continue
                if is_tree[index]:
                    out.append(f"{index}: tree {len(chain)}")
                    continue
                out.append(f"{index}: " + " ".join(str(n[0]) for n in chain))
    elif cmd == "del":
        out.append("ok" if cp_del(parse_key(parts[1])) else "error")
    elif cmd == "indices":
        out.append(" ".join("." if ix == EMPTY else "x" if ix == DUMMY else str(ix) for ix in slots))
    elif cmd == "keys":
        out.append(" ".join(str(e[0]) for e in entries if e is not None))
    elif cmd == "nentries":
        out.append(str(len(entries)))
    elif cmd == "impl":
        impl = parts[1]
        make_table(8 if impl == "cpython" else 16)
    elif cmd == "bin":
        out.append(str(bin_index(parse_key(parts[1]))))
    elif cmd == "longest":
        out.append(str(max(len(c) for c in bins)))
    elif cmd == "trees":
        out.append(str(sum(is_tree)))
    elif cmd == "resize":
        resize_on = parts[1] == "on"
    elif cmd == "moved":
        out.append(str(moved))
if out:
    print("\n".join(out))
