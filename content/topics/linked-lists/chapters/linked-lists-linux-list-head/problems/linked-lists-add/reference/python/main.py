import sys

mem = {}  # memory: address -> number. A cell nobody wrote reads as 0, which is NULL.
commands = {}
NULL = 0
POISON1 = 256  # LIST_POISON1, 0x100
POISON2 = 290  # LIST_POISON2, 0x122


def rd(addr):
    return mem.get(addr, 0)


def wr(addr, value):
    mem[addr] = value


def out(*parts):
    print(" ".join(str(p) for p in parts))


def out_list(items):
    out(*items) if items else out("-")


# A list_head is two cells: next at the address, prev at the address + 1.
def init_head(p):
    wr(p, p)
    wr(p + 1, p)


def add_between(new, prev, nxt):
    wr(nxt + 1, new)
    wr(new, nxt)
    wr(new + 1, prev)
    wr(prev, new)


def cmd_init(args):
    init_head(args[0])


def cmd_add(args):
    new, head = args
    add_between(new, head, rd(head))


def cmd_add_tail(args):
    new, head = args
    add_between(new, rd(head + 1), head)


def forward(head):
    nodes = []
    p = rd(head)
    while p != head:
        nodes.append(p)
        p = rd(p)
    return nodes


def cmd_show(args):
    nodes = forward(args[0])
    out_list(nodes)


def cmd_empty(args):
    out("yes" if rd(args[0]) == args[0] else "no")


commands["init"] = cmd_init
commands["add"] = cmd_add
commands["add_tail"] = cmd_add_tail
commands["show"] = cmd_show
commands["empty"] = cmd_empty


for line in sys.stdin.read().splitlines():
    parts = line.split()
    if parts and parts[0] in commands:
        commands[parts[0]]([int(x) for x in parts[1:]])
