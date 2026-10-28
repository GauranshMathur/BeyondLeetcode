import sys

MASK = 0xFFFFFFFF
words = []  # the sequence the commands work on: unsigned 32-bit words
commands = {}

def signed(w):
    return w - (1 << 32) if w >= (1 << 31) else w


def load(args):
    global words
    words = [int(x) & MASK for x in args]


def show(args):
    print(" ".join(str(signed(w)) for w in words))


def ushow(args):
    print(" ".join(str(w) for w in words))


def signext(args):
    shift = 32 - int(args[0])
    # Move the field's top bit to bit 31, then shift back with the sign copied down.
    print(" ".join(str(signed((w << shift) & MASK) >> shift) for w in words))


commands["load"] = load
commands["show"] = show
commands["ushow"] = ushow
commands["signext"] = signext

def wrapsum(args):
    total = 0
    for w in words:
        a, b = total, w
        while b:
            # XOR adds without carries; AND, moved one place up, is the carries.
            a, b = a ^ b, ((a & b) << 1) & MASK
        total = a
    print(signed(total))


commands["wrapsum"] = wrapsum

def set_bit(args):
    i = int(args[0])
    while len(words) <= i >> 5:
        words.append(0)
    words[i >> 5] |= 1 << (i & 31)


def clear_bit(args):
    i = int(args[0])
    if (i >> 5) < len(words):
        words[i >> 5] &= ~(1 << (i & 31)) & MASK


def flip_bit(args):
    i = int(args[0])
    while len(words) <= i >> 5:
        words.append(0)
    words[i >> 5] ^= 1 << (i & 31)


def test_bit(args):
    i = int(args[0])
    print((words[i >> 5] >> (i & 31)) & 1 if (i >> 5) < len(words) else 0)


commands["set"] = set_bit
commands["clear"] = clear_bit
commands["flip"] = flip_bit
commands["test"] = test_bit

def weight32(w):
    w = w - ((w >> 1) & 0x55555555)
    w = (w & 0x33333333) + ((w >> 2) & 0x33333333)
    w = (w + (w >> 4)) & 0x0F0F0F0F
    return ((w * 0x01010101) & MASK) >> 24


def count(args):
    n = int(args[0])
    full, rest = n >> 5, n & 31
    total = sum(weight32(words[i]) for i in range(min(full, len(words))))
    if rest and full < len(words):
        total += weight32(words[full] & ((1 << rest) - 1))
    print(total)


commands["count"] = count

def recover(args):
    parity = 0
    for w in words:
        parity ^= w
    print(parity)


commands["recover"] = recover

def missing(args):
    answer = len(words)
    for i, w in enumerate(words):
        answer ^= i ^ w
    print(answer)


commands["missing"] = missing

def lowbit(args):
    print(" ".join(str(w & -w) for w in words))


def pow2(args):
    print(" ".join("yes" if w != 0 and w & (w - 1) == 0 else "no" for w in words))


commands["lowbit"] = lowbit
commands["pow2"] = pow2

def countbits(args):
    n = int(args[0])
    counts = [0] * (n + 1)
    for i in range(1, n + 1):
        counts[i] = counts[i & (i - 1)] + 1  # clear the lowest set bit, add one
    print(" ".join(str(c) for c in counts))


commands["countbits"] = countbits

def probes(bits_per_key):
    return min(30, max(1, int(bits_per_key * 0.69)))


def filter_size(n, bits_per_key):
    bits = max(64, n * bits_per_key)
    return (bits + 7) // 8 * 8


def bloomsize(args):
    n, bits_per_key = int(args[0]), int(args[1])
    print(filter_size(n, bits_per_key), probes(bits_per_key))


commands["bloomsize"] = bloomsize

filter_bits = 0  # size of the Bloom filter built last, 0 if none
filter_k = 0  # its number of probes


def key_hash(x):
    h = ((x & MASK) * 0x9E3779B1 + 0x7F4A7C15) & MASK
    return h ^ (h >> 16)


def probe_positions(x, bits, k):
    h = key_hash(x)
    delta = ((h >> 17) | (h << 15)) & MASK  # rotate right 17 bits
    for _ in range(k):
        yield h % bits
        h = (h + delta) & MASK


def bloom(args):
    global words, filter_bits, filter_k
    keys = [int(x) for x in args[1:]]
    filter_bits = filter_size(len(keys), int(args[0]))
    filter_k = probes(int(args[0]))
    words = [0] * ((filter_bits + 31) // 32)
    for x in keys:
        for pos in probe_positions(x, filter_bits, filter_k):
            words[pos >> 5] |= 1 << (pos & 31)


def maybe(args):
    if filter_bits == 0:
        print("no")
        return
    for pos in probe_positions(int(args[0]), filter_bits, filter_k):
        if (pos >> 5) >= len(words) or not (words[pos >> 5] >> (pos & 31)) & 1:
            print("no")
            return
    print("yes")


commands["bloom"] = bloom
commands["maybe"] = maybe
for line in sys.stdin.read().splitlines():
    parts = line.split()
    if parts and parts[0] in commands:
        commands[parts[0]](parts[1:])
