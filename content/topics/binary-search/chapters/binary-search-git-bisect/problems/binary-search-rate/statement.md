Add a search over a number that is not an index. Keep every earlier command working.

A worker drains piles of items. A pile is processed in whole hours: in one hour the worker handles up to `R` items from one pile and then stops, even if the pile ran out sooner, and starts the next pile in the next hour. At rate `R`, a pile of `p` items therefore takes `ceil(p / R)` hours (`p / R` rounded up), and the piles are done one after another. You will use the array from the `array` command as the pile sizes.

| Command | What it does | Prints |
|---|---|---|
| `rate H` | Finds the smallest whole rate `R >= 1` at which all the piles together take at most `H` hours. | `R` |

For this command, the array holds between 1 and 20,000 pile sizes in any order (not sorted), and each pile size is between 1 and 1,000,000,000. `H` is at least the number of piles (a pile takes at least one hour) and at most 100,000,000,000,000. The answer is never more than the biggest pile, because at that rate every pile takes one hour.

## Example

Input:

```
array 30 11 23 4 20
rate 5
rate 6
rate 30
rate 72
```

Output:

```
30
23
4
2
```

With 5 piles and 5 hours, each pile gets one hour, so the rate has to cover the biggest pile: 30. At rate 4 the piles take 8 + 3 + 6 + 1 + 5 = 23 hours, which fits in 30, and at rate 3 they take 31, which does not; so `rate 30` is 4.
