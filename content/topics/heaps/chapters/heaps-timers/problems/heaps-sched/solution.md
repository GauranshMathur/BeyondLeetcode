`sched` is the `push` you already have, with the timer's ID stored in the item. `advance` repeats one step: while the heap has a smallest item and its time is at most `T`, pop it and print its ID. Since the smallest item is always the one with the lowest time, and the ticket breaks ties, the output is in firing order.

Cost: `sched` is O(log n) comparisons in the **worst case**. An `advance` that fires `k` timers costs O(k log n) in the **worst case**, and if it fires none, O(1).
