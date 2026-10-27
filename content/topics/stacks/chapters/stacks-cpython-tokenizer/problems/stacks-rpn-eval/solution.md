Use one stack of integers. A number goes on and updates the maximum size. An operator takes two values off, with the right one first, because it was pushed later, and puts one back.

Take care with the order of the operands: for `-` and `//` it matters. `5 2 -` is 5 - 2 = 3, so the value popped first (2) is the right operand.

The maximum is recorded after pushing a number, not after an operator, because an operator makes the stack smaller. The deepest size is therefore the largest value the stack size takes on.

Floor division is the part that differs between languages. Python's `//` rounds towards minus infinity already. In Go, `/` on integers truncates towards zero, so `-7 / 2` is `-3`: if the remainder is not 0 and the operands have different signs, subtract 1. In TypeScript, `Math.floor(a / b)` works for these values, which stay well inside the range where float division is exact enough for this.

Errors are found left to right, and the first one ends the program: `rpn 1 0 // 2` is a division by zero, not a leftover value. The check for exactly one value runs at the very end.

Complexity. O(n) time in the **worst case** for n tokens. The stack can hold up to about n/2 + 1 values, for a program with all its numbers first, so the space is O(n).
