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
for line in sys.stdin.read().splitlines():
    parts = line.split()
    if parts and parts[0] in commands:
        commands[parts[0]](parts[1:])
