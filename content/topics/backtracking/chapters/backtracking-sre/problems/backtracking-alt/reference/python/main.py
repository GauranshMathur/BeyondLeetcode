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

for line in sys.stdin.read().splitlines():
    parts = line.split()
    if parts and parts[0] in commands:
        commands[parts[0]](parts[1:])
