# The biggest block that fits

Python's standard library can turn a first and a last IP address into a list of networks that cover exactly the addresses between them ([`ipaddress.summarize_address_range`](https://docs.python.org/3.13/library/ipaddress.html#ipaddress.summarize_address_range)). You start the Build that holds the greedy choices of this Topic. In it an address is a plain whole number, and the question is how many networks such a list needs.

The Build reads commands from standard input, one per line. Blank lines are ignored, and so is a line that starts with a word the Build does not know. A command that prints, prints one line.

A **block** is a run of 2^k consecutive numbers (k is 0 or more) whose first number is a multiple of 2^k. `8..15` is a block (k = 3) and so is `6..7`; `6..9` is not, because it is four numbers long and 6 is not a multiple of 4. For the range 192.0.2.0 to 192.0.2.130 the documentation shows the networks `192.0.2.0/25`, `192.0.2.128/31` and `192.0.2.130/32` ([docs, 3.13](https://docs.python.org/3.13/library/ipaddress.html#ipaddress.summarize_address_range)): by their prefix lengths, blocks of 128, 2 and 1 addresses. That is the kind of block this Problem counts.

| Command | What it does | Prints |
|---|---|---|
| `cidr A B` | Covers every number from `A` to `B`, and no other number, with blocks that do not overlap. | the fewest blocks that can do it |

`A` and `B` are whole numbers with `0 <= A <= B <= 4294967295` (2^32 - 1, the largest IPv4 address as a number). `A` may equal `B`. Run on its own, `cidr` needs nothing loaded.

## Example

Input:

```
cidr 5 22
```

Output:

```
6
```

One list of six blocks is `5`, `6..7`, `8..15`, `16..19`, `20..21` and `22`. No list is shorter: 5 and 22 each have to be a block of one, because 4 and 23 lie outside the range, and `6..21` is sixteen numbers but not a block.
