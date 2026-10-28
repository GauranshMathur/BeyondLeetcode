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


def calls(steps, text, prune):
    """How many states the search enters, where a state is (step, position)."""
    seen = set()
    count = 0

    def go(step, pos):
        nonlocal count
        if prune:
            if (step, pos) in seen:
                return False  # entered before, and the search is still going: it failed
            seen.add((step, pos))
        count += 1
        if step == len(steps):
            return pos == len(text)
        for option in steps[step][1]:
            if text.startswith(option, pos) and go(step + 1, pos + len(option)):
                return True
        return False

    go(0, 0)
    return count


def cost(args):
    steps = parse(args[0])
    text = args[1]
    print(f"plain {calls(steps, text, False)} visited {calls(steps, text, True)}")


commands["cost"] = cost


available = {}  # package -> its versions
requires = {}  # (package, version) -> [(other package, lowest, highest)]
needs = []  # (package, lowest, highest) asked for by the root


def pkg(args):
    available[args[0]] = [int(v) for v in args[1:]]


def dep(args):
    requires.setdefault((args[0], int(args[1])), []).append((args[2], int(args[3]), int(args[4])))


def need(args):
    needs.append((args[0], int(args[1]), int(args[2])))


commands["pkg"] = pkg
commands["dep"] = dep
commands["need"] = need


def resolve(args):
    pins = {}  # package -> the version chosen for it
    wanted = list(needs)  # a stack of (package, lowest, highest) ranges

    def go():
        todo = sorted({p for p, _, _ in wanted if p not in pins})
        if not todo:
            return True
        name = todo[0]
        for version in sorted(available.get(name, []), reverse=True):
            if not all(lo <= version <= hi for p, lo, hi in wanted if p == name):
                continue
            added = requires.get((name, version), [])
            if any(p in pins and not lo <= pins[p] <= hi for p, lo, hi in added):
                continue
            pins[name] = version  # choose
            wanted.extend(added)
            if go():  # explore
                return True
            del wanted[len(wanted) - len(added) :]  # undo
            del pins[name]
        return False

    if go():
        print(" ".join(["ok"] + [f"{n}={pins[n]}" for n in sorted(pins)]))
    else:
        print("conflict")


commands["resolve"] = resolve


values = []  # the list the commands work on


def load(args):
    global values
    values = [int(x) for x in args]


def fmt(items):
    return "[" + " ".join(str(x) for x in items) + "]"


def subsets(args):
    current = []

    def grow(start):
        print(fmt(current))
        for i in range(start, len(values)):
            current.append(values[i])  # choose
            grow(i + 1)  # explore
            current.pop()  # undo

    grow(0)


commands["load"] = load
commands["subsets"] = subsets


def perms(args):
    n = len(values)
    size = int(args[0]) if args else n
    used = [False] * n
    current = []

    def fill():
        if len(current) == size:
            print(fmt(current))
            return
        for i in range(n):
            if used[i]:
                continue
            used[i] = True  # choose
            current.append(values[i])
            fill()  # explore
            current.pop()  # undo
            used[i] = False

    fill()


commands["perms"] = perms


def queens(args):
    n = int(args[0])
    cols = [False] * n  # is this column taken
    diag = [False] * (2 * n - 1)  # is this "\" diagonal taken (row + col)
    anti = [False] * (2 * n - 1)  # is this "/" diagonal taken (row - col, shifted)
    placed = []  # the column (from 1) of the queen in each row so far
    count = 0
    first = None

    def place(row):
        nonlocal count, first
        if row == n:
            count += 1
            if first is None:
                first = list(placed)
            return
        for c in range(n):
            if cols[c] or diag[row + c] or anti[row - c + n - 1]:
                continue
            cols[c] = diag[row + c] = anti[row - c + n - 1] = True  # choose
            placed.append(c + 1)
            place(row + 1)  # explore
            placed.pop()  # undo
            cols[c] = diag[row + c] = anti[row - c + n - 1] = False

    place(0)
    print(count)
    if first is not None:
        print(" ".join(str(c) for c in first))


commands["queens"] = queens


def exact(args):
    ncols = int(args[0])
    rows = [[int(x) for x in a.split(",")] for a in args[1:]]
    covered = [False] * (ncols + 1)
    chosen = []
    nodes = 0

    def search():
        nonlocal nodes
        nodes += 1
        open_cols = [c for c in range(1, ncols + 1) if not covered[c]]
        if not open_cols:
            print(" ".join(str(i) for i in sorted(chosen)))
            return
        usable = [i for i, row in enumerate(rows) if not any(covered[c] for c in row)]
        ones = {c: 0 for c in open_cols}
        for i in usable:
            for c in rows[i]:
                ones[c] += 1
        col = min(open_cols, key=lambda c: (ones[c], c))  # the column with fewest rows to choose from
        for i in usable:
            if col not in rows[i]:
                continue
            for c in rows[i]:
                covered[c] = True  # choose
            chosen.append(i + 1)
            search()  # explore
            chosen.pop()  # undo
            for c in rows[i]:
                covered[c] = False

    search()
    print(f"nodes {nodes}")


commands["exact"] = exact

for line in sys.stdin.read().splitlines():
    parts = line.split()
    if parts and parts[0] in commands:
        commands[parts[0]](parts[1:])
