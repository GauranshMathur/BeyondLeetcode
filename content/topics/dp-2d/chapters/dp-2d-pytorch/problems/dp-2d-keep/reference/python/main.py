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


grid = []  # the energy grid, one list per row


def load_grid(args):
    global grid
    rows, cols = int(args[0]), int(args[1])
    cells = [int(x) for x in args[2:]]
    grid = [cells[r * cols:(r + 1) * cols] for r in range(rows)]


def seam(args):
    m = [grid[0][:]]  # m[y][x]: the cheapest seam from the top row down to cell (y, x)
    for y in range(1, len(grid)):
        m.append([grid[y][x] + min(m[y - 1][max(0, x - 1):x + 2]) for x in range(len(grid[y]))])
    print(min(m[-1]))


commands["grid"] = load_grid
commands["seam"] = seam


items = []  # (weight, value) pairs


def load_items(args):
    global items
    numbers = [int(x) for x in args]
    items = list(zip(numbers[0::2], numbers[1::2]))


def keep(args):
    cap = int(args[0])
    # table[i][j]: the most value from the first i items within weight j
    table = [[0] * (cap + 1) for _ in range(len(items) + 1)]
    for i, (weight, value) in enumerate(items, start=1):
        for j in range(cap + 1):
            table[i][j] = table[i - 1][j]  # leave item i
            if weight <= j:
                table[i][j] = max(table[i][j], table[i - 1][j - weight] + value)  # take it once
    print(table[len(items)][cap])


commands["items"] = load_items
commands["keep"] = keep


for line in sys.stdin.read().splitlines():
    parts = line.split()
    if parts and parts[0] in commands:
        commands[parts[0]](parts[1:])
