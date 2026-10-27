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



def pairsum(args):
    target = int(args[0])
    lo, hi = 0, len(values) - 1
    while lo < hi:
        total = values[lo] + values[hi]
        if total == target:
            print(lo + 1, hi + 1)
            return
        if total < target:
            lo += 1
        else:
            hi -= 1
    print("none")


commands["pairsum"] = pairsum



def triples(args):
    count = 0
    n = len(values)
    for first in range(n - 2):
        if first > 0 and values[first] == values[first - 1]:
            continue
        lo, hi = first + 1, n - 1
        while lo < hi:
            total = values[first] + values[lo] + values[hi]
            if total < 0:
                lo += 1
            elif total > 0:
                hi -= 1
            else:
                count += 1
                lo += 1
                hi -= 1
                while lo < hi and values[lo] == values[lo - 1]:
                    lo += 1
    print(count)


commands["triples"] = triples

for line in sys.stdin.read().splitlines():
    parts = line.split()
    if parts and parts[0] in commands:
        commands[parts[0]](parts[1:])
