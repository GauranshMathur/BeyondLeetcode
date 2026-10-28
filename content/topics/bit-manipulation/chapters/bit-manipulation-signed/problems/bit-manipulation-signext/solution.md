Shift by `32 - B`. A left shift by that much puts the field's top bit at bit 31 and drops every bit above the field. Read the result as a signed 32-bit number, and shift it right by the same amount: the shift copies the sign bit, so the field comes back down with its sign carried into the upper bits. This is the kernel's `sign_extend32`, with `index` equal to `B - 1`.

The Languages differ in what they hand you. Go has `uint32` and `int32`, so shift the `uint32` left, convert to `int32`, then shift right. TypeScript's `<<` and `>>` work on 32-bit signed integers already, so `(w << shift) >> shift` is the whole job; the words are kept as unsigned numbers and `w | 0` reads one as signed. Python integers have no width: mask the result of the left shift to 32 bits, subtract 2^32 if bit 31 is set, and then shift right (Python's `>>` copies the sign of a negative number).

Each word takes a fixed number of operations, so time is O(n) in the worst case for n words, and extra space is O(1) besides the output.

**An edge worth running.** With `B` = 32 the shift is 0 and the word is just read as signed. With `B` = 1 the field is one bit and the only values are 0 and -1.
