# XOR and the lowest set bit: RAID 5 and power-of-two checks

Two bit operations do a great deal of work in systems code. XOR makes a value that undoes itself, which is what RAID 5 needs to survive a dead disk. AND with the number one less than it clears the lowest bit that is set, which is how the kernel asks whether a number is a power of two. This Chapter reads both in the Linux kernel (v6.6), and the Problems use them on the Build's sequence of words.

## XOR undoes itself

XOR of two bits is 1 when they differ. Three facts about it carry the Chapter, and they are arithmetic on bits, not claims about a system: `x ^ x` is 0, `x ^ 0` is `x`, and the order and grouping of a chain of XORs do not matter. So if `p` is the XOR of some values, XORing `p` with all of them but one gives that one back, because everything else cancels.

In a RAID 5 stripe the blocks sit on different drives, and the kernel's code speaks of a "data- or p-drive": a drive holds either data or parity. ([drivers/md/raid5.c, line 1715](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/drivers/md/raid5.c#L1715-L1715)) When a drive is lost, the kernel has to rebuild its block. In `ops_run_compute5` it first collects every block of the stripe except the target:

```c
for (i = disks; i--; ) {
	if (i != target) {
		off_srcs[count] = sh->dev[i].offset;
		xor_srcs[count++] = sh->dev[i].page;
	}
}
```

([drivers/md/raid5.c, lines 1594 to 1599](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/drivers/md/raid5.c#L1594-L1599)) and then XORs them into the target: `tx = async_xor_offs(xor_dest, off_dest, xor_srcs, off_srcs, count,`. ([lines 1609 to 1610](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/drivers/md/raid5.c#L1609-L1610)) The decision is that the parity block is not special on the way back: any one block is the XOR of all the others. The comment on the other code path says the same for data and parity alike: "Compute any data- or p-drive using XOR". (same line, comment markers dropped) The file that holds the XOR routines is described as "Dispatch optimized RAID-5 checksumming functions." ([crypto/xor.c, line 8](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/crypto/xor.c#L8-L8); comment marker dropped.)

The cost is one pass over the other blocks, each XORed in with one operation per word: O(n) in the **worst case** for n blocks of a fixed size, and O(1) extra space, since the running value is one block. The Problem `recover` asks for this on a sequence of words, which stand for the blocks that survived. The same loop solves a classic: if every value appears twice except one, the pairs cancel and the XOR of all of them is the odd one out.

## XOR for what is missing

The next Problem, `missing`, uses cancellation the other way. The sequence holds the numbers 0 to n except one, so there are n items. XOR together every item and every number from 0 to n. Each number that is present appears twice and cancels, and the one that is missing appears once. The loop can do it in one pass: start with n, and for each position `i`, XOR in `i` and the item. This is O(n) in the **worst case** with O(1) extra space. Adding the numbers up and subtracting would give the same answer on paper, but a sum of many large words can run past the width of a word; XOR cannot, as it never carries.

## The lowest set bit

Subtract 1 from a number that is not 0 and the lowest 1 becomes 0 while all the 0s below it become 1s; nothing above it changes (arithmetic). So `n & (n - 1)` is `n` with its lowest set bit cleared, and it is 0 exactly when `n` had one set bit or none. The kernel uses it to test for a power of two: "is_power_of_2() - check if a value is a power of two", and the body is one line:

```c
return (n != 0 && ((n & (n - 1)) == 0));
```

([include/linux/log2.h, lines 37 to 47](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/log2.h#L37-L47); comment markers dropped.) The comment is "Determine whether some value is a power of two", and the `n != 0` is there because 0 also leaves 0 after the AND, and is not one. In the Problems the word is unsigned: 2147483648, which is -2147483648 read as signed, is a power of two.

The other half of the trick is the lowest bit itself. In two's complement, `-n` is every bit of `n` flipped, plus 1 (arithmetic on the definition in the first Chapter). The flip makes the lowest 1 a 0 with 1s below it, and the +1 carries up through those 1s and sets that bit again. Above it everything stays flipped, so `n & -n` keeps only the lowest set bit. The Problem `lowbit` has two commands, `lowbit` and `pow2`, and each is O(1) per word in the **worst case**.

## Counting bits without counting them

The last Problem, `countbits`, asks for the number of set bits in every number from 0 to N. The lowest-set-bit move gives a recurrence: clearing the lowest set bit of `i` gives a smaller number with one bit fewer, so `bits[i] = bits[i & (i - 1)] + 1`, with `bits[0] = 0`. Each entry is one table read, one AND and one add: O(N) in the **worst case**, with O(N) space for the table. Computing the weight of each number separately costs O(1) per number as well, with a fixed word size, so the gain is not a better bound but a simpler way to see it: the answer for `i` is built from one already known.

## What the Problems build

`recover` XORs the words together. `missing` XORs them against their positions. `lowbit` prints the lowest set bit of each word, and `pow2` says which words are powers of two. `countbits` prints the weights of 0 to N from the recurrence. Every one still reads the same sequence, so the commands of the earlier Chapters keep working beside them.
