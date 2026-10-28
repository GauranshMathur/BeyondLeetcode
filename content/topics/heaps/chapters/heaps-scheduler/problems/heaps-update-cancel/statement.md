Timers get moved and cancelled. A heap cannot search, so to change a timer you must first know where it is.

| Command | What it does | Prints |
|---|---|---|
| `update ID T` | Changes the time of the queued timer `ID` to `T`. The timer keeps its ticket. | nothing, or `error` |
| `cancel ID` | Removes the queued timer `ID` from the heap. | nothing, or `error` |

Both print `error` when no queued timer has that ID. A timer is queued from `sched` until it fires or is cancelled; after that its ID is free to use again in a `sched`.

To restore the heap after `update`, fix the item where it is: move it down from its place, with the hole that starts there, as `init` does. If it ended up exactly where it started, move it up instead, as far as it needs to go, up to index 0.

`cancel` takes the last item out of the array and puts it where the cancelled timer was. If the cancelled timer was the last item, there is nothing more to do. Otherwise the item that moved is fixed in the same way as after `update`.

Finding the timer by ID must not need a pass over the array. Keep a map from each queued ID to its timer, have every timer know its own index, and write the new index each time an item moves.

## Example

Input:

```
sched a 50
sched b 40
sched c 30
sched d 20
show
update a 10
show
cancel c
show
update zzz 5
cancel c
```

Output:

```
20 30 40 50
10 20 40 30
10 20 40
error
error
```

`update a 10` makes `a`, the last item of the array, the smallest, so it climbs to the top. `cancel c` removes the last item of the array, so nothing else has to move. The two `error` lines are `zzz`, which was never scheduled, and `c`, which is no longer queued.
