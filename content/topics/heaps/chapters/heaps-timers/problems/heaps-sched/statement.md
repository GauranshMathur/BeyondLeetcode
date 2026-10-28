Turn the heap into a timer queue. A **timer** is an item with an **ID** and a key, the time it should fire. An ID is a word of at most 12 lowercase letters and digits.

| Command | What it does | Prints |
|---|---|---|
| `sched ID T` | Adds a timer with ID `ID` that fires at time `T`. It is a push, and the item remembers its ID. | nothing |
| `advance T` | Fires every timer whose time is at most `T`, earliest first. Each is removed from the heap, as `pop` would, and its ID is printed. | the IDs, one per line |

Timers with the same time fire in the order they were scheduled. The ticket already gives you that.

`pop`, `peek`, `size` and `show` work on timers as on any item and print keys, that is, times.

An input that uses `sched` makes every item with `sched`: it never mixes in `push`, `init` or `keep`. It never schedules an ID that is still queued. Times are between -1,000,000,000 and 1,000,000,000.

## Example

Input:

```
sched dns 30
sched tcp 10
sched log 30
sched ntp 20
advance 25
peek
advance 30
size
```

Output:

```
tcp
ntp
30
dns
log
0
```

`advance 25` fires `tcp` (time 10) and `ntp` (time 20). Then `dns` and `log` both have time 30, and `dns` was scheduled first.
