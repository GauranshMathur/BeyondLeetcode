Keep the loaded list as `values`, and a list `current` of the items chosen so far. A function `grow(start)`:

1. print `current` in square brackets;
2. for each position `i` from `start` to the end of `values`: add `values[i]` to `current` (**choose**), call `grow(i + 1)` (**explore**), then remove the last item of `current` (**undo**).

Call `grow(0)`. `load` only replaces the list, with the numbers it was given.

**Why it is right.** Each call prints exactly one subset, the one `current` holds, and the calls are in one to one with the subsets: a subset is the increasing list of its positions, and each position is added by one call after the one before it. A subset is printed before every subset that extends it because the print comes first, and among the extensions the loop goes by increasing position, which is the order required. Equal values at different positions are different positions, so they are listed separately.

**Cost.** There are 2^n subsets and each is printed in O(n), so the run is O(n x 2^n) in the **worst case**, and it cannot be less because that is the size of the output. Space is O(n) for the recursion and `current`.

The Reference Code formats a list in one helper, because `perms` and `sums` print their lines the same way.
