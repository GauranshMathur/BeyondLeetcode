# Linux: the window maximum without keeping the window

Sums are easy to slide: add what enters, subtract what leaves. A maximum is not. When the largest item leaves the window, nothing you stored tells you the next largest. This Chapter reads how Linux 6.6 keeps the maximum of a window, why it can do it in constant space, and what it gives up. In the Problems you build the exact version with a queue, and then, as an Extra, the kernel's own.

## Who needs it

TCP congestion control in the kernel, BBR, estimates how fast a path can deliver data, and the estimate it wants is the biggest delivery rate seen recently. The source names the window: "Window length of bw filter (in rounds)" is `bbr_bw_rtts = CYCLE_LEN + 2` ([net/ipv4/tcp_bbr.c, lines 132 to 133](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/net/ipv4/tcp_bbr.c#L132-L133)), and `CYCLE_LEN` is 8 on [line 130](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/net/ipv4/tcp_bbr.c#L130), so the window is 10 rounds (arithmetic on the two lines). The function that reads it says so: "Return the windowed max recent bandwidth sample", and it returns `minmax_get(&bbr->bw)`. ([lines 214 to 220](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/net/ipv4/tcp_bbr.c#L214-L220)) Each new sample goes into the filter with `minmax_running_max(&bbr->bw, bbr_bw_rtts, bbr->rtt_cnt, bw)`. ([lines 797 to 800](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/net/ipv4/tcp_bbr.c#L797-L800))

## Throw away what can never win

Here is the exact way to keep a window maximum. Say a new item arrives. Any item already in the window that is not bigger than it is older, so it will leave the window first, and until it leaves the new item is at least as big. The older item can never be the maximum again, so forget it. The kernel's comment says the same thing for its minimum filter: "Upon getting a new min, we can forget everything earlier because it has no value - the new min is <= everything else in the window by definition and it's the most recent." ([lib/win_minmax.c, lines 19 to 23](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/win_minmax.c#L19-L23))

Keep the items that might still win in a queue, oldest first. When a new item arrives, remove from the back every item that is not bigger than it, then add the new one at the back. The queue is now in decreasing order, so the front is the maximum. When the front is older than the window, remove it from the front. Each item is added once and removed at most once, so n items cost O(n) in the **worst case**, which is amortised O(1) per item. One step can remove many items at once, up to K of them, so a single step is O(K) in the **worst case**. The queue can hold K items when the sequence is strictly decreasing (K + 1 for a moment, between adding a new item and removing the front that has just left), so space is O(K) in the **worst case**. Taking the maximum of every window again is O(n × K) in the **worst case**. This is the Problem `windowmax`.

## What Linux chose: three samples

The kernel does not keep the queue. The file begins with what it does instead: "Kathleen Nichols' algorithm for tracking the minimum (or maximum) value of a data stream over some fixed time interval. (E.g., the minimum RTT over the past five minutes.) It uses constant space and constant time per update yet almost always delivers the same minimum as an implementation that has to keep all the data in the window." ([lib/win_minmax.c, lines 5 to 10](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/win_minmax.c#L5-L10)) The state is three samples, each a time and a value: `struct minmax_sample { u32 t; u32 v; }` and `struct minmax { struct minmax_sample s[3]; }`. ([include/linux/win_minmax.h, lines 11 to 20](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/win_minmax.h#L11-L20))

The three are the best, the second best and the third best: "maintaining an invariant that the measurement time of the n'th best >= n-1'th best. It also makes sure that the three values are widely separated in the time window since that bounds the worse case error when that data is monotonically increasing over the window." ([lines 12 to 17](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/win_minmax.c#L12-L17)) The update for a new maximum is short:

```c
u32 minmax_running_max(struct minmax *m, u32 win, u32 t, u32 meas)
{
	struct minmax_sample val = { .t = t, .v = meas };

	if (unlikely(val.v >= m->s[0].v) ||	  /* found new max? */
	    unlikely(val.t - m->s[2].t > win))	  /* nothing left in window? */
		return minmax_reset(m, t, meas);  /* forget earlier samples */

	if (unlikely(val.v >= m->s[1].v))
		m->s[2] = m->s[1] = val;
	else if (unlikely(val.v >= m->s[2].v))
		m->s[2] = val;

	return minmax_subwin_update(m, win, &val);
}
```

([lib/win_minmax.c, lines 67 to 81](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/win_minmax.c#L67-L81)) A new best wipes all three, which is the rule from the last section applied to the whole state. Otherwise the new value replaces the second or third choice if it beats them, and `minmax_subwin_update` ages the samples as time passes. When the best is older than the window ("Passed entire window without a new val"), the second and third choices move up one place and the new sample becomes the third. A second choice is taken once "a quarter of the window" has passed since the best, and a third once half has. ([lib/win_minmax.c, lines 28 to 64](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/win_minmax.c#L28-L64)) The time test is `dt > win`, so a sample is out of the window once it is more than `win` ticks old: with one sample per tick the window holds `win + 1` of them (arithmetic on the lines above).

## What it cost: sometimes not the maximum

The queue keeps every item that might still win, so it is always right but may hold K items. The kernel keeps three, so it is constant in both time and space in the **worst case**, and sometimes not exactly right. You can see an error in a small case. Feed the values 3, 9, 7, 4, 3, 1, 0 at times 0 to 6 with `win` 4. The 9 at time 1 becomes the best and wipes the state. The 7 at time 2 is not kept. A second choice is only taken once the time since the best is more than a quarter of the window, which is 4 / 4 = 1 tick in whole numbers, and 2 - 1 = 1 is not more than 1. At time 3 the 4 is taken as second and third choice. At time 6 the 9 is more than 4 ticks old and the filter returns the 4. The largest of the last five values, times 2 to 6, is the 7. (Worked by hand from the lines above; the Extra Problem runs this case.) The kernel's own words for this are "almost always delivers the same minimum": the filter is built to be wrong rarely, not never.

The decision is to give up an exact answer for a fixed-size state and a fixed amount of work per sample, which is what the file's first paragraph advertises: "constant space and constant time per update". A job that needs the exact maximum, as `windowmax` does, needs the queue.

## What the Problems build

`windowmax K` prints the maximum of every window of `K` items, with the queue. The Extra Problem `nichols W` replays the kernel's three-sample filter on the sequence, one sample per tick, so you can compare it with `windowmax`.
