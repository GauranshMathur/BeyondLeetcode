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

def reverse_word(w):
    # Swap neighbouring bits, then pairs, then nibbles, then bytes, then halves.
    w = ((w >> 1) & 0x55555555) | ((w & 0x55555555) << 1)
    w = ((w >> 2) & 0x33333333) | ((w & 0x33333333) << 2)
    w = ((w >> 4) & 0x0F0F0F0F) | ((w & 0x0F0F0F0F) << 4)
    w = ((w >> 8) & 0x00FF00FF) | ((w & 0x00FF00FF) << 8)
    return ((w >> 16) | (w << 16)) & MASK


def reverse(args):
    print(" ".join(str(reverse_word(w)) for w in words))


commands["reverse"] = reverse
for line in sys.stdin.read().splitlines():
    parts = line.split()
    if parts and parts[0] in commands:
        commands[parts[0]](parts[1:])
