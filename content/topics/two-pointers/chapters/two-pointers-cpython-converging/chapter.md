# CPython: two ends, moving in

Most code walks a sequence with one index. Two pointers means holding two indices into the same sequence, each with its own rule for when it moves. This Topic reads four places where real code does that. In this Chapter the two indices start at opposite ends and move toward each other, in CPython 3.13.0, the standard Python interpreter. In the Problems you build the same moves on a sequence of integers.

## Reversing: swap from both ends

The Python docs describe `list.reverse()` in one line: "Reverse the elements of the list in place." ([Tutorial, More on Lists, Python 3.13](https://docs.python.org/3.13/tutorial/datastructures.html)) The reference for mutable sequences gives the reason for working in place: "This method maintains economy of space when reversing a large sequence." ([Standard Library, Built-in Types, `sequence.reverse()`, Python 3.13](https://docs.python.org/3.13/library/stdtypes.html))

The work is done by a small C function that takes a pointer to the first slot, `lo`, and a pointer just past the last, `hi`:

```c
--hi;
while (lo < hi) {
    PyObject *t = *lo;
    *lo = *hi;
    *hi = t;
    ++lo;
    --hi;
}
```

([Objects/listobject.c, lines 1530 to 1544](https://github.com/python/cpython/blob/v3.13.0/Objects/listobject.c#L1530-L1544)) `list.reverse` calls it only when the list has more than one item. ([lines 3144 to 3151](https://github.com/python/cpython/blob/v3.13.0/Objects/listobject.c#L3144-L3151))

Read it as two pointers that start at the two ends and swap what they point at. Each pass puts two items where they belong, then both pointers step inward. They meet or cross after half the items, so the loop swaps at most n/2 times, which is O(n) in the **worst case**, and it needs one temporary slot, so O(1) extra space. If the length is odd, the middle item is reached when `lo == hi`, the condition `lo < hi` is false, and it stays where it is, which is right.

The decision CPython made is to swap inside the one block of slots instead of building a second, reversed block. The docs' own reason for that is space: no copy of the list is made.

## Trimming: two scans that must not cross

`str.strip()` removes whitespace from both ends of a string and keeps what is between: "Return a copy of the string with the leading and trailing characters removed." ([Standard Library, Built-in Types, `str.strip`, Python 3.13](https://docs.python.org/3.13/library/stdtypes.html)) The function behind it is `do_strip`. For a string of plain ASCII characters it uses two indices (`striptype` says which ends to strip; `str.strip` passes `BOTHSTRIP`, [line 12222](https://github.com/python/cpython/blob/v3.13.0/Objects/unicodeobject.c#L12222), and with no argument it reaches `do_strip`, [line 12203](https://github.com/python/cpython/blob/v3.13.0/Objects/unicodeobject.c#L12203)):

```c
i = 0;
if (striptype != RIGHTSTRIP) {
    while (i < len) {
        Py_UCS1 ch = data[i];
        if (!_Py_ascii_whitespace[ch])
            break;
        i++;
    }
}

j = len;
if (striptype != LEFTSTRIP) {
    j--;
    while (j >= i) {
        Py_UCS1 ch = data[j];
        if (!_Py_ascii_whitespace[ch])
            break;
        j--;
    }
    j++;
}
```

([Objects/unicodeobject.c, `do_strip`, lines 12136 to 12156](https://github.com/python/cpython/blob/v3.13.0/Objects/unicodeobject.c#L12136-L12156))

The left index `i` moves right until it meets something that is not whitespace. The right index `j` then moves left, but only while `j >= i`. That guard is what makes the two scans safe: if the string is all whitespace, `i` ends at `len`, `j` starts below it, the right-hand loop does not run, and the result is empty. Without the guard, `j` would walk back across the part `i` already read.

Together the scans read each character at most once, plus the one where each stops, so the cost is O(n) in the **worst case** (an all-whitespace string), and it is constant for a string with no padding. Notice what the function does not do: it never looks at the middle of the string. Strings in CPython are immutable, so `do_strip` returns a copy of the part between `i` and `j`; the Problem works on a sequence you can change, so it shrinks the sequence instead.

## Sorted data: why you can throw an end away

Reverse and trim never compare two items to each other. Many questions about **sorted** data can use the same two pointers, and there the order gives a reason to move one of them. This section is an argument, not a claim about CPython.

Say a sorted sequence has `lo` at the left end and `hi` at the right end, and you want two items that add up to a target. Look at the sum at `lo` and `hi`.

- If the sum is too small, then `lo` cannot be part of any answer. Pair it with the biggest item that is still allowed, the one at `hi`, and it is already too small; every other partner is smaller or equal. So `lo` moves right.
- If the sum is too big, then `hi` cannot be part of any answer, by the same argument, and it moves left.
- If it is equal, you have an answer.

Every step rules out one item for good, so the pointers meet after at most n - 1 steps: O(n) in the **worst case**, with O(1) extra space. Trying every pair instead is O(n²). The same idea inside a loop over the first item solves "find three that add up to a target" in O(n²) in the **worst case**.

Take care about what the order bought. It let you say "this end can never be part of an answer" about an item you had only compared once. On unsorted data no single comparison can tell you that. Some Problems here (the extras) show a different reason to move a pointer, based on a bound instead of order.

## What the Problems build

You grow one program that reads commands about a sequence of integers. The first Problems add `reverse`, `trim` and `palindrome`, the moves above. Then `pairsum` and `triples` use order to decide which end to move.
