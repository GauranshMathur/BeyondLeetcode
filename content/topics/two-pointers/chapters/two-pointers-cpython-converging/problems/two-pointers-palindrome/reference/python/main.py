import sys

values = []  # the sequence the commands work on
commands = {}


def load(args):
    global values
    values = [int(x) for x in args]


def show(args):
    print(" ".join(str(x) for x in values))


def reverse(args):
    # Two pointers start at the ends and swap, moving toward each other.
    lo, hi = 0, len(values) - 1
    while lo < hi:
        values[lo], values[hi] = values[hi], values[lo]
        lo += 1
        hi -= 1


commands["load"] = load
commands["show"] = show
commands["reverse"] = reverse



def trim(args):
    global values
    lo, hi = 0, len(values)
    while lo < hi and values[lo] == 0:
        lo += 1
    while hi > lo and values[hi - 1] == 0:
        hi -= 1
    print(len(values) - (hi - lo))
    values = values[lo:hi]


commands["trim"] = trim



def palindrome(args):
    lo, hi = 0, len(values) - 1
    while lo < hi:
        if values[lo] == 0:
            lo += 1
        elif values[hi] == 0:
            hi -= 1
        elif values[lo] != values[hi]:
            print("no")
            return
        else:
            lo += 1
            hi -= 1
    print("yes")


commands["palindrome"] = palindrome

for line in sys.stdin.read().splitlines():
    parts = line.split()
    if parts and parts[0] in commands:
        commands[parts[0]](parts[1:])
