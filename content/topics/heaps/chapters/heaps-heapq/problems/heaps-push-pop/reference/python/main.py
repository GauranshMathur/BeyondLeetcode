import sys


class Item:
    __slots__ = ("key", "ticket")

    def __init__(self, key, ticket):
        self.key = key
        self.ticket = ticket


def less(a, b):
    """True when `a` is smaller than `b`: lower key, or the same key and an earlier ticket."""
    return a.key < b.key or (a.key == b.key and a.ticket < b.ticket)


class Heap:
    def __init__(self):
        self.items = []  # the heap, in array order

    def sift_up(self, pos):
        """Moves the item at `pos` up while it is smaller than its parent."""
        items = self.items
        item = items[pos]
        while pos > 0:
            parent = (pos - 1) // 2
            if not less(item, items[parent]):
                break
            items[pos] = items[parent]
            pos = parent
        items[pos] = item

    def sift_down(self, pos):
        """Moves the item at `pos` down while a child is smaller than it."""
        items = self.items
        end = len(items)
        item = items[pos]
        while 2 * pos + 1 < end:
            child = 2 * pos + 1
            if child + 1 < end and less(items[child + 1], items[child]):
                child += 1
            if not less(items[child], item):
                break
            items[pos] = items[child]
            pos = child
        items[pos] = item

    def push(self, item):
        self.items.append(item)
        self.sift_up(len(self.items) - 1)

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
