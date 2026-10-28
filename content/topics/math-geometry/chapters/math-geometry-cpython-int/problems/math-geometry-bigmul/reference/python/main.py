import sys



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


def main():
    for line in sys.stdin.read().splitlines():
        parts = line.split()
        if not parts:
            continue
        command = parts[0]
        match command:
            case "add32":
                print(wrap32(int(parts[1]) + int(parts[2])))
            case "mul32":
                print(wrap32(int(parts[1]) * int(parts[2])))
            case "mul":
                print(big_mul(parts[1], parts[2]))


main()
