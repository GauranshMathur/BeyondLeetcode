import sys



def wrap32(x):
    """The 32-bit two's-complement value x lands on. Python ints never overflow, so wrap by hand."""
    return (x + 2**31) % 2**32 - 2**31


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


main()
