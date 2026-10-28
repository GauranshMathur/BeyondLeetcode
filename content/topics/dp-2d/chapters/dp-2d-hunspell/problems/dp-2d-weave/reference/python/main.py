import sys

commands = {}


first = second = ""  # the two words the commands work on


def word(text):
    return "" if text == "-" else text  # an empty word is written -


def show_word(text):
    return text if text else "-"


def words(args):
    global first, second
    first, second = word(args[0]), word(args[1])


def show(args):
    print(show_word(first), show_word(second))


commands["words"] = words
commands["show"] = show


def lcs_table():
    # c[i][j]: length of the longest common subsequence of the first i letters of first and the first j of second
    c = [[0] * (len(second) + 1) for _ in range(len(first) + 1)]
    for i in range(1, len(first) + 1):
        for j in range(1, len(second) + 1):
            if first[i - 1] == second[j - 1]:
                c[i][j] = c[i - 1][j - 1] + 1
            else:
                c[i][j] = max(c[i - 1][j], c[i][j - 1])
    return c


def common(args):
    print(lcs_table()[len(first)][len(second)])


commands["common"] = common


def trace(args):
    c = lcs_table()
    i, j = len(first), len(second)
    picked = []  # the common letters, last one first
    while i > 0 and j > 0:
        if first[i - 1] == second[j - 1]:
            picked.append(first[i - 1])
            i -= 1
            j -= 1
        elif c[i - 1][j] >= c[i][j - 1]:
            i -= 1
        else:
            j -= 1
    print(show_word("".join(reversed(picked))))


commands["trace"] = trace


def weave(args):
    target = word(args[0])
    m, n = len(first), len(second)
    if len(target) != m + n:
        print("no")
        return
    # ok[i][j]: the first i + j letters of target are a weave of the first i of first and the first j of second
    ok = [[False] * (n + 1) for _ in range(m + 1)]
    ok[0][0] = True
    for i in range(m + 1):
        for j in range(n + 1):
            if i > 0 and ok[i - 1][j] and first[i - 1] == target[i + j - 1]:
                ok[i][j] = True
            if j > 0 and ok[i][j - 1] and second[j - 1] == target[i + j - 1]:
                ok[i][j] = True
    print("yes" if ok[m][n] else "no")


commands["weave"] = weave


for line in sys.stdin.read().splitlines():
    parts = line.split()
    if parts and parts[0] in commands:
        commands[parts[0]](parts[1:])
