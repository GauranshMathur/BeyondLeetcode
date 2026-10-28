# CPython: keeping only the largest n

A stream of a million readings arrives and you want the 3 largest. Sorting them all means holding all million, and the sort is O(m log m) comparisons in the **worst case** for `m` readings. A heap that never holds more than 3 is enough. This Chapter reads how CPython 3.13.0 does it in `heapq.nlargest`. In the Problem you keep the largest `N` keys of a stream and read the `N`-th largest at any moment.

## What nlargest promises

The documentation says what it returns: "Return a list with the n largest elements from the dataset defined by iterable." It says what that means: "Equivalent to: sorted(iterable, key=key, reverse=True)[:n]." ([heapq documentation, heapq.nlargest](https://docs.python.org/3.13/library/heapq.html#heapq.nlargest)) Then it says when not to use it: "The latter two functions perform best for smaller values of n. For larger values, it is more efficient to use the sorted() function." ([heapq documentation, heapq.nlargest](https://docs.python.org/3.13/library/heapq.html#heapq.nlargest)) The choice is to avoid sorting everything when `n` is small.

## A min-heap of the best n

This is the branch of `nlargest` that runs when no key function is given:

```python
it = iter(iterable)
result = [(elem, i) for i, elem in zip(range(0, -n, -1), it)]
if not result:
    return result
heapify(result)
top = result[0][0]
order = -n
_heapreplace = heapreplace
for elem in it:
    if top < elem:
        _heapreplace(result, (elem, order))
        top, _order = result[0]
        order -= 1
result.sort(reverse=True)
```

([Lib/heapq.py, lines 547 to 560](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/heapq.py#L547-L560)) The first `n` items go into `result` and `heapify` makes it a heap. Now `result[0]` is the smallest of the `n` items kept, and the code remembers its value in `top`. Every later item `elem` is compared only with `top`. If `top < elem`, the item belongs among the best `n` and the smallest has to go, so `_heapreplace`, which is `heapreplace` under a local name, swaps it in for the smallest. When it is not larger, nothing happens: an item equal to `top` does not replace it, because the test is strict. At the end the `n` items kept are sorted, and only those.

The heap is a **min**-heap although the job is to find the largest. The smallest of the best `n` is the one the next candidate has to beat, and that is the one a min-heap hands over in O(1) in the **worst case**. `heapreplace` is made for this. Its docstring says: "Pop and return the current smallest value, and add the new item." It continues: "This is more efficient than heappop() followed by heappush(), and can be more appropriate when using a fixed-size heap." ([Lib/heapq.py, lines 148 to 151](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/heapq.py#L148-L151))

What it costs for `m` items after the first `n`: `heapify` on the first `n` is O(n) in the **worst case**, and each of the others costs one comparison with `top` plus, when it is larger, a `heapreplace` of O(log n) comparisons in the **worst case**. That makes O(n + m log n) comparisons in the **worst case**, reached when every item is larger than the one before it. The heap holds `n` items, so the space is O(n) however long the input is.

## The stream version

`nlargest` reads its input once and returns. A stream has no end, so the Build keeps the heap alive and lets you ask at any time. With the heap full at `N` items, the root is the smallest of the `N` largest keys so far, which is the `N`-th largest key. Reading it is a `peek`, O(1) in the **worst case**.

Problem 4 adds `keep N` to the Build: once it is set, a `push` of a key larger than the root replaces the root, and any other `push` is ignored, as `nlargest`'s loop does.

## An Extra that is not from a real system

The Extra Problem `track` asks for a running median with two heaps: a heap for the smaller half of the keys and another for the larger half, so the middle is always at the top of one of them. That is a technique this Topic teaches, not something this Chapter read in a system, so it makes no claim about one.
