# Python's itertools: positions, not values

Many search problems are really "list every way to pick or arrange these items". The shapes are few: choose some of the items (**subsets** and **combinations**), or put them in an order (**permutations**). Python ships all of them in the standard library, so its documentation has to say exactly which ones come out and in what order. This Chapter reads that documentation, from the CPython 3.13.0 source tree, as a specification. In the Problems you build the same lists with the choose, explore, undo loop, and your output has to match the order it states.

## The order is part of the contract

For `combinations`: "The combination tuples are emitted in lexicographic order according to the order of the input iterable." ([Doc/library/itertools.rst, lines 236 to 237](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Doc/library/itertools.rst#L236-L237); reST emphasis dropped.) `permutations` makes the same promise: "The permutation tuples are emitted in lexicographic order according to the order of the input iterable." ([lines 542 to 543](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Doc/library/itertools.rst#L542-L543); emphasis dropped.) **Lexicographic** means like words in a dictionary, with the input's own order as the alphabet: the tuple whose first differing item comes earlier in the input comes first. A search that tries the items left to right, and goes deeper before it tries the next item, meets the tuples in exactly this order (arithmetic on the loop: the first position is fixed to the earliest item for as long as that item has anything left to give).

## Position, not value

The rule that surprises people sits right below: "Elements are treated as unique based on their position, not on their value." ([lines 240 to 241](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Doc/library/itertools.rst#L240-L241)) So `permutations([1, 1, 2])` has 3! = 6 tuples, and each of the 3 distinct ones appears twice (arithmetic on the rule). A loop that follows the rule never compares values: it only asks which positions are taken. That choice makes the count depend only on the length, and the Problems keep it. The count of `combinations_with_replacement`, which lets an item be used more than once, is also free of the values: "(n + r - 1)! / r! / (n - 1)! when n > 0" ([lines 276 to 277](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Doc/library/itertools.rst#L276-L277); the formula's backticks dropped), a number that depends only on n and r.

## Counting what comes out

How much work is a search for permutations? The documentation says what the answer is made of: it is the output of `product` "where entries with repeated elements have been filtered out", and "which computes n! / (n - r)! when 0 ≤ r ≤ n or zero when r > n". ([lines 537 to 540](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Doc/library/itertools.rst#L537-L540); the roles and backticks around `product`, `math.perm` and the formula dropped.) Those are two ways to get the same list. Generating every tuple of length r from n items and throwing out the ones with a repeat looks at n^r tuples (arithmetic). The backtracking loop never builds a tuple with a repeat, because it skips the positions already taken as it goes, which is the pruning of the last two Chapters in its plainest form. It visits only the tuples that survive and their prefixes. With r equal to n there are n! complete tuples, and the whole tree has at most (r + 1) x n! / (n - r)! nodes, each costing an O(n) scan for an unused position, so the work is O(n x r x n! / (n - r)!) in the **worst case**.

For subsets there is a recipe in the same document: `powerset` takes the combinations of every length, shortest first. ([lines 968 to 971](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Doc/library/itertools.rst#L968-L971))

```python
def powerset(iterable):
    "powerset([1,2,3]) → () (1,) (2,) (3,) (1,2) (1,3) (2,3) (1,2,3)"
    s = list(iterable)
    return chain.from_iterable(combinations(s, r) for r in range(len(s)+1))
```

The Problem `subsets` asks for a different order from this recipe, one that falls straight out of the loop: print the current choice at every node of the tree, before its children. For `1 2 3` that gives `[]`, `[1]`, `[1 2]`, `[1 2 3]`, `[1 3]`, `[2]`, `[2 3]`, `[3]`: still lexicographic by position, with a prefix ahead of its extensions, rather than grouped by length. Both orders hold the same 2^n subsets. Building them costs O(n x 2^n) in the **worst case**, since there are 2^n subsets of up to n items each (arithmetic).

## Not the same code

The documentation also gives its own code for each function, and says what it is: "Roughly equivalent to". ([line 244](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Doc/library/itertools.rst#L244)) That code works on a list of indices that it moves forward, not on a recursion with an undo step. A loop with an undo step produces the same order, which the Tests check. That is the point of a specification: the contract is the order and the count, and the way to produce them is yours.

## What the Problems build

The Build keeps a list of integers, set by `load`. `subsets` prints every subset in the order above. `perms` prints every ordering of all the items, or of `R` of them, in the order `permutations` gives. The Extra Problem `sums` is Combination Sum: it uses `combinations_with_replacement`'s way of choosing, where an item may be taken again, and stops going deeper when the sum is already too big, which is the pruning of the second Chapter. All three treat items as unique by position.
