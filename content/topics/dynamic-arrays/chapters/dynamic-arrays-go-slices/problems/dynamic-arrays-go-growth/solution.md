One more branch in the function that picks the next capacity: below 256 it falls through to the doubling you already have, from 256 up it adds a quarter of the capacity plus 192.

The real `nextslicecap` has a loop and a first check for "the caller wants more than double". Neither can fire here, because `append` and `fill` add one item at a time to a full block, so one step is always enough.

Starting from 256 the growth factors are 2, 1.625, about 1.48, about 1.41, and they keep falling towards 1.25. Compare `copies` after `fill 200000 1`: 262,143 for `double`, 844,665 for `go`, 1,620,992 for `cpython`. All three rules multiply the capacity, so all three are O(1) amortised per append; the smaller the factor, the more copies and the less empty space.
