# Give each interval a room

`depth` says how many rooms are needed. This Extra Problem branches off `depth` and asks which room each interval gets. Nothing here flows into the Core Problems after it.

Add:

| Command | What it does | Prints |
|---|---|---|
| `rooms` | Treats every interval that `add` and `place` have put in, as given, as a meeting that needs one room for every number from `lo` to `hi`. The meetings are placed one by one in order of `lo`, and among equal `lo` the one added first goes first. A meeting takes the lowest-numbered room in which every meeting placed so far ends before its `lo`. If no room fits, it opens the next room. Rooms are numbered from 1. | for each interval, in the order they were added, the number of its room, separated by single spaces; `none` if no interval has been added |

Two meetings that share a number cannot use the same room. The meeting `3 5` and the meeting `5 8` cannot. `3 5` and `6 8` can. `rooms` changes nothing.

## Example

Input:

```
add 1 4
add 2 6
add 5 8
add 10 12
rooms
```

Output:

```
1 2 1 1
```

`1 4` takes room 1. `2 6` starts while room 1 is busy, so it opens room 2. `5 8` starts after `1 4` has ended, so room 1 is free again and is the lowest. `10 12` starts after both rooms are free, and takes the lowest, room 1.
