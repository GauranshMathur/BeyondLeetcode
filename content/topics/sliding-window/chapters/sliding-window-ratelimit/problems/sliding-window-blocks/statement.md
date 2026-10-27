# Count per period, then reset

The Linux kernel limits how often a callback may run with one counter that it resets when a period has passed. You start the Build that holds the windows of this Topic.

The Build reads commands from standard input, one per line, and works on one **sequence** of integers. Blank lines are ignored. The sequence starts empty. Commands that print, print one line. In this Topic the sequence is a stream: item `i`, counting from 0, is what happened in second `i`, such as the number of requests that arrived.

| Command | What it does | Prints |
|---|---|---|
| `load v1 v2 ...` | Replaces the sequence with the given integers. With no integers, the sequence is empty. | nothing |
| `show` | Writes the sequence out. | the items, separated by single spaces; an empty line if the sequence is empty |
| `blocks K` | Cuts the sequence into consecutive **blocks** of `K` items: the first `K` items, the next `K`, and so on. The last block is shorter if the length is not a multiple of `K`. | the largest total of any one block; `0` if the sequence is empty |

`K` is at least 1 and may be larger than the sequence, in which case the whole sequence is one block. In this Problem and the next two, every item is a count, so it is 0 or more.

## Example

Input:

```
load 0 0 6 6 0 0 1
blocks 3
```

Output:

```
6
```

The blocks are `0 0 6`, `6 0 0` and `1`, with totals 6, 6 and 1. Twelve requests arrived in seconds 2 and 3, but they fell on two sides of a block boundary, so no block sees more than 6. The next Problem measures that burst.
