The shrink step reuses the function that replaces the segment: it already adds `used` to `moved` and sets the new size, so growing and shrinking are counted the same way.

The two guards read in the order of the runtime's code. First the new size must not be under the minimum, which stops the segment ever going below 2,048. Then the stack must be using less than a quarter: `used < segment / 4`. Equal to a quarter is not enough.

Why a quarter and not a half? A stack of 4,096 bytes that is exactly half used would halve to 2,048 and be completely full. The next call would grow it back, and a program that calls and returns around that depth could copy the stack on every `gc` and every `call`. Shrinking only below a quarter leaves the halved stack less than half full, so it takes new calls to grow it again.

Complexity. `gc` is O(1) when it does nothing and O(used) when it moves the stack, **worst case**. A move on shrink means the stack was under a quarter full, so the bytes copied are small compared with the memory given back.
