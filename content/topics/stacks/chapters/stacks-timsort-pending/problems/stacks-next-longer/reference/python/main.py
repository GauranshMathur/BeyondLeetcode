import sys

frames = []  # the sizes in bytes of the live frames, oldest first
used = 0  # bytes in use: the sum of the sizes in frames
segment = 2048  # bytes the stack owns
moved = 0  # bytes copied each time the stack moves to a new segment
max_stack = 1000000000  # the largest segment allowed
data = [0] * 10  # the slots behind the value stack
count = 0  # how many slots hold an item
copies = 0  # items copied when the value stack grew
mins = []  # mins[i] is the smallest of the first i + 1 items
list_len = 0  # the number of elements being sorted
run_end = 0  # where the runs seen so far end
pending = []  # [length, power] of each run not yet merged, oldest first


def call(n):
    global used
    if used + n > segment:
        new_size = segment * 2
        while new_size < used + n:
            new_size *= 2
        if new_size > max_stack:
            print("stack overflow")
            raise SystemExit
        move_to(new_size)
    frames.append(n)
    used += n


def move_to(size):
    global segment, moved
    moved += used
    segment = size


def collect():
    half = segment // 2
    if half >= 2048 and used < segment // 4:
        move_to(half)


def push(x):
    global data, count, copies
    if count == len(data):
        bigger = [0] * (len(data) * 2)
        for i in range(count):
            bigger[i] = data[i]
        copies += count
        data = bigger
    data[count] = x
    count += 1
    mins.append(min(x, mins[-1]) if mins else x)


def pop():
    global count
    if count == 0:
        return "error"
    count -= 1
    item = data[count]
    data[count] = 0
    mins.pop()
    return str(item)


def power(s1, n1, n2, n):
    result = 0
    a = 2 * s1 + n1
    b = a + n1 + n2
    while True:
        result += 1
        if a >= n:
            a -= n
            b -= n
        elif b >= n:
            break
        a <<= 1
        b <<= 1
    return result


def merge_at(i):
    print("merge", pending[i][0], pending[i + 1][0])
    pending[i][0] += pending[i + 1][0]
    del pending[i + 1]


def add_run(length):
    global run_end
    if pending:
        n1 = pending[-1][0]
        p = power(run_end - n1, n1, length, list_len)
        while len(pending) > 1 and pending[-2][1] > p:
            merge_at(len(pending) - 2)
        pending[-1][1] = p
    pending.append([length, 0])
    run_end += length


def finish():
    while len(pending) > 1:
        i = len(pending) - 2
        if i > 0 and pending[i - 1][0] < pending[i + 1][0]:
            i -= 1
        merge_at(i)


def next_longer(values):
    answer = [0] * len(values)
    stack = []  # indexes whose answer is still unknown; their values never rise
    for i, v in enumerate(values):
        while stack and values[stack[-1]] < v:
            j = stack.pop()
            answer[j] = i - j
        stack.append(i)
    return answer


for text in sys.stdin.read().splitlines():
    parts = text.split()
    if not parts:
        continue
    command, args = parts[0], parts[1:]
    if command == "call":
        call(int(args[0]))
    elif command == "ret":
        if not frames:
            print("error")
        else:
            size = frames.pop()
            used -= size
            print(size)
    elif command == "depth":
        print(len(frames))
    elif command == "used":
        print(used)
    elif command == "segment":
        print(segment)
    elif command == "moved":
        print(moved)
    elif command == "limit":
        max_stack = int(args[0])
    elif command == "gc":
        collect()
    elif command == "push":
        push(int(args[0]))
    elif command == "pop":
        print(pop())
    elif command == "peek":
        print(data[count - 1] if count > 0 else "error")
    elif command == "empty":
        print("true" if count == 0 else "false")
    elif command == "search":
        found = -1
        for i in range(count - 1, -1, -1):
            if data[i] == int(args[0]):
                found = count - i
                break
        print(found)
    elif command == "size":
        print(count)
    elif command == "capacity":
        print(len(data))
    elif command == "copies":
        print(copies)
    elif command == "min":
        print(mins[-1] if mins else "error")
    elif command == "sort":
        list_len = int(args[0])
        run_end = 0
        pending = []
    elif command == "run":
        add_run(int(args[0]))
    elif command == "end":
        finish()
    elif command == "pending":
        print(" ".join(str(run[0]) for run in pending) if pending else "empty")
    elif command == "nextlonger":
        print(" ".join(str(x) for x in next_longer([int(a) for a in args])))
