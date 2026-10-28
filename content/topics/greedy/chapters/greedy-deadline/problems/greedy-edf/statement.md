# The least lateness

The Linux kernel's deadline scheduler runs "the task with the earliest scheduling deadline" ([Documentation/scheduler/sched-deadline.rst, v6.6](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/Documentation/scheduler/sched-deadline.rst#L59-L60)). This Problem is the simplest form of that choice, with no periods and no preemption. The kernel's own word for being late is **tardiness**, "the maximum between 0 and the difference between the finishing time of a job and its absolute deadline" ([same file](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/Documentation/scheduler/sched-deadline.rst#L360-L361)).

A **job list** is a second kind of state the Build can hold, next to the sequence. Every job has a **run time** and a **deadline**, both whole numbers of at least 1. All jobs are ready at time 0 and one CPU runs them one after another, each to the end, with no gap. If a job is the last of its first `j` jobs in the order chosen, it finishes at the sum of the run times of those jobs, and its tardiness is `max(0, finish - deadline)`.

Add:

| Command | What it does | Prints |
|---|---|---|
| `jobs r1 d1 r2 d2 ...` | Replaces the job list with the given jobs, each a run time followed by a deadline. With no numbers, the list is empty. | nothing |
| `edf` | Looks at every order in which the jobs could be run. | the smallest value that the largest tardiness of any job can have; `0` if some order meets every deadline, and if there are no jobs |

There are at most 2000 jobs. Run times are at most 1000000 and deadlines at most 1000000. The `load` sequence and its commands do not change.

## Example

Input:

```
jobs 4 6 3 5 2 12
edf
```

Output:

```
1
```

The jobs are (run 4, deadline 6), (run 3, deadline 5) and (run 2, deadline 12). Run in the order given, they finish at 4, 7 and 9, with tardiness 0, 2 and 0. Run in the order of deadlines, the second job first, they finish at 3, 7 and 9, with tardiness 0, 1 and 0. No order does better than 1: the first two jobs need 7 time units in all and the later of their deadlines is 6.
