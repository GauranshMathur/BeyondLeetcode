# Climbing stairs, counted once

Python's `functools.cache` answers each call once and keeps the answer ([the Chapter](/chapters/dp-1d-functools) reads how). You start the Build that holds the programs of this Topic, and the first one counts the ways to climb a staircase without repeating work.

The Build reads commands from standard input, one per line, and works on one **sequence** of integers. Blank lines are ignored. The sequence starts empty. Commands that print, print one line. In this Chapter the sequence is the list of **step sizes** you may take: distinct positive integers.

| Command | What it does | Prints |
|---|---|---|
| `load v1 v2 ...` | Replaces the sequence with the given integers. With no integers, the sequence is empty. | nothing |
| `show` | Writes the sequence out. | the items, separated by single spaces; an empty line if the sequence is empty |
| `ways N` | Counts the ways to climb exactly `N` stairs when every move climbs one of the step sizes. Two ways are different if their moves differ, in order or in size. | the number of ways, modulo 1000000007 |

`N` is between 0 and 300. There is one way to climb 0 stairs: make no moves. If no moves add up to `N`, the answer is 0. A step larger than the stairs left is never taken. The number of ways grows quickly, so every answer is the remainder after dividing by 1000000007, the same in every Language. The sequence does not change.

A recursion that says "the ways to climb `N` are the ways to climb `N - step` for each step, added up" gives the right answer, but on `ways 60` with steps 1 and 2 it makes about 5 × 10^12 calls (arithmetic: 2 × fib(61) − 1), far more than a Test's time limit allows. The Tests include such inputs.

## Example

Input:

```
load 1 2
show
ways 4
```

Output:

```
1 2
5
```

The five ways to climb 4 stairs are 1+1+1+1, 1+1+2, 1+2+1, 2+1+1 and 2+2. The moves 1+1+2 and 1+2+1 count separately.
