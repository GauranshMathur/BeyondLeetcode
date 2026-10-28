# Emacs: noticing that a list never ends

A linked list ends when a link says "nothing follows". A list can also go wrong: a link can lead back to an earlier node, and then walking it never stops. This Chapter reads how GNU Emacs 30.2 guards its list loops against that, and what it gave up to do it cheaply. Here the two pointers move at different speeds, or one of them stays put and jumps.

## The problem: a list with no end

Emacs Lisp lists are chains of cons cells. The Emacs Lisp manual describes the bad case: "some cons cell's CDR could point to one of the previous cons cells in the list. We call that structure a circular list." ([doc/lispref/lists.texi, lines 73 to 75, Emacs 30.2](https://github.com/emacs-mirror/emacs/blob/emacs-30.2/doc/lispref/lists.texi#L73-L75)) And the consequence: "Most functions that try to find the end of a list enter infinite loops if given a circular list." ([lines 81 to 82](https://github.com/emacs-mirror/emacs/blob/emacs-30.2/doc/lispref/lists.texi#L81-L82))

So the C code that walks lists uses a macro instead of a bare loop. `FOR_EACH_TAIL` is documented as: "Loop over conses of the list TAIL, signaling if a cycle is found, and possibly quitting after each loop iteration." ([src/lisp.h, lines 5867 to 5875](https://github.com/emacs-mirror/emacs/blob/emacs-30.2/src/lisp.h#L5867-L5875)) Short lists skip the check. The comment on `SMALL_LIST_LEN_MAX`, which is 127, says these lists "are so short that code need not check for cycles or quits while traversing." ([lines 5862 to 5865](https://github.com/emacs-mirror/emacs/blob/emacs-30.2/src/lisp.h#L5862-L5865))

## The classic answer: a slow pointer and a fast pointer

There are two ways to see that a walk is going in circles. You can remember every node you have visited, which costs memory that grows with the list. Or you can walk with two pointers and compare them. Brent's 1980 paper describes the second one and credits it to Floyd:

"x := x0; y := x0; j := 0; repeat j := j+1; x := f(x); y := f(f(y)) until x = y."

([R. P. Brent, "An improved Monte Carlo factorization algorithm", BIT 20 (1980), p. 176, section 1](https://maths-people.anu.edu.au/~brent/pd/rpb051i.pdf)) In the paper `f` is the function that gives the next value; for a list it is "go to the next cell". The slow pointer `x` takes one step per round and the fast pointer `y` takes two. If the list ends, the fast pointer reaches the end first. If it loops, both end up in the loop, where the fast one gains one step per round on the slow one, so it must catch up: they become equal. (That is an argument, not something the paper's quote states.) Notice the cost the paper counts in the next step: each round makes 3 calls to `f`, one for `x` and two for `y`. Memory is O(1): two pointers and no table.

The same two speeds answer a second question without counting first: where is the middle of a list? When the fast pointer runs off the end, the slow pointer has taken half as many steps, so it is in the middle. This is a property of the walk, not a claim about Emacs.

## What Emacs chose: a pointer that stays put

Emacs does not use Floyd's version. The comment on the macro that does the work says: "Use Brent's teleporting tortoise-hare algorithm", citing the same paper. ([src/lisp.h, lines 5895 to 5897](https://github.com/emacs-mirror/emacs/blob/emacs-30.2/src/lisp.h#L5895-L5897)) The paper's abstract says why such a change is worth it: it "describe[s] a cycle-finding algorithm which is about 36 percent faster than Floyd's (on the average)." ([Brent 1980, abstract](https://maths-people.anu.edu.au/~brent/pd/rpb051i.pdf))

The idea, as the macro writes it: the "tortoise" does not move at all. Only the "hare" walks, one step at a time, and after each step it is compared with the tortoise. After a while the tortoise jumps to wherever the hare is, and the gap before the next jump doubles. The state is `{ tail, 2, 0, 2 }`: the tortoise starts at the head, and the first window is 2 steps long. ([`FOR_EACH_TAIL_INTERNAL`, lines 5905 to 5914](https://github.com/emacs-mirror/emacs/blob/emacs-30.2/src/lisp.h#L5905-L5914)) The per-step test is `BASE_EQ (tail, li.tortoise)`, and the jump is `li.q = li.n = li.max <<= 1, ... li.tortoise = (tail)`: the window size `max` doubles and the tortoise takes the hare's place.

Why does the hare find the tortoise? Once the windows are longer than the cycle, the tortoise has been dropped inside the cycle, and the hare, going round it, comes back to the tortoise within one lap. Per step the macro makes one pointer move and at most one comparison, where Floyd's makes three moves and one comparison per round.

## What it cost: a count that is too big

The loop reports a cycle only when the hare lands on the tortoise, and that can take more than one lap round the loop, so the walk has passed some nodes more than once by then. You can see this in the functions built on the macro. `safe-length` is defined as `FOR_EACH_TAIL_SAFE (list) len++`, and its docstring says: "If LIST is circular, it returns an integer that is at least the number of distinct elements." ([src/fns.c, lines 163 to 175](https://github.com/emacs-mirror/emacs/blob/emacs-30.2/src/fns.c#L163-L175)) The manual says the same in other words: "for circular lists, the value is just an upper bound; it is often too large." ([doc/lispref/lists.texi, lines 398 to 405](https://github.com/emacs-mirror/emacs/blob/emacs-30.2/doc/lispref/lists.texi#L398-L405))

That is the trade. Emacs pays a few extra steps on a list that really is circular, which is rare, to make the check cheap on every list that is not, which is nearly all of them. Both versions find a cycle in time proportional to m + n in the **worst case**, where m is the number of nodes before the loop and n is the loop's length (Brent's worst-case analysis bounds Floyd's algorithm by 3(m + n) calls to `f`, and his own with the settings Q = 2 and u = 0 by 2 max(m, n) + n calls, which he notes is never slower than Floyd's: [Brent 1980, section 3, bounds 3.2 and 3.10](https://maths-people.anu.edu.au/~brent/pd/rpb051i.pdf)), using O(1) extra space.

## What the Problems build

The loaded numbers become a table of links: item `i` is the node that follows node `i`, or `-1` if none does. `middle` finds the middle of a path with a slow and a fast pointer. `cycle` uses Floyd's version to say whether a walk loops, and if so how long the path before the loop is and how long the loop is. The extra Problem, `teleport`, runs the teleporting tortoise and asks how many steps it takes to notice.
