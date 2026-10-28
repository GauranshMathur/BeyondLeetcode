import sys


class Item:
    __slots__ = ("key", "ticket", "name", "pos")

    def __init__(self, key, ticket, name=""):
        self.key = key
        self.ticket = ticket
        self.name = name  # a timer's ID; empty for an item made by push or init
        self.pos = 0  # the item's index in the heap array, kept up to date by `put`


class Heap:
    def __init__(self):
        self.items = []  # the heap, in array order
        self.compares = 0  # how many times two items have been compared

    def less(self, a, b):
        """True when `a` is smaller than `b`: lower key, or the same key and an earlier ticket."""
        self.compares += 1
        return a.key < b.key or (a.key == b.key and a.ticket < b.ticket)

    def put(self, pos, item):
        """Every move of an item goes through here, so `item.pos` is always right."""
        self.items[pos] = item
        item.pos = pos

    def sift_up(self, start, pos):
        """Moves the item at `pos` up while it is smaller than its parent, but never above `start`.
        Returns where the item ends up."""
        items = self.items
        item = items[pos]
        while pos > start:
            parent = (pos - 1) // 2
            if not self.less(item, items[parent]):
                break
            self.put(pos, items[parent])
            pos = parent
        self.put(pos, item)
        return pos

    def sift_down(self, pos):
        """Opens a hole at `pos`, moves the smaller child up into it again and again until the
        hole is at a leaf, puts the item there and sifts it up. Returns where the item ends up."""
        items = self.items
        end = len(items)
        start = pos
        item = items[pos]
        while 2 * pos + 1 < end:
            child = 2 * pos + 1
            if child + 1 < end and self.less(items[child + 1], items[child]):
                child += 1
            self.put(pos, items[child])
            pos = child
        self.put(pos, item)
        return self.sift_up(start, pos)

    def fix(self, pos):
        """Restores the heap after the item at `pos` changed its key or took the place of another."""
        if self.sift_down(pos) == pos:
            self.sift_up(0, pos)

    def push(self, item):
        self.items.append(item)
        self.sift_up(0, len(self.items) - 1)

    def pop(self):
        return self.remove(0)

    def remove(self, pos):
        """Takes out the item at `pos`: the last item fills the gap and is fixed."""
        removed = self.items[pos]
        last = self.items.pop()
        if pos < len(self.items):
            self.put(pos, last)
            self.fix(pos)
        return removed

    def replace_top(self, item):
        """Overwrites the smallest item with `item` and restores the heap."""
        self.put(0, item)
        self.sift_down(0)

    def init(self, items):
        """Replaces the contents with `items` and arranges them into a heap in one pass."""
        self.items = items
        for pos, item in enumerate(items):
            item.pos = pos
        for pos in range(len(items) // 2 - 1, -1, -1):
            self.sift_down(pos)


heap = Heap()
tickets = 0  # how many pushes so far
limit = 0  # 0: keep every item; otherwise the most items to keep
queued = {}  # ID -> the timer with that ID that is in the heap


def pop_item():
    item = heap.pop()
    if queued.get(item.name) is item:
        del queued[item.name]
    return item


for line in sys.stdin.read().splitlines():
    parts = line.split()
    if not parts:
        continue
    command = parts[0]
    if command == "push":
        item = Item(int(parts[1]), tickets)
        tickets += 1
        if limit == 0 or len(heap.items) < limit:
            heap.push(item)
        elif item.key > heap.items[0].key:
            heap.replace_top(item)
    elif command == "keep":
        limit = int(parts[1])
    elif command == "pop":
        print(pop_item().key if heap.items else "empty")
    elif command == "peek":
        print(heap.items[0].key if heap.items else "empty")
    elif command == "size":
        print(len(heap.items))
    elif command == "show":
        print(" ".join(str(item.key) for item in heap.items) if heap.items else "empty")
    elif command == "cmp":
        print(heap.compares)
    elif command == "sched":
        item = Item(int(parts[2]), tickets, parts[1])
        tickets += 1
        queued[item.name] = item
        heap.push(item)
    elif command == "advance":
        now = int(parts[1])
        while heap.items and heap.items[0].key <= now:
            print(pop_item().name)
    elif command == "update" or command == "cancel":
        item = queued.get(parts[1])
        if item is None:
            print("error")
        elif command == "update":
            item.key = int(parts[2])
            heap.fix(item.pos)
        else:
            del queued[item.name]
            heap.remove(item.pos)
    elif command == "init":
        keys = [int(word) for word in parts[1:]]
        heap.init([Item(key, tickets + i) for i, key in enumerate(keys)])
        tickets += len(keys)
        queued = {}
