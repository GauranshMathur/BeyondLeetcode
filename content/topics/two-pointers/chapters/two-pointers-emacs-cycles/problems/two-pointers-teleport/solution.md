Follow the rule exactly. The state is the tortoise node, the window size, `left`, and a step counter. On the step that uses up the window, the tortoise jumps and no comparison is made.

Why the hare finds the tortoise: the windows keep doubling, so sooner or later the tortoise jumps to a node inside the loop while the window is longer than the loop. The hare then goes round the loop and comes back to the tortoise's node within one lap, before the window runs out.

Cost: one pointer move and at most one comparison per step. The steps needed are proportional to m + n in the worst case (m nodes before the loop, n in it), and extra space is O(1). The count printed is often more than m + n: that is the price of only comparing against a fixed point, and it is the reason Emacs's `safe-length` can return more than the number of distinct nodes.
