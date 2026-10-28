import sys


class Item:
    __slots__ = ("key", "ticket")

    def __init__(self, key, ticket):
        self.key = key
        self.ticket = ticket


class Heap:
    def __init__(self):
        self.items = []  # the heap, in array order
        self.compares = 0  # how many times two items have been compared

    def less(self, a, b):
        """True when `a` is smaller than `b`: lower key, or the same key and an earlier ticket."""
        self.compares += 1
        return a.key < b.key or (a.key == b.key and a.ticket < b.ticket)

    def sift_up(self, start, pos):
        """Moves the item at `pos` up while it is smaller than its parent, but never above `start`."""
        items = self.items
        item = items[pos]
        while pos > start:
            parent = (pos - 1) // 2
            if not self.less(item, items[parent]):
                break
            items[pos] = items[parent]
            pos = parent
        items[pos] = item

    def sift_down(self, pos):
        """Opens a hole at `pos`, moves the smaller child up into it again and again until the
        hole is at a leaf, puts the item there and sifts it up."""
        items = self.items
        end = len(items)
        start = pos
        item = items[pos]
        while 2 * pos + 1 < end:
            child = 2 * pos + 1
            if child + 1 < end and self.less(items[child + 1], items[child]):
                child += 1
            items[pos] = items[child]
            pos = child
        items[pos] = item
        self.sift_up(start, pos)

    def push(self, item):
        self.items.append(item)
        self.sift_up(0, len(self.items) - 1)

    def init(self, items):
        """Replaces the contents with `items` and arranges them into a heap in one pass."""
        self.items = items
        for pos in range(len(items) // 2 - 1, -1, -1):
            self.sift_down(pos)

    def pop(self):
        last = self.items.pop()
        if not self.items:
            return last
        top = self.items[0]
        self.items[0] = last
        self.sift_down(0)
        return top


heap = Heap()
tickets = 0  # how many pushes so far

for line in sys.stdin.read().splitlines():
    parts = line.split()
    if not parts:
        continue
    command = parts[0]
    if command == "push":
        heap.push(Item(int(parts[1]), tickets))
        tickets += 1
    elif command == "pop":
        print(heap.pop().key if heap.items else "empty")
    elif command == "peek":
        print(heap.items[0].key if heap.items else "empty")
    elif command == "size":
        print(len(heap.items))
    elif command == "show":
        print(" ".join(str(item.key) for item in heap.items) if heap.items else "empty")
    elif command == "cmp":
        print(heap.compares)
    elif command == "init":
        keys = [int(word) for word in parts[1:]]
        heap.init([Item(key, tickets + i) for i, key in enumerate(keys)])
        tickets += len(keys)
