import sys


MATRIX_COMMANDS = {"at", "shape", "show", "block", "transpose", "mirror", "rotate", "spiral"}


def wrap32(x):
    """The 32-bit two's-complement value x lands on. Python ints never overflow, so wrap by hand."""
    return (x + 2**31) % 2**32 - 2**31


def big_mul(a, b):
    """Grade-school multiplication of two decimal strings, one digit per array slot."""
    x = [int(ch) for ch in reversed(a)]  # least significant digit first
    y = [int(ch) for ch in reversed(b)]
    z = [0] * (len(x) + len(y))
    for i, f in enumerate(x):
        carry = 0
        for j, d in enumerate(y):
            carry += z[i + j] + d * f
            z[i + j] = carry % 10
            carry //= 10
        z[i + len(y)] += carry
    while len(z) > 1 and z[-1] == 0:
        z.pop()
    return "".join(str(d) for d in reversed(z))


MASK64 = 2**64 - 1


def pow64(base, exp):
    """base**exp modulo 2**64, by squaring: one pass per bit of exp."""
    result = 1
    while exp:
        if exp & 1:
            result = result * base & MASK64
        exp >>= 1
        base = base * base & MASK64
    return result


def pow_mod(base, exp, mod):
    """base**exp modulo mod, by squaring, reducing after every multiplication."""
    result = 1 % mod
    base %= mod
    while exp:
        if exp & 1:
            result = result * base % mod
        exp >>= 1
        base = base * base % mod
    return result


# The matrix: one block of items, and a view of it (shape, offset and one stride per axis).
loaded = False
block = []
rows = cols = 0
offset = 0  # index in the block of the view's item (0, 0)
row_stride = col_stride = 0  # how far to move in the block for one step down / right


def load(r, c, values):
    global loaded, block, rows, cols, offset, row_stride, col_stride
    loaded = True
    block = values
    rows, cols = r, c
    offset, row_stride, col_stride = 0, c, 1


def at(i, j):
    return block[offset + i * row_stride + j * col_stride]


def transpose():
    """Swap the axes of the view. No item moves."""
    global rows, cols, row_stride, col_stride
    rows, cols = cols, rows
    row_stride, col_stride = col_stride, row_stride


def mirror():
    """Reverse each row of the view: start at its last column and walk backwards. No item moves."""
    global offset, col_stride
    offset += (cols - 1) * col_stride
    col_stride = -col_stride


def spiral():
    """The view's items clockwise from the top-left corner, walking in towards the middle."""
    out = []
    top, bottom, left, right = 0, rows - 1, 0, cols - 1
    while top <= bottom and left <= right:
        for j in range(left, right + 1):
            out.append(at(top, j))
        for i in range(top + 1, bottom + 1):
            out.append(at(i, right))
        if top < bottom:
            for j in range(right - 1, left - 1, -1):
                out.append(at(bottom, j))
        if left < right:
            for i in range(bottom - 1, top, -1):
                out.append(at(i, left))
        top, bottom, left, right = top + 1, bottom - 1, left + 1, right - 1
    return out


def ctz(x):
    """How many low bits of x are 0 (x must not be 0)."""
    return (x & -x).bit_length() - 1


def gcd(a, b):
    """Binary GCD, as in Linux's lib/math/gcd.c: shifts and subtractions, no division."""
    r = a | b
    if a == 0 or b == 0:
        return r
    b >>= ctz(b)
    if b == 1:
        return r & -r
    while True:
        a >>= ctz(a)
        if a == 1:
            return r & -r
        if a == b:
            return a << ctz(r)
        if a < b:
            a, b = b, a
        a -= b


def main():
    for line in sys.stdin.read().splitlines():
        parts = line.split()
        if not parts:
            continue
        command = parts[0]
        if command in MATRIX_COMMANDS and not loaded:
            print("error")
            continue
        match command:
            case "add32":
                print(wrap32(int(parts[1]) + int(parts[2])))
            case "mul32":
                print(wrap32(int(parts[1]) * int(parts[2])))
            case "mul":
                print(big_mul(parts[1], parts[2]))
            case "pow64":
                print(pow64(int(parts[1]), int(parts[2])))
            case "powmod":
                print(pow_mod(int(parts[1]), int(parts[2]), int(parts[3])))
            case "matrix":
                r, c = int(parts[1]), int(parts[2])
                load(r, c, [int(v) for v in parts[3:3 + r * c]])
            case "at":
                i, j = int(parts[1]), int(parts[2])
                print(at(i, j) if 0 <= i < rows and 0 <= j < cols else "error")
            case "shape":
                print(rows, cols)
            case "show":
                for i in range(rows):
                    print(" ".join(str(at(i, j)) for j in range(cols)))
            case "block":
                print(" ".join(str(v) for v in block))
            case "transpose":
                transpose()
            case "mirror":
                mirror()
            case "rotate":
                # A clockwise quarter turn is a transpose, then a mirror (what NumPy's rot90 composes).
                transpose()
                mirror()
            case "spiral":
                print(" ".join(str(v) for v in spiral()))
            case "gcd":
                print(gcd(int(parts[1]), int(parts[2])))


main()
