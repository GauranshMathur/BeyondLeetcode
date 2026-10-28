# CPython: integers with no ceiling

Every integer type has to answer one question before anything else: what happens when a result does not fit? A language can wrap the answer, refuse it, or make room for it. Go wraps. CPython, the standard Python interpreter, makes room. This Chapter reads both rules, in the Go 1.22.0 language specification and in CPython 3.13.0. In the Problems you build the wrapping answer first, then the one that makes room.

## Go: the answer wraps

Go's `int32` is a signed integer with 32 bits. The specification says that "The value of an n-bit integer is n bits wide and represented using two's complement arithmetic." ([Go 1.22.0 specification, Numeric types](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/doc/go_spec.html#L873-L876)) Its range is "the set of all signed 32-bit integers (-2147483648 to 2147483647)". ([same file, line 861](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/doc/go_spec.html#L861))

An addition that goes past that range does not fail. For unsigned types the specification says the operations are computed modulo 2^n for an n-bit type: "Loosely speaking, these unsigned integer operations discard high bits upon overflow, and programs may rely on "wrap around"." ([Integer overflow](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/doc/go_spec.html#L5003-L5004)) For signed types it says the result "exists and is deterministically defined by the signed integer representation, the operation, and its operands", and that "Overflow does not cause a run-time panic." ([lines 5010 to 5012](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/doc/go_spec.html#L5010-L5012))

Work one case through. In `int32`, `2147483647 + 1` has the true sum 2,147,483,648, which is 2^31. With two's complement, the stored result is the number in range that differs from the true sum by a multiple of 2^32, and that number is -2,147,483,648. This is the Chapter's arithmetic, not a quote from the specification, and Problem 1 asks you to reproduce it. The program keeps running with a wrong answer. That is the price of a fixed width: the caller has to know the range.

## Python: no ceiling

Python's documentation states the opposite rule: "Integers have unlimited precision." ([Built-in types, Numeric Types, Python 3.13](https://docs.python.org/3.13/library/stdtypes.html#numeric-types-int-float-complex)) Memory is handed out in blocks of a fixed size, so an integer with no ceiling has to be stored as a run of pieces, and the interpreter has to say how big a piece is. The documentation of `sys.int_info` does: "Python integers are stored internally in base 2**int_info.bits_per_digit." ([sys.int_info, Python 3.13](https://docs.python.org/3.13/library/sys.html#sys.int_info.bits_per_digit))

The code that defines the pieces is in one header. "Long integers are made up of a number of 30- or 15-bit digits, depending on the platform." ([Include/cpython/longintrepr.h, lines 66 to 67](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Include/cpython/longintrepr.h#L66-L67)) On the 30-bit platform the code is `typedef uint32_t digit;` and `#define PyLong_SHIFT    30`. ([lines 43 to 47](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Include/cpython/longintrepr.h#L43-L47)) A **digit** here is one piece of the number, stored in 32 bits but holding only 30.

The comment gives the rule that ties the pieces to the value: "The absolute value of a number is equal to SUM(for i=0 through ndigits-1) ob_digit[i] * 2**(PyLong_SHIFT*i)". ([lines 70 to 71](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Include/cpython/longintrepr.h#L70-L71)) So the first digit counts ones, the second counts 2^30s, the third counts 2^60s, and so on. The number 2^64 is 16 × 2^60, so it is three digits: 0, 0 and 16.

## Why 30 bits and not 32

Multiplying two digits gives a product of up to 60 bits, and adding what was already there plus a carry needs a little more. The header says what the types must hold: "Type 'digit' should be able to hold 2*PyLong_BASE-1, and type 'twodigits' should be an unsigned integer type able to hold all integers up to PyLong_BASE*PyLong_BASE-1." ([lines 17 to 19](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Include/cpython/longintrepr.h#L17-L19)) With `PyLong_BASE` equal to 2^30, a `digit` has two bits to spare and the double-width type, `uint64_t`, has four. Those spare bits are where carries live.

## Multiplying digit by digit

The routine that multiplies two numbers the way you did on paper at school is named for it: "Grade school multiplication, ignoring the signs." ([Objects/longobject.c, lines 3826 to 3828](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/longobject.c#L3826-L3828)) Its inner loop, run once for each digit of the first number and over every digit of the second, is three lines:

```c
carry += *pz + *pb++ * f;
*pz++ = (digit)(carry & PyLong_MASK);
carry >>= PyLong_SHIFT;
```

([lines 3914 to 3916](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/longobject.c#L3914-L3916))

Read it as: `f` is one digit of the first number and `*pb` one digit of the second. Multiply them, add the digit already sitting in the product (`*pz`) and the carry from the step before. Keep the low 30 bits as the new digit (`carry & PyLong_MASK`), and carry the rest (`carry >>= PyLong_SHIFT`) to the next position.

The cost follows from the loops. The inner loop runs once for each pair of one digit from each number, so a number of n digits times one of m digits does n × m digit multiplications whatever the values are, and the school algorithm is O(n × m) in the worst case. Python does not use it forever: "For int multiplication, use the O(N**2) school algorithm unless both operands contain more than KARATSUBA_CUTOFF digits (this being an internal Python int digit, in base BASE)." The next line is `#define KARATSUBA_CUTOFF 70`. ([lines 69 to 73](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/longobject.c#L69-L73)) Seventy digits of 30 bits is 2,100 bits, about 630 decimal digits. Past that, another routine takes over, whose comment begins "Karatsuba multiplication." ([lines 3964 to 3965](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/longobject.c#L3964-L3965)) Your Build stays on the school algorithm, which is the right one for any number you will type into a test.

## What the Build does

Problem 1 gives you the Go side: operations that wrap at 32 bits, written on top of a language whose integers never do. Problem 2 gives you the Python side: two numbers that arrive as text and are too long for any machine integer, multiplied by the loop above. Your digits are one decimal digit per slot, not 30 bits, because the input is already a string of decimal digits. The loop does not change: multiply, add what is there, keep one digit, carry the rest. With base 10 the carry never passes 9: a slot holds at most 9, a carry at most 9, and 9 + 9 × 9 + 9 = 99.

The cost you will see is the cost the code shows: n × m digit steps, and n + m slots of memory for the product.
