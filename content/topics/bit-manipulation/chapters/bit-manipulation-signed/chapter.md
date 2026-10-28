# Linux: reading a field as a signed number

A 32-bit word is 32 bits and nothing more. Whether it means 4294967295 or -1 is a matter of how you read it. This Chapter looks at that decision in two systems, Java and the Linux kernel (v6.6), and builds the first commands of the Topic's program: one that reads a short field of a word as a signed number, and one that adds with nothing but bit operations.

The program holds a **sequence of words**. A word is 32 bits, written in the program as a whole number from -2147483648 to 4294967295; the 32 bits are what is kept. The Problems grow this one program through the Topic.

## Two readings of the same bits

Java made one reading the only one for its integers: "The integral types are byte, short, int, and long, whose values are 8-bit, 16-bit, 32-bit and 64-bit signed two's-complement integers, respectively". ([Java Language Specification SE 21, section 4.2](https://docs.oracle.com/javase/specs/jls/se21/html/jls-4.html#jls-4.2)) An `int` runs "For int, from -2147483648 to 2147483647, inclusive". ([section 4.2.1](https://docs.oracle.com/javase/specs/jls/se21/html/jls-4.html#jls-4.2.1))

In **two's complement** the top bit of a 32-bit word counts for -2^31 instead of +2^31, and every other bit counts for what it always did. This is the definition of the representation, not a claim about Java. So `-1` is all 32 bits set, the same bits as 4294967295, and the word `10000000 00000000 00000000 00000000` is -2147483648. Add 2^32 to a negative number and you get the unsigned reading of the same bits. The program's `show` writes each word as a signed number and `ushow` writes it as an unsigned one; the bits under them are the same.

Reading the top bit as a sign has a consequence for shifting right. Java has two right shifts for it. "The value of n >> s is n right-shifted s bit positions with sign-extension." and "The value of n >>> s is n right-shifted s bit positions with zero-extension". ([section 15.19](https://docs.oracle.com/javase/specs/jls/se21/html/jls-15.html#jls-15.19)) Sign-extension means the new bits on the left are copies of the old top bit, so a negative number stays negative. Zero-extension fills them with 0. In the Problems, a "shift right with the sign copied down" is the first of these.

## What the kernel does with a short field

A small signed number can be packed into fewer bits than a whole word. To read one back as a signed number you have to copy its top bit into every bit above it. The kernel has a helper for that, and its comment says what it does: "sign_extend32 - sign extend a 32-bit value using specified bit as sign-bit". The index names the bit: "@index: 0 based bit index (0<=index<32) to sign bit". And the code is two shifts:

```c
__u8 shift = 31 - index;
return (__s32)(value << shift) >> shift;
```

([include/linux/bitops.h, lines 179 to 190](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/bitops.h#L179-L190); comment markers dropped.) The comment adds: "This is safe to use for 16- and 8-bit types as well." ([same lines](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/bitops.h#L179-L190))

Read the code with a field of `B` bits, so `index` is `B - 1` and `shift` is `32 - B`. The left shift moves the field's top bit up to bit 31 and pushes everything above the field off the end, so whatever junk was in the high bits is gone. The right shift then moves the field back down, and because the word is now read as signed, it copies bit 31 into the places it leaves empty. The decision is to do the whole job with two shifts and no branch, instead of masking the field and then testing its top bit to decide whether to subtract 2^B. The result is the same, and the cost is two operations per word: O(1) in the **worst case**. This is the Problem `signext`.

## Overflow: keeping the low 32 bits

A fixed width means a sum can be too big for it. Java does not stop it: "The integer operators do not indicate overflow or underflow in any way." Its own example multiplies 1000000 by itself and explains the answer: "The value -727379968 is the decimal value of the low 32 bits of the mathematical result, 1000000000000, which is a value too large for type int." ([section 4.2.2](https://docs.oracle.com/javase/specs/jls/se21/html/jls-4.html#jls-4.2.2)) The rule is that the result is the low 32 bits of the true answer, read as signed. 2147483647 + 1 comes out as -2147483648 because the true answer, 2147483648, has the bit pattern that Java reads as that.

Hardware adds bits, not numbers, and you can do it with the same operations the kernel's helper uses. Take two words `a` and `b`. The XOR `a ^ b` is the sum of each pair of bits with the carry thrown away. The AND `a & b` has a 1 exactly where two 1s meet and a carry is made, and that carry belongs one place to the left, so it is `(a & b) << 1`. Add the two parts the same way, and repeat until there is no carry left. This is arithmetic, not a claim about any system.

Each round moves every carry at least one place to the left, and a carry that leaves bit 31 is simply lost, which is the wrap. So after at most 32 rounds the carries are gone: each addition is O(1) in the **worst case**, 32 rounds at most. Summing n words this way is O(n) in the worst case. This is the Problem `wrapsum`.

## What the Problems build

You start one program that reads commands from standard input and keeps one sequence of words. `signext` reads the low `B` bits of every word as a signed number, the kernel's helper. `wrapsum` adds all the words and prints the sum read as signed, with the carries done by hand. The next Chapters use the same sequence as something else: an array of flags.
