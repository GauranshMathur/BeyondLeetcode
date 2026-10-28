# Linux: the earliest deadline runs next

A CPU has several jobs, each with a deadline, and can run only one at a time. Which runs next? This Chapter reads the answer the Linux kernel gives for its deadline scheduling class, which is a greedy rule: look only at the deadlines and take the earliest. The sources are the kernel's scheduler documentation and `kernel/sched/deadline.c`, both at the commit of the tag v6.6 (`ffc253263a1375a65fa6c9f62a893e9767fbebfa`).

## The rule

The documentation opens with the name of the rule: "The SCHED_DEADLINE policy contained inside the sched_dl scheduling class is basically an implementation of the Earliest Deadline First (EDF) scheduling algorithm" ([sched-deadline.rst, lines 40 to 42](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/Documentation/scheduler/sched-deadline.rst#L40-L42)). It says what that means for the next task: "the task with the earliest scheduling deadline is selected for execution". ([lines 59 to 60](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/Documentation/scheduler/sched-deadline.rst#L59-L60)) The documentation says how that deadline comes about: "every time the task wakes up, the scheduler computes a "scheduling deadline"" ([line 57](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/Documentation/scheduler/sched-deadline.rst#L57)). This Chapter ignores how it is computed, as the Problem does.

The code keeps the runnable deadline tasks in a red-black tree that is ordered by deadline:

```c
static inline bool __dl_less(struct rb_node *a, const struct rb_node *b)
{
	return dl_time_before(__node_2_dle(a)->deadline, __node_2_dle(b)->deadline);
}
```

([deadline.c, lines 1524 to 1527](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/kernel/sched/deadline.c#L1524-L1527).) A task is put in with `rb_add_cached(&dl_se->rb_node, &dl_rq->root, __dl_less)` ([lines 1605 to 1611](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/kernel/sched/deadline.c#L1605-L1611)), and the next one to run is read off the same tree:

```c
static struct sched_dl_entity *pick_next_dl_entity(struct dl_rq *dl_rq)
{
	struct rb_node *left = rb_first_cached(&dl_rq->root);
```

([deadline.c, lines 1996 to 1998](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/kernel/sched/deadline.c#L1996-L1998).) `rb_first_cached` is "(root)->rb_leftmost" ([rbtree.h, line 106](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/rbtree.h#L106)), and `rb_add_cached` is documented as "insert @node into the leftmost cached tree @tree" ([rbtree.h, line 157](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/rbtree.h#L157)). Read together: the tree is kept in `__dl_less` order, so its leftmost node is the task with the earliest deadline, and picking it is a constant-time read of a cached pointer. Nothing here looks at run times, at how long a task has waited or at what the other tasks will do. That is what makes it greedy.

## When the rule is provably good

A rule that ignores most of the data needs a proof. The documentation gives one for a single CPU and periodic tasks whose deadline equals their period: "EDF is able to respect all the deadlines of all the tasks executing on a CPU if and only if the total utilization of the tasks running on such a CPU is smaller or equal than 1." ([lines 377 to 379](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/Documentation/scheduler/sched-deadline.rst#L377-L379)) The Problem is a plainer setting that the exchange argument covers directly. All jobs are ready at time 0, one CPU runs them one after another, and we want the order that makes the worst tardiness, the largest amount by which any job finishes after its deadline, as small as possible. (The documentation defines tardiness as "the maximum between 0 and the difference between the finishing time of a job and its absolute deadline", [lines 360 to 361](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/Documentation/scheduler/sched-deadline.rst#L360-L361).)

The argument is the Chapter's own. Take any order with two neighbours A then B where B has the earlier deadline. Swap them. B now finishes earlier, so it is no later than before. A now finishes at the time B used to finish, and its deadline is later than B's, so A is less late than B was. Every other job finishes at the same time as before. The worst tardiness cannot grow. Repeat until no such pair is left: the order is sorted by deadline, and it is at least as good as the one you started with. So the earliest-deadline-first order is a best order. It is the same shape of proof as in the last two Chapters: take any best answer and exchange it towards the greedy one.

## Where the rule stops being enough

Two of the documentation's own sentences mark the limits. On several CPUs: "enforcing that the total utilization is smaller than M does not guarantee that global EDF schedules the tasks without missing any deadline (in other words, global EDF is not an optimal scheduling algorithm)" ([lines 454 to 457](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/Documentation/scheduler/sched-deadline.rst#L454-L457)), where "M equal to the number of CPUs" ([lines 347 to 348](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/Documentation/scheduler/sched-deadline.rst#L347-L348)). And under overload: the documentation says a task gets its run time within its deadline "if a proper "admission control" strategy" is used, and adds "clearly, if the system is overloaded this guarantee cannot be respected" ([lines 61 to 63](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/Documentation/scheduler/sched-deadline.rst#L61-L63)). The kernel's answer is an admission test: "Linux uses an admission test based on the tasks' utilizations" ([lines 413 to 414](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/Documentation/scheduler/sched-deadline.rst#L413-L414)).

The Extra Problem takes the overload question on its own terms, in the job-list setting. Earliest deadline first says which order to run a set of jobs in. It does not say which jobs to drop when they cannot all be on time. The rule in the Problem is not the kernel's. Go through the jobs by deadline, keep each one, and whenever the kept jobs no longer fit, drop the longest. Its proof is another exchange: dropping the longest frees the most time for the same one lost job.

## The cost

Sorting n jobs by deadline is O(n log n) in the **worst case**, and one pass over the sorted jobs is O(n). Reading the next task from the kernel's tree is O(1) in the **worst case**, a read of the cached leftmost pointer (above); the Chapter does not cost the inserts. The Extra Problem adds a heap: each job is pushed once and popped at most once, O(n log n) in the **worst case** overall.

## What the Problems build

`jobs` loads a list of jobs, a second state next to the sequence. `edf` prints the smallest worst tardiness over all orders, which the sorted order reaches. `ontime` (Extra) prints how many jobs can meet their deadlines if the others are never run. The Huffman builder of the last Chapter and the `cidr` command stay in the program.
