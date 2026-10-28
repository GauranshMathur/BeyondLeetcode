# PyTorch: choosing what to keep under a memory budget

A table can have an item on one axis and an amount on the other. This Chapter reads one in PyTorch, v2.7.0 (the commit `1341794`). PyTorch's compiler has a setting, `activation_memory_budget`, and its comment says what the setting does: "This knob controls the partitioner to make that tradeoff for you, choosing the fastest option that saves less activations than the memory budget." ([torch/_functorch/config.py, lines 116 to 117](https://github.com/pytorch/pytorch/blob/134179474539648ba7dee1317959529fbd0e7f89/torch/_functorch/config.py#L116-L117); the comment markers dropped) The comment goes on to name the method: "It solves a 0-1 knapsack to find the minimum recompute necessary to stay below the activation memory budget." ([lines 123 to 124](https://github.com/pytorch/pytorch/blob/134179474539648ba7dee1317959529fbd0e7f89/torch/_functorch/config.py#L123-L124); the comment markers dropped)

## The question

In a **0-1 knapsack** you have items, each with a **weight** and a **value**. You choose some, each at most once ("0-1"), so that the weights add up to at most a **capacity** and the values add up to as much as possible. PyTorch's items are the operations whose results it may either keep or recompute. Their weights and values are built in two lines:

```python
memories_banned_nodes = [
    get_normalized_size(_size_of(i)) for i in all_recomputable_banned_nodes
]
runtimes_banned_nodes = [
    estimate_runtime(node) for node in all_recomputable_banned_nodes
]
```

([torch/_functorch/partitioners.py, lines 1752 to 1757](https://github.com/pytorch/pytorch/blob/134179474539648ba7dee1317959529fbd0e7f89/torch/_functorch/partitioners.py#L1752-L1757); indentation reduced) The weight of an item is the size of its result, normalised. Its value is its estimated runtime, the work saved by keeping the result instead of recomputing it (reading of the names; the solvers call the two outcomes `items_to_save` and `items_to_allow_recomputing`, [knapsack.py, lines 15 to 16](https://github.com/pytorch/pytorch/blob/134179474539648ba7dee1317959529fbd0e7f89/torch/_functorch/_activation_checkpointing/knapsack.py#L15-L16)). The capacity is the budget.

## Three solvers

The setting that picks the solver says: "By default we use a quantized DP solution ("dp"). The other approaches are a "greedy" and a "ilp" (which has a scipy dependency)." ([config.py, lines 135 to 137](https://github.com/pytorch/pytorch/blob/134179474539648ba7dee1317959529fbd0e7f89/torch/_functorch/config.py#L135-L137); the comment markers dropped) The greedy one is short. It sorts the items by the ratio of runtime to memory, best first, "Sort items based on the ratio of runtime to memory in descending order", and then takes each item that still fits ([torch/_functorch/_activation_checkpointing/knapsack.py, lines 10 to 24](https://github.com/pytorch/pytorch/blob/134179474539648ba7dee1317959529fbd0e7f89/torch/_functorch/_activation_checkpointing/knapsack.py#L10-L24); the comment marker dropped). A ratio rule is not always right. With a capacity of 8 and three items of (weight, value) (5, 10), (4, 7) and (4, 7), the first has the best ratio, 2 against 1.75, and takes 5 of the 8, after which neither of the others fits: total 10. The two 4s together weigh 8 and are worth 14 (arithmetic, and the first Example below). Finding the best set needs the table.

## The table

The table has to be indexed by whole numbers, and memory is a fraction, so the solver scales it first: "Scaling factor to convert floating point weights to integers", with `S = 10000` ([lines 67 to 68](https://github.com/pytorch/pytorch/blob/134179474539648ba7dee1317959529fbd0e7f89/torch/_functorch/_activation_checkpointing/knapsack.py#L67-L68); the comment marker dropped). A comment names what follows: "Quantized pseudopolynomial DP for 0-1 Knapsack", with `quantized_max_memory = int(round(max_memory * S))` ([lines 76 to 77](https://github.com/pytorch/pytorch/blob/134179474539648ba7dee1317959529fbd0e7f89/torch/_functorch/_activation_checkpointing/knapsack.py#L76-L77); the comment marker dropped). The table has a row for every number of items considered, from none to all `n`, and a column for every whole capacity from 0 to the largest:

```python
dp = torch.zeros(
    (n + 1, quantized_max_memory + 1), dtype=torch.float32, device="cpu"
)
```

([lines 85 to 87](https://github.com/pytorch/pytorch/blob/134179474539648ba7dee1317959529fbd0e7f89/torch/_functorch/_activation_checkpointing/knapsack.py#L85-L87)) Cell `dp[i][j]` is the most runtime that the first `i` items can hold within `j` units of memory (reading of the fill below). The loop first copies the row above, "Copy the previous row" with `dp[i, :] = dp[i - 1, :]` ([lines 93 to 94](https://github.com/pytorch/pytorch/blob/134179474539648ba7dee1317959529fbd0e7f89/torch/_functorch/_activation_checkpointing/knapsack.py#L93-L94); the comment marker dropped): leaving item `i` out. Then, "Update dp[i, j] for all j >= current_memory" ([line 96](https://github.com/pytorch/pytorch/blob/134179474539648ba7dee1317959529fbd0e7f89/torch/_functorch/_activation_checkpointing/knapsack.py#L96); the comment marker dropped), it takes the better of leaving it and taking it:

```python
dp[i, current_memory:] = torch.maximum(
    dp[i - 1, current_memory:],
    dp[i - 1, :-current_memory] + current_runtime,
)
```

([lines 100 to 103](https://github.com/pytorch/pytorch/blob/134179474539648ba7dee1317959529fbd0e7f89/torch/_functorch/_activation_checkpointing/knapsack.py#L100-L103); indentation reduced) Taking item `i` adds its value to the best that the first `i - 1` items did in the room that is left. Both terms read row `i - 1` and neither reads row `i`, so an item cannot be taken twice. That is what "0-1" means in the table. A table that read its own row, `dp[i][j - weight]`, would allow an item again and again, which is the unbounded kind of knapsack, and the two Extra Problems build on that difference.

The cost follows from the shape. There are `n + 1` rows and about `S` times the capacity columns, each cell O(1), so time and space are O(n × W) in the **worst case**, where W is the capacity as a number. The source's word for it is "pseudopolynomial" ([line 76](https://github.com/pytorch/pytorch/blob/134179474539648ba7dee1317959529fbd0e7f89/torch/_functorch/_activation_checkpointing/knapsack.py#L76)): the table grows with the value of the capacity, not with the length of its digits, so a capacity ten times larger costs ten times more even though it is one digit longer. A larger `S` would give a finer grid and a wider table (arithmetic on `quantized_max_memory = int(round(max_memory * S))`).

## Walking back, and the row the code keeps

To name the items, the code walks back from the last row and the full capacity: "Backtrack to find the items included in the knapsack" ([line 105](https://github.com/pytorch/pytorch/blob/134179474539648ba7dee1317959529fbd0e7f89/torch/_functorch/_activation_checkpointing/knapsack.py#L105); the comment marker dropped):

```python
j: int = quantized_max_memory
for i in range(n, 0, -1):
    if dp[i][j] != dp[i - 1][j]:
        saved_items.append(i - 1)  # Include this item (indexing from 0)
        j -= int(quantized_memory[i - 1].item())
    else:
        recomputable_items.append(i - 1)
```

([lines 108 to 114](https://github.com/pytorch/pytorch/blob/134179474539648ba7dee1317959529fbd0e7f89/torch/_functorch/_activation_checkpointing/knapsack.py#L108-L114); indentation reduced) There is no direction table as in [Hunspell](/chapters/dp-2d-hunspell). When a cell differs from the one above it, the item must have been taken, so the walk records it and moves left by its weight. This needs every row, so the whole table stays in memory. The source knows the price: "I think if needed, this memory can be optimized with sliding window trick + Hirschberg trick" ([lines 82 to 83](https://github.com/pytorch/pytorch/blob/134179474539648ba7dee1317959529fbd0e7f89/torch/_functorch/_activation_checkpointing/knapsack.py#L82-L83); the comment markers and the name in the `TODO` dropped). The last Chapter reads the sliding window.

## What the Problems build

`items w1 v1 w2 v2 ...` replaces the list of items, each a weight and a value. `keep CAP` prints the most value within the capacity, each item at most once. The Extra Problems read the weights as coin values and as numbers: `ways` counts the ways to pay an amount, using each weight as often as you like, and `signs` counts the ways to give every weight a plus or a minus so that they add up to a target.
