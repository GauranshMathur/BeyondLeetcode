# CPython: the biggest block that fits

A greedy algorithm builds its answer in steps. At each step it takes the choice that looks best right now, and it never takes one back. That is quick, and it is correct only when someone has shown that the choice cannot cost the answer anything. This Chapter reads a small piece of CPython where the choice is easy to see and the proof fits in a few lines, and then gives the proof. The piece is [`summarize_address_range`](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/ipaddress.py#L200) in the standard library's [`ipaddress` module](https://docs.python.org/3.13/library/ipaddress.html#ipaddress.summarize_address_range) (CPython at commit `60403a5`, the one tagged v3.13.0). In the Problem you count the blocks it would produce.

## What the function does

The documentation describes it in one sentence: "Return an iterator of the summarized network range given the first and last IP addresses." ([ipaddress docs, 3.13](https://docs.python.org/3.13/library/ipaddress.html#ipaddress.summarize_address_range)) Its example takes the addresses 192.0.2.0 and 192.0.2.130 and returns `[IPv4Network('192.0.2.0/25'), IPv4Network('192.0.2.128/31'), IPv4Network('192.0.2.130/32')]`. ([ipaddress docs, 3.13](https://docs.python.org/3.13/library/ipaddress.html#ipaddress.summarize_address_range)) Count the addresses: a `/25` network holds 128 of them (32 - 25 = 7 bits left over, and 2^7 = 128), a `/31` two and a `/32` one, so the three networks cover 128 + 2 + 1 = 131 addresses, which is every address from `.0` to `.130` and no other (arithmetic on the prefix lengths). Each of the three starts at a multiple of its size (offsets 0, 128 and 130 are multiples of 128, 2 and 1). The Problem uses plain whole numbers for addresses and calls a run of 2^k of them that starts at a multiple of 2^k a **block**.

## The choice in the code

Here is the loop at the heart of the function:

```python
    while first_int <= last_int:
        nbits = min(_count_righthand_zero_bits(first_int, ip_bits),
                    (last_int - first_int + 1).bit_length() - 1)
        net = ip((first_int, ip_bits - nbits))
        yield net
        first_int += 1 << nbits
        if first_int - 1 == ip._ALL_ONES:
            break
```

([Lib/ipaddress.py, lines 245 to 252](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/ipaddress.py#L245-L252).) What follows is a reading of those lines. `first_int` is the first address not covered yet. `nbits` is the smaller of two numbers, and the block that is yielded has `2 ** nbits` addresses, because its prefix length is `ip_bits - nbits`, the width of an address minus `nbits`.

The first number is the count of zero bits at the right of `first_int`, from a helper whose docstring says "Count the number of zero bits on the right hand side." ([Lib/ipaddress.py, line 185](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/ipaddress.py#L185)) A number with `z` zero bits at its right is a multiple of 2^z and of no larger power of two, so a block of 2^z can start there and a block of 2^(z + 1) cannot. The second is `(last_int - first_int + 1).bit_length() - 1`. The Python documentation says "if x is nonzero, then x.bit_length() is the unique positive integer k such that 2**(k-1) <= abs(x) < 2**k" ([int.bit_length, 3.13](https://docs.python.org/3.13/library/stdtypes.html#int.bit_length); the quote is the rendered text, without its code markup), so the second number is the largest `k` with 2^k at most the count of addresses left. The block is as big as both limits allow. Then `first_int += 1 << nbits` moves to the first address after the block, and the loop repeats. The last two lines stop the loop when the block just made reached the top of the address space, since there is no next address to start from. ([Lib/ipaddress.py, lines 250 to 252](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/ipaddress.py#L250-L252).)

Nothing in the loop compares the list with another list, and nothing is undone. Whether it produces the shortest list is a separate question, and neither [the documentation](https://docs.python.org/3.13/library/ipaddress.html#ipaddress.summarize_address_range) nor [the code](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/ipaddress.py#L200-L252) says that it does. The Chapter shows that it does.

## Why the biggest block is safe

This argument is the Chapter's own, not CPython's. Call a list of blocks that covers exactly the range, without overlap, a **cover**. Suppose some shortest cover agrees with the loop's choices so far, and `x` is the first address they leave uncovered. The rest of that cover has to cover exactly `x` to the end, so one of its blocks starts at `x`. Let `2^k` be the biggest block that fits at `x`, which is what the loop picks. The block of the shortest cover at `x` is no bigger than that, `2^j` with `j <= k`.

Now take every block of that cover that touches the stretch `x` to `x + 2^k - 1`. Each lies inside the stretch. A block of `2^m` addresses starts at a multiple of `2^m`, and if `m >= k` that start would be a multiple of `2^k`. The only multiple of `2^k` in the stretch is `x` itself, and the block at `x` has at most `2^k` addresses, so every other block that touches the stretch has fewer than `2^k` addresses and, being aligned, lies inside it. Together the blocks cover the stretch exactly. Replace them with the one block of `2^k`. That is one block in the place of at least one, so the cover is no longer than before, and it now agrees with the loop for one more step. Repeating that step by step turns a shortest cover into the loop's cover without ever making it longer. This is the **exchange argument**: take any best answer, swap its first choice for the greedy one, and show the swap cannot hurt. The proof is what a greedy algorithm needs, and the Chapters that follow lean on the same shape of argument or show where it breaks.

## The cost

Per block the loop does constant work on fixed-width numbers. How many blocks can there be? While `first_int` is what limits the size, each block ends at a multiple of a larger power of two than the block before, so the sizes strictly rise. Once the number of addresses left is what limits it, the rest is shorter than the block just taken, so the sizes strictly fall. Each of the at most `w + 1` sizes, where `w` is the number of bits in an address, is used at most once in each phase, so the list has O(w) blocks in the **worst case**, and the function takes O(w) steps. That is a constant for the 32 bits of IPv4.

## What the Problem builds

You start the Build with `cidr A B`, which prints the number of blocks that this rule gives for the addresses `A` to `B` as whole numbers. Your Reference Code may find the size by doubling instead of counting zero bits, which makes each block cost O(w) in the **worst case** and the call O(w²), which is a constant for 32 bits. The other three Chapters add a Huffman code builder, a deadline scheduler and a match parser to the same program.
