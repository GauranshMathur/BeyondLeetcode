# CPython sort: a stack that keeps an order

A stack does not have to hold what you give it. Some stacks hold only what still matters, and throw out an item when a newer one makes it obsolete. This Chapter reads one in CPython 3.13.0: the stack of runs that `list.sort` keeps while it works out which pieces to merge. The Problems build its rule, and then the same shape on its own.

## Runs and the pending stack

`list.sort` first finds **runs**, stretches of the list that are already in order. Then it merges runs until one is left. The notes beside the code say that "merging is always done on two consecutive runs at a time" ([Objects/listsort.txt, lines 338 to 339](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listsort.txt#L338-L339)), and say where the runs wait: "When a run is identified, its length is passed to found_new_run() to potentially merge runs on a stack of pending runs." ([lines 341 to 342](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listsort.txt#L341-L342))

The stack is a plain array in the sort's state: `int n; struct s_slice pending[MAX_MERGE_PENDING];` ([Objects/listobject.c, lines 1688 to 1689](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listobject.c#L1688-L1689)). Its size is fixed, and a comment says why that is enough: "For a list with n elements, this needs at most floor(log2(n)) + 1 entries even if we didn't force runs to a minimal length." ([lines 1629 to 1634](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listobject.c#L1629-L1634)) There is no growth to decide, because the rule below keeps the stack short.

The notes name the trade-off the stack manages: "We would like to delay merging as long as possible in order to exploit patterns that may come up later, but we like even more to do merging as soon as possible to exploit that the run just found is still high in the memory hierarchy. We also can't delay merging 'too long' because it consumes memory to remember the runs that are still unmerged, and the stack has a fixed size." ([listsort.txt, lines 342 to 347](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listsort.txt#L342-L347))

## A rule that was wrong, and a rule that can be proved

The first rule in this code was not simple: "The original version of this code used the first thing I made up that didn't obviously suck ;-) It was loosely based on invariants involving the Fibonacci sequence." It was also not right: "the intended invariants weren't actually preserved. Researchers discovered that when trying to complete a computer-generated correctness proof." ([listsort.txt, lines 349 to 355](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listsort.txt#L349-L355)) The fix spurred research into merge strategies. CPython 3.13.0 uses one called powersort, from Munro and Wild's paper "Nearly-Optimal Mergesorts" ([lines 363 to 367](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listsort.txt#L363-L367)).

The idea of powersort: give each run a small integer, its **power**, which is the depth of the node that joins it to the next run in an ideal binary merge tree: "power 1 is the root node, and the power increases by 1 for each level deeper in the tree." ([lines 378 to 380](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listsort.txt#L378-L380)) `powerloop` computes it from the start and lengths of two neighbouring runs and the length of the list ([listobject.c, lines 2553 to 2589](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listobject.c#L2553-L2589)). The Problem gives you the same computation in steps.

## The rule is a stack that pops while the top is out of order

Here is the whole merge decision, `found_new_run` ([lines 2606 to 2624](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listobject.c#L2606-L2624)):

- A new run of length `n2` has arrived. The power of the run on top of the stack is computed from it: `int power = powerloop(s1, n1, n2, ms->listlen);`.
- Then `while (ms->n > 1 && p[ms->n - 2].power > power) { merge_at(ms, ms->n - 2) }`. While the run under the top has a greater power, merge the top two runs.
- Then the top run's power is recorded and the caller pushes the new run ([lines 3056 to 3059](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listobject.c#L3056-L3059)).

The notes state the invariant that results: "A key invariant is that powers on the run stack are strictly decreasing (starting from the run at the top of the stack)." ([lines 426 to 427](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listsort.txt#L426-L427)) Read from the bottom, the powers go up. Anything that would break that order is merged away before the new run goes on. At the end of the sort a loop merges what is left until one run remains, `merge_force_collapse` ([lines 2631 to 2644](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listobject.c#L2631-L2644)).

That shape has a name: a **monotonic stack**. The stack is always kept in order, and each new item first pops everything that would break the order. It is easy to get wrong in two places. The check runs before the push, because the new item must not sit on top of what it outranks. And the loop must pop more than once, because one new item can invalidate many.

## What it costs

Each run is pushed once. Every pass through the `while` loop in `found_new_run` removes one entry from the stack, because `merge_at` joins the top two runs into one, and an entry can only be removed after it was pushed. So over a whole sort the loop runs at most as many times as there are pushes: the stack work per run is O(1) **amortised**, though a single run can trigger many merges, O(depth) in the **worst case**. The merges themselves cost much more than the stack bookkeeping, which is why the comment cares about their order. (The amortised count is our reading of the code, not a quote.)

Your Build handles run lengths only and prints each merge as the two lengths. The second Problem takes the pop-while-out-of-order loop and uses it on its own: for each value, how far ahead is the next larger one?
