# Which jobs to give up

When the CPU cannot meet every deadline, something has to give. The kernel's documentation says a task gets its run time within its deadline "if a proper "admission control" strategy" is used, and adds "clearly, if the system is overloaded this guarantee cannot be respected" ([sched-deadline.rst, v6.6](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/Documentation/scheduler/sched-deadline.rst#L61-L63)). This Extra Problem asks a question of its own, written for this Problem and not a description of the kernel's test: if the jobs that are given up never run, how many can still meet their deadlines?

It works on the job list, as `edf` does. All jobs are ready at time 0, one CPU runs the jobs it keeps one after another with no gap, and a job meets its deadline if it finishes at or before it. The jobs given up take no time.

Add:

| Command | What it does | Prints |
|---|---|---|
| `ontime` | Looks at every set of jobs that can be kept, and every order to run them in. | the largest number of jobs that can all meet their deadline; `0` if there are no jobs |

The limits on the job list are those of `edf`. A job whose run time is longer than its deadline can never meet it.

## Example

Input:

```
jobs 3 4 2 5 4 8 1 9 3 10
ontime
```

Output:

```
4
```

The jobs are (run 3, deadline 4), (2, 5), (4, 8), (1, 9) and (3, 10). All five need 13 time units and the last deadline is 10, so one job must go. Dropping the job with run time 4 leaves (3, 4), (2, 5), (1, 9) and (3, 10), which finish at 3, 5, 6 and 9 and meet every deadline.
