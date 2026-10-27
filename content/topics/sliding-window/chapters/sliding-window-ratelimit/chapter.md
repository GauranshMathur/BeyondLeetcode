# Rate limiters: counting in a window

A rate limit says that there may be no more than B events in any T seconds. To enforce it, code has to know how many events fell in the last T seconds, and that is a **window** over a stream: new events come in at one end, old ones fall out of the other. This Chapter reads two rate limiters, one in the Linux kernel (v6.6) and one at Cloudflare, and the three ways they count. In the Problems you build the same counts on a sequence of integers, where item `i` is the number of events in second `i`.

A window is the Two pointers idea with both pointers moving the same way: a right edge that takes in the next item and a left edge that lets go of the oldest. The reading and writing pointers in [Go: one pointer reads, one pointer writes](/chapters/two-pointers-go-compact) move like that too. Here the pointers are not copying anything. They bound the part of the stream you are counting.

## The simplest counter: reset it every period

The kernel limits how often a callback may run with `___ratelimit`. Its comment states the rule: "This enforces a rate limit: not more than @rs->burst callbacks in every @rs->interval". ([lib/ratelimit.c, lines 15 to 26](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/ratelimit.c#L15-L26)) The code that does it keeps a start time and a count:

```c
if (!rs->begin)
	rs->begin = jiffies;

if (time_is_before_jiffies(rs->begin + interval)) {
	...
	rs->begin   = jiffies;
	rs->printed = 0;
}
if (burst && burst > rs->printed) {
	rs->printed++;
	ret = 1;
} else {
	rs->missed++;
	ret = 0;
}
```

([lib/ratelimit.c, lines 50 to 71](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/ratelimit.c#L50-L71); the `...` stands for the lines that print a "callbacks suppressed" message, which have nothing to do with the counting.)

Read it as one counter and a clock. An event is allowed while the count is below `burst`. When `interval` has passed since `begin`, the count goes back to 0 and a new period starts. That is a **tumbling window**: the periods sit side by side and never overlap. Each event costs a constant number of steps and the counting state is a start time and two counters, so time and space are O(1) in the **worst case**.

The decision is to forget everything at the edge of a period. The price is easy to see. Suppose `burst` events arrive at the very end of one period and `burst` more arrive right after the reset. Every one of them is allowed, so 2 × `burst` events got through in a span far shorter than `interval`. This is arithmetic on the lines above, not something the kernel's comment says, but the Cloudflare engineers who wrote about their own limiter name the same flaw in the same design: "The most naive implementation is to simply increment a counter that we reset at the start of each sampling period. This works but is not terribly accurate as the counter will be arbitrarily reset at regular intervals, allowing regular traffic spikes to go through the rate limiter." ([Julien Desgats, "How we built rate limiting capable of scaling to millions of domains", Cloudflare Blog, 7 June 2017](https://blog.cloudflare.com/counting-things-a-lot-of-different-things/))

## Counting exactly: the sliding window

The same post names the exact alternative: "Another solution is to store the timestamp of every request and count how many were received during the last sampling period. This is more accurate, but has huge processing and memory requirements as checking the state of the counter require reading and processing a lot of data, especially if you want to rate limit over long period of time (for instance 5,000 req per hour)." (same post)

That is a window that slides one event at a time. Counting what is inside it does not need a pass over the whole window each time. When the window moves one step right, one item enters and one leaves, and the other K - 1 items are the same ones. So keep a running total: add the item that enters, subtract the item that leaves. A new window then costs two operations instead of K. Over a sequence of n items that is O(n) in the **worst case**, where recomputing every window from scratch is O(n × K). This is the Problem `peak`.

## What Cloudflare chose: two numbers per counter

The post says what they were working with: the shared store they already ran could do three things, "the only operations available were GET , SET and INCR (atomic increment)", and the leaky bucket (which the post says "this is what the stock NGINX module is using") "has two parameters (average rate and burst) that are not always easy to tune properly". (same post)

So they kept the counters of fixed periods and fixed the reset. "The naive fixed window algorithm is actually not that bad: we just have to solve the problem of completely resetting the counter for each sampling period. But actually, can't we just use the information from the previous counter in order to extrapolate an accurate approximation of the request rate?" Their worked case is a limit of 50 requests per minute, with 18 requests in the current minute, which started 15 seconds ago, and 42 in the previous minute:

"rate = 42 * ((60-15)/60) + 18 = 42 * 0.75 + 18 = 49.5 requests"

(same post) The previous minute counts for 45/60 of its total because the last 60 seconds reach back over only the last 45 seconds of it (arithmetic on the post's numbers). The post is clear about what this assumes: "This algorithm assumes a constant rate of requests during the previous sampling period (which can be any time span), this is why the result is only an approximation of the actual rate." It reports how close the approximation is: from "an analysis on 400 million requests from 270,000 distinct sources", "0.003% of requests have been wrongly allowed or rate limited". And it names what the approximation saves: "Tiny memory usage: only two numbers per counter". (same post)

Two numbers, the previous period's total and this period's total so far, replace the timestamp of every request. The decision trades a small, measured error for constant memory and a handful of arithmetic steps per check: O(1) time and space in the **worst case**. The error is real and you can see it in the Problem `approx`. When the previous period's events were not spread evenly, the estimate is off.

## What the Problems build

You start one program that reads commands about a sequence of integers, and keep growing it through the Topic. Item `i` is the number of events in second `i`. `blocks` is the kernel's counter: the largest total in any period, with periods side by side. (The kernel starts a period when the first event arrives after the last one ended, because it sets `begin` to the time of the reset (the `rs->begin   = jiffies;` line in the code above). The Problem cuts the stream into aligned periods instead, which keeps the rule short and the idea the same.) `peak` slides an exact window over the same sequence and finds the busiest K seconds. Run both on a burst that straddles a period boundary and they disagree. `approx` is Cloudflare's estimate, and counts the seconds in which it would say the limit was passed.
