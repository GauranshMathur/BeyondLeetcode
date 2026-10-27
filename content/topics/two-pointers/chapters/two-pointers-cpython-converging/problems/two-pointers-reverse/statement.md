# Reverse in place

CPython reverses a list by swapping items from both ends, not by building a second list. You start the Build that holds the moves of this Topic.

The Build reads commands from standard input, one per line, and works on one **sequence** of integers. Blank lines are ignored. The sequence starts empty. Commands that print, print one line.

| Command | What it does | Prints |
|---|---|---|
| `load v1 v2 ...` | Replaces the sequence with the given integers. With no integers, the sequence is empty. | nothing |
| `show` | Writes the sequence out. | the items, separated by single spaces; an empty line if the sequence is empty |
| `reverse` | Reverses the sequence in place. | nothing |

Reverse with two indices, one at each end, that swap and move inward. The Tests only see the output, so they cannot tell whether you copied the sequence. Doing it in place is the point of the Problem.

## Example

Input:

```
load 1 2 3 4 5
reverse
show
```

Output:

```
5 4 3 2 1
```

`reverse` swaps 1 with 5, then 2 with 4. The middle item, 3, stays where it is.
