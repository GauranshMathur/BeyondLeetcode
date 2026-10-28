Cancelling in the middle of a heap costs work. Another way is to mark the timer and leave it where it is.

| Command | What it does | Prints |
|---|---|---|
| `drop ID` | Marks the queued timer `ID` as **dropped**. It stays in the array, so `size` and `show` still count it, but it never fires. | nothing, or `error` |

A dropped timer is no longer queued: `update`, `cancel` and `drop` with its ID print `error`, and `sched` may use the ID again for a new timer. An input that uses `drop` never uses `pop` or `peek`.

`advance T` now begins with a clean-up, once, before it fires anything:

- If the array holds **more than 100** items and **more than half** of them are dropped, rebuild: take the items that are not dropped, in their order in the array, and arrange them into a heap exactly as `init` does.
- Otherwise, while the item at index 0 is dropped, remove it as `pop` would.

Then it fires timers as before, except that a dropped timer it reaches is removed without printing anything.

## Example

Input:

```
sched a 10
sched b 20
sched c 30
drop a
size
advance 0
size
show
drop c
advance 15
size
advance 20
size
```

Output:

```
3
2
20 30
2
b
1
```

`drop a` leaves `a` in the array, so `size` still says 3. The `advance 0` fires nothing, but its clean-up removes `a` from the top. `drop c` leaves `c` in the array. `advance 15` fires nothing, and `advance 20` fires `b`. The dropped `c` is not due (time 30), so it stays and `size` is 1.
