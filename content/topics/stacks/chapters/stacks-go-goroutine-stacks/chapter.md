# Go: a call stack that moves

Every function call needs somewhere to keep its local variables and the place to return to. Programs keep these in a **call stack**: each call pushes a **frame**, and each return pops it. The last call to start is the first to finish, which is why a stack is the right shape. This Chapter reads how the Go runtime, version 1.22.0, handles the one problem every call stack has: nobody knows in advance how deep the calls will go. In the Problems you build the frames, the growth rule and the shrink rule.

## Every goroutine owns a small stack

A goroutine is Go's unit of concurrent work, and each one has its own call stack. The runtime defines the smallest stack a goroutine gets: "The minimum size of stack used by Go code", `stackMin = 2048` bytes ([runtime/stack.go, lines 74 to 75](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L74-L75)). The constant is added to a `stackSystem` term that is only non-zero on Windows, Plan 9 and iOS ([lines 67 to 72](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L67-L72)), so on Linux the starting stack is 2,048 bytes.

A small stack will sometimes be too small. Go checks for this on every function call. In the runtime's own words: "Each function compares its stack pointer against g->stackguard to check for overflow." ([lines 21 to 23](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L21-L23)) When the check fails, the function calls `morestack`, and `newstack` is "Called from runtime·morestack when more stack is needed." ([lines 950 to 951](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L950-L951))

## Growing: double, then move

The comment on `newstack` names the idea: "Stack growth is multiplicative, for constant amortized cost." ([line 952](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L952)) The rule itself is a few lines ([lines 1073 to 1087](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L1073-L1087)):

- "Allocate a bigger segment and move the stack." `newsize := oldsize * 2`.
- Then, "Make sure we grow at least as much as needed to fit the new frame": while the new size minus the bytes in use is still smaller than what the function needs, `newsize *= 2` again.

So a stack's size is always 2,048 times a power of two. This is the doubling rule from the Dynamic arrays Topic, applied to a stack. The cost is the same too: the call that triggers a move pays for it, and `copystack` copies only the part in use. It computes `used := old.hi - gp.sched.sp` ([line 862](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L862)) and then runs `memmove` on `ncopy`, which starts as `used` ([line 884](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L884) and [line 910](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L910)). The stack grows towards lower addresses, so the used part is the high end of the block. One call can copy as many bytes as the stack holds, which is O(n) in the **worst case**. Doubling keeps the total copied across n bytes of calls below about twice n, so growth costs O(1) per byte of frame, **amortised**.

A moved stack has pointers into itself, and `copystack` fixes them after the copy: it walks the frames and calls `adjustframe` on each one ([lines 927 to 930](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L927-L930)). The Build leaves that out and counts only the bytes moved.

## Refusing: the limit

Doubling cannot go on forever. Before it moves anything, `newstack` compares the new size with a limit and, past it, stops the program: `if newsize > maxstacksize` ... `throw("stack overflow")` ([lines 1096 to 1103](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L1096-L1103)). The limit is set at start-up: "Max stack size is 1 GB on 64-bit, 250 MB on 32-bit." ([runtime/proc.go, lines 153 to 157](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/proc.go#L153-L157))

Because sizes are powers of two times 2,048, a 64-bit program cannot reach 1,000,000,000 bytes. The sizes run ... 268,435,456, 536,870,912, then 1,073,741,824, which is over the limit. The largest stack a goroutine can really have is 536,870,912 bytes. That follows from the numbers above; the runtime does not state it.

## Shrinking: only when a quarter is in use

A goroutine that recursed deeply once should not hold that memory for ever. The garbage collector checks stacks as it scans them: "Shrink the stack if not much of it is being used." ([runtime/mgcmark.go, lines 872 to 873](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/mgcmark.go#L872-L873)) The rule is in `shrinkstack` ([lines 1193 to 1208](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L1193-L1208)):

- The candidate size is half the current one, `newsize := oldsize / 2`. If that is below the minimum stack size, do nothing.
- Otherwise "only shrink the stack if gp is using less than a quarter of its current stack": `used >= avail/4` means return without shrinking.

So a stack grows when it is full, shrinks when it is a quarter full, and shrinks by half. After a shrink, the used part is under half of the new size, so a stack needs about as many new calls to fill up again as it had to give up to shrink. That is the same reasoning as CPython's "below half" rule for lists in the Dynamic arrays Topic, with a wider gap. (The arithmetic is ours; the runtime's comment gives no reason.)

The Build simplifies in three places. It counts bytes of frames only, and leaves out the guard space the runtime adds to `used` and `needed`. It checks "does the new frame fit" instead of a stack-pointer comparison in each function. And it always starts at 2,048 bytes, while the runtime can start new goroutines at an average size: "startingStackSize is updated every GC by tracking the average size of stacks scanned during the GC." ([lines 1301 to 1302](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L1301-L1302))

## What to take from this

- A stack is the structure behind every function call, and its size is a decision, not a given.
- Go chose a tiny start, doubling growth and a wide shrink threshold, and put a hard limit on the top.
- Push (a call) is amortised O(1), O(n) in the worst case when it moves the stack. Pop (a return) is O(1).
