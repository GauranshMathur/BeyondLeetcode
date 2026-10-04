One more branch in the function that picks the next capacity. Note that this rule uses the **length** the list is about to have, where `double` and `exact` use the old capacity.

Appending one at a time gives the capacities 4, 8, 16, 24, 32, 40, 52, 64, 76, the same numbers as the comment in CPython's source that the Chapter quotes. If you have Python 3.13 or 3.14 at hand you can watch a real list do it: `sys.getsizeof(a)` goes up by 8 bytes for every slot on a 64-bit build, and it jumps at the same lengths.

Run `fill 200000 1` under each rule and compare `copies`: 262,143 for `double`, 1,620,992 for `cpython`. That is about 1.3 and 8.1 copies per append. CPython's rule adds roughly one eighth each time, so it changes blocks far more often than doubling does, and in exchange never leaves much more than one eighth of the block empty.

Both are O(1) amortised per append: the total grows in step with n. The constant is what differs.
