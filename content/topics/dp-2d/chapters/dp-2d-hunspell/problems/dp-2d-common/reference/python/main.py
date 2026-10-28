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


for line in sys.stdin.read().splitlines():
    parts = line.split()
    if parts and parts[0] in commands:
        commands[parts[0]](parts[1:])
