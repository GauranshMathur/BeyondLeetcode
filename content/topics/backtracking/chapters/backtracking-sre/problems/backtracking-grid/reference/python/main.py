import sys

commands = {}


def parse(pattern):
    """Splits a pattern into steps: (is_group, the strings the step can match)."""
    steps = []
    i = 0
    while i < len(pattern):
        if pattern[i] == "(":
            j = pattern.index(")", i)
            steps.append((True, pattern[i + 1 : j].split("|")))
            i = j + 1
        else:
            j = i
            while j < len(pattern) and pattern[j] != "(":
                j += 1
            steps.append((False, [pattern[i:j]]))
            i = j
    return steps


def match(args):
    steps = parse(args[0])
    text = args[1]
    chosen = []  # the alternative picked at each group so far

    def go(step, pos):
        if step == len(steps):
            return pos == len(text)
        is_group, options = steps[step]
        for index, option in enumerate(options):
            if not text.startswith(option, pos):
                continue
            if is_group:
                chosen.append(index)  # choose
            if go(step + 1, pos + len(option)):  # explore
                return True
            if is_group:
                chosen.pop()  # undo
        return False

    if go(0, 0):
        print(" ".join(["yes"] + [str(i) for i in chosen]))
    else:
        print("no")


commands["match"] = match


def find(args):
    word, rows = args[0], args[1:]
    used = [[False] * len(row) for row in rows]
    path = []
    moves = [(-1, 0), (0, 1), (1, 0), (0, -1)]  # up, right, down, left

    def walk(r, c, k):
        if used[r][c] or rows[r][c] != word[k]:
            return False
        used[r][c] = True  # choose
        path.append(f"{r}:{c}")
        if k == len(word) - 1:
            return True
        for dr, dc in moves:
            nr, nc = r + dr, c + dc
            if 0 <= nr < len(rows) and 0 <= nc < len(rows[nr]) and walk(nr, nc, k + 1):  # explore
                return True
        path.pop()  # undo
        used[r][c] = False
        return False

    for r in range(len(rows)):
        for c in range(len(rows[r])):
            if walk(r, c, 0):
                print("yes " + " ".join(path))
                return
    print("no")


commands["find"] = find

for line in sys.stdin.read().splitlines():
    parts = line.split()
    if parts and parts[0] in commands:
        commands[parts[0]](parts[1:])
