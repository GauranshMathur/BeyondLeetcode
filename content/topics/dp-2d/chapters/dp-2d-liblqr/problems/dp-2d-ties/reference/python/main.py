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


MOD = 1_000_000_007


def ties(args):
    cost = [row[:] for row in grid]  # cost[y][x]: the cheapest seam from the top row down to cell (y, x)
    count = [[1] * len(row) for row in grid]  # count[y][x]: how many different seams have that cost
    for y in range(1, len(grid)):
        for x in range(len(grid[y])):
            near = range(max(0, x - 1), min(len(grid[y]) - 1, x + 1) + 1)
            low = min(cost[y - 1][k] for k in near)
            cost[y][x] = grid[y][x] + low
            count[y][x] = sum(count[y - 1][k] for k in near if cost[y - 1][k] == low) % MOD
    low = min(cost[-1])
    print(sum(n for c, n in zip(cost[-1], count[-1]) if c == low) % MOD)


commands["ties"] = ties


for line in sys.stdin.read().splitlines():
    parts = line.split()
    if parts and parts[0] in commands:
        commands[parts[0]](parts[1:])
