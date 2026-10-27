Keep `s[0..2]`, each a (time, value) pair, all (0, 0). For each item `(t, m)`, follow the four steps in the statement. Step 1 returns early with `m`. Steps 2 and 3 change the samples, and step 4 appends `s[0].value` to the output.

**Why it matches the kernel.** The steps are `minmax_running_max` followed by `minmax_subwin_update`, line for line. The first condition is `val.v >= m->s[0].v || val.t - m->s[2].t > win`, the next two are the `if` and `else if` that set the third and the second, and `minmax_subwin_update` is step 3. The expected output of the Tests was produced by compiling the kernel's `lib/win_minmax.c` and running it on the same inputs.

**Cost.** Each item does a constant number of comparisons and assignments, so time is O(n) in the **worst case** and O(1) per item. Extra space is O(1): three samples. `windowmax` needs O(K) in the worst case for its queue.

**What it gets wrong.** On the example, the filter says 4 at time 6 and the exact maximum is 7. The 7 at time 2 arrives one tick after the best, which is not more than a quarter of the window (`4 / 4 = 1`), so it is not taken as the second choice. When the 9 ages out, the filter has only the 4 from time 3 to fall back on. On random inputs it is right most of the time and wrong now and then, which is the trade the Chapter describes.
