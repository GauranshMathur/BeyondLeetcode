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


def del_entry(e):
    prev, nxt = rd(e + 1), rd(e)
    wr(nxt + 1, prev)
    wr(prev, nxt)


def cmd_del(args):
    e = args[0]
    del_entry(e)
    wr(e, POISON1)
    wr(e + 1, POISON2)


def cmd_del_init(args):
    del_entry(args[0])
    init_head(args[0])


def cmd_show_rev(args):
    head = args[0]
    nodes = []
    p = rd(head + 1)
    while p != head:
        nodes.append(p)
        p = rd(p + 1)
    out_list(nodes)


def cmd_get(args):
    out(rd(args[0]))


commands["del"] = cmd_del
commands["del_init"] = cmd_del_init
commands["show_rev"] = cmd_show_rev
commands["get"] = cmd_get


def cmd_set(args):
    wr(args[0], args[1])


def cmd_entry(args):
    out(args[0] - args[1])


def cmd_values(args):
    head, offset = args
    values = [rd(p - offset) for p in forward(head)]
    out_list(values)


commands["set"] = cmd_set
commands["entry"] = cmd_entry
commands["values"] = cmd_values


# A singly linked list: the head is one cell holding the first node, a node's first cell
# holds the next node, and NULL ends the list.
def cmd_spush(args):
    head, node = args
    wr(node, rd(head))
    wr(head, node)


def singly(head):
    nodes = []
    p = rd(head)
    while p != NULL:
        nodes.append(p)
        p = rd(p)
    return nodes


def cmd_sshow(args):
    nodes = singly(args[0])
    out_list(nodes)


def cmd_sdel(args):
    head, node = args
    cur = head  # the cell that holds the pointer to the node being looked at
    hops = 0
    while True:
        nxt = rd(cur)
        if nxt == NULL:
            out("absent")
            return
        if nxt == node:
            break
        cur = nxt
        hops += 1
    wr(cur, rd(node))
    out(hops)


commands["spush"] = cmd_spush
commands["sshow"] = cmd_sshow
commands["sdel"] = cmd_sdel


# An hlist: the head is one cell (first). A node is two cells: next, and pprev, the address of
# the cell that points at this node (the head's cell, or the previous node's first cell).
def cmd_hadd(args):
    node, head = args
    first = rd(head)
    wr(node, first)
    if first != NULL:
        wr(first + 1, node)
    wr(head, node)
    wr(node + 1, head)


def cmd_hadd_before(args):
    node, nxt = args
    wr(node + 1, rd(nxt + 1))
    wr(node, nxt)
    wr(nxt + 1, node)
    wr(rd(node + 1), node)


def cmd_hadd_behind(args):
    node, prev = args
    wr(node, rd(prev))
    wr(prev, node)
    wr(node + 1, prev)
    if rd(node) != NULL:
        wr(rd(node) + 1, node)


def cmd_hdel(args):
    node = args[0]
    nxt, pprev = rd(node), rd(node + 1)
    wr(pprev, nxt)
    if nxt != NULL:
        wr(nxt + 1, pprev)
    wr(node, POISON1)
    wr(node + 1, POISON2)


commands["hadd"] = cmd_hadd
commands["hadd_before"] = cmd_hadd_before
commands["hadd_behind"] = cmd_hadd_behind
commands["hdel"] = cmd_hdel
commands["hshow"] = cmd_sshow


def splice(lst, prev, nxt):
    first, last = rd(lst), rd(lst + 1)
    wr(first + 1, prev)
    wr(prev, first)
    wr(last, nxt)
    wr(nxt + 1, last)


def cmd_splice(args):
    lst, head = args
    if rd(lst) != lst:
        splice(lst, head, rd(head))
        init_head(lst)


def cmd_splice_tail(args):
    lst, head = args
    if rd(lst) != lst:
        splice(lst, rd(head + 1), head)
        init_head(lst)


commands["splice"] = cmd_splice
commands["splice_tail"] = cmd_splice_tail


def cmd_sreverse(args):
    head = args[0]
    prev = NULL
    cur = rd(head)
    while cur != NULL:
        nxt = rd(cur)
        wr(cur, prev)
        prev = cur
        cur = nxt
    wr(head, prev)


commands["sreverse"] = cmd_sreverse


for line in sys.stdin.read().splitlines():
    parts = line.split()
    if parts and parts[0] in commands:
        commands[parts[0]]([int(x) for x in parts[1:]])
