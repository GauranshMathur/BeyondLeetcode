# Sliding window: sources

Research for the Topic `sliding-window` (card C104, issue #264). Every claim about a real system that the four Chapters make is listed below with its source. The Problems follow the same sources: the rules in each statement are the rules in the code or text quoted here, except where a statement says it is written for the Problem.

Pinned versions. Code links in the Chapters use the commit SHA, never a branch or a tag.

| Project | Tag | Commit |
|---|---|---|
| Linux | `v6.6` | `ffc253263a1375a65fa6c9f62a893e9767fbebfa` (annotated tag object `5260836abb7056beed3f3f0d0e4262c11f36f0d0`) |
| fail2ban | `1.1.0` | `61799e15e1dd4389dea0cc7595da0a287835a177` (annotated tag object `fb2c637de37c02201944d969d966065aa7b09851`) |
| RFC 9293 | August 2022 | `https://www.rfc-editor.org/rfc/rfc9293.html` (the RFC is immutable once published) |
| Cloudflare Blog | 7 June 2017 | `https://blog.cloudflare.com/counting-things-a-lot-of-different-things/` (Julien Desgats) |

Method. Linux and fail2ban files were fetched with `curl` from `raw.githubusercontent.com/<org>/<repo>/<sha>/<path>` (Linux `lib/ratelimit.c` and `net/ipv4/tcp_bbr.c` also from git.kernel.org at the same SHA, byte-identical) and line numbers read with `grep -n` and `sed -n`. The RFC was fetched as text from `rfc-editor.org` and the section anchors in the Chapters are the HTML version's. The Cloudflare post was fetched as HTML and read as text. Every quoted string in the Chapters was checked by a script against the fetched text (whitespace normalised, comment markers dropped). Source types: 1 = source code, 2 = official documentation, 3 = standard or original paper, 4 = a post by the system's own engineers.

## Observed, not cited

- **Linux `win_minmax.c`, compiled.** `lib/win_minmax.c` at the pinned SHA was compiled with `gcc` against the pinned `include/linux/win_minmax.h`, with the kernel headers it includes replaced by empty or one-line stand-ins (`u32`, `unlikely`, `EXPORT_SYMBOL`). The Python port of `nichols` was run against it on 3,000 random sequences (lengths 0 to 40, windows 0 to 15, values up to 3, 10 and 1,000) with no difference. The expected outputs of the `nichols` Tests come from the compiled file. On 3,000 random sequences of 300 items the filter differed from the exact window maximum at 12,976 of 900,000 positions (1.4 percent). This is a measurement of this project's Extra Problem, not a claim in a Chapter.
- **The oracle.** The expected outputs of every other Problem come from a second implementation that uses other techniques (prefix sums, binary search, a heap with lazy deletion, per-host position lists), which was checked against a brute-force one on 4,000 random small cases per command before it was used.
- **Reference Code.** Python, TypeScript (Node) and Go were each run on every Test in the Problem's scope, locally, before the content check.

## Leads that changed

- The issue's first lead for Chapter 1 was "a rate limiter, a moving average". The Chapter reads two rate limiters (the Linux kernel's and Cloudflare's), and no moving average.
- The issue's lead for Chapter 2 was "the TCP sliding window"; it is RFC 9293.
- Chapter 3 ("window state kept in a hash table") has no lead in the issue. A search for a system that keeps per-key counts over a time window found fail2ban's `FailManager`.
- Chapter 4 ("monotonic queue for window maximum") has no lead in the issue. The kernel's `lib/win_minmax.c` is not a monotonic queue: it is a constant-space filter whose first comment makes the same observation that justifies the queue. The Chapter reads that, and teaches the queue from the observation, without claiming any system uses one.
- Candidate Problems not in this Topic: Best Time to Buy and Sell Stock, Longest Repeating Character Replacement and Permutation in String. They do not fit the Build (no real system of the four above to frame them, and the first two are not window questions about a stream the Build holds). Permutation in String is a fixed window with a count map, which is what `cover` and `bans` already do.

---

## Chapter 1: Rate limiters (`sliding-window-ratelimit`)

### Claim 1.1. The kernel's `___ratelimit` allows not more than `burst` callbacks in every `interval`.
- Link: [lib/ratelimit.c L15-L26](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/ratelimit.c#L15-L26)
- Quote: "This enforces a rate limit: not more than @rs->burst callbacks in every @rs->interval"
- Type 1. Status: sourced.

### Claim 1.2. It keeps a start time and a count, resets both when `interval` has passed, and allows an event while the count is below `burst`.
- Link: [lib/ratelimit.c L50-L71](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/ratelimit.c#L50-L71)
- Quote: `if (!rs->begin) rs->begin = jiffies;` `if (time_is_before_jiffies(rs->begin + interval)) {` ... `rs->begin = jiffies; rs->printed = 0; }` `if (burst && burst > rs->printed) { rs->printed++; ret = 1; } else { rs->missed++; ret = 0; }` (lines 53 to 63 also print "callbacks suppressed", elided in the Chapter with `...`)
- Type 1. Status: sourced. The words "tumbling window", "O(1)" and "2 x burst across a reset" are the Chapter's reading of these lines, labelled as arithmetic in the text.

### Claim 1.3. A counter reset at the start of each period lets spikes through.
- Link: [Cloudflare Blog, 2017-06-07](https://blog.cloudflare.com/counting-things-a-lot-of-different-things/)
- Quote: "The most naive implementation is to simply increment a counter that we reset at the start of each sampling period. This works but is not terribly accurate as the counter will be arbitrarily reset at regular intervals, allowing regular traffic spikes to go through the rate limiter."
- Type 4. Status: sourced.

### Claim 1.4. Storing every timestamp is exact but costly.
- Link: same post.
- Quote: "Another solution is to store the timestamp of every request and count how many were received during the last sampling period. This is more accurate, but has huge processing and memory requirements as checking the state of the counter require reading and processing a lot of data, especially if you want to rate limit over long period of time (for instance 5,000 req per hour)."
- Type 4. Status: sourced. The running-total argument for `peak` (add what enters, subtract what leaves) is the Chapter's own, and its complexity (O(n) against O(n x K)) is read off the loops.

### Claim 1.5. What Cloudflare had to work with, and why not the leaky bucket.
- Link: same post.
- Quotes: "the only operations available were GET , SET and INCR (atomic increment)"; "this is what the stock NGINX module is using"; "has two parameters (average rate and burst) that are not always easy to tune properly".
- Type 4. Status: sourced.

### Claim 1.6. The sliding-window approximation, its worked case, its assumption, its accuracy and its memory.
- Link: same post.
- Quotes: "The naive fixed window algorithm is actually not that bad: we just have to solve the problem of completely resetting the counter for each sampling period. But actually, can't we just use the information from the previous counter in order to extrapolate an accurate approximation of the request rate?"; "rate = 42 * ((60-15)/60) + 18 = 42 * 0.75 + 18 = 49.5 requests"; "This algorithm assumes a constant rate of requests during the previous sampling period (which can be any time span), this is why the result is only an approximation of the actual rate."; "an analysis on 400 million requests from 270,000 distinct sources"; "0.003% of requests have been wrongly allowed or rate limited"; "Tiny memory usage: only two numbers per counter".
- Type 4. Status: sourced. The post's apostrophe in "can't" is a typographic one. The sentence that the previous minute counts for 45/60 because the last 60 seconds reach back over 45 seconds of it is arithmetic on the post's numbers, labelled so in the Chapter.

---

## Chapter 2: TCP (`sliding-window-tcp`)

### Claim 2.1. Every octet has a sequence number.
- Link: [RFC 9293 section 3.4](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.4)
- Quote: "A fundamental notion in the design is that every octet of data sent over a TCP connection has a sequence number."
- Type 3. Status: sourced.

### Claim 2.2. The send variables and the four regions of the send sequence space.
- Link: [RFC 9293 section 3.3.1](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.3.1)
- Quotes: Table 2 rows "SND.UNA | send unacknowledged", "SND.NXT | send next", "SND.WND | send window"; Figure 3: "1 - old sequence numbers that have been acknowledged", "2 - sequence numbers of unacknowledged data", "3 - sequence numbers allowed for new data transmission", "4 - future sequence numbers that are not yet allowed".
- Type 3. Status: sourced.

### Claim 2.3. The window is anchored at SND.UNA; the left edge moves on acknowledgments; the right edge moves on a window update, guarded against old segments.
- Link: [RFC 9293 section 3.10.7.4](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.10.7.4), ESTABLISHED STATE
- Quotes: "If SND.UNA < SEG.ACK =< SND.NXT, then set SND.UNA <- SEG.ACK. Any segments on the retransmission queue that are thereby entirely acknowledged are removed."; "If (SND.WL1 < SEG.SEQ or (SND.WL1 = SEG.SEQ and SND.WL2 =< SEG.ACK)), set SND.WND <- SEG.WND"; "Note that SND.WND is an offset from SND.UNA"; "The check here prevents using old segments to update the window."
- Type 3. Status: sourced. "It only ever moves right" is read off the condition `SND.UNA < SEG.ACK`; the same section says a duplicate ACK "can be ignored". "A late segment cannot move the right edge to an out-of-date value" restates "The check here prevents using old segments to update the window."

### Claim 2.4. The usable window.
- Link: [RFC 9293 section 3.8.6.2.1](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.8.6.2.1)
- Quote: "U = SND.UNA + SND.WND - SND.NXT", "i.e., the offered window less the amount of data sent but not acknowledged."
- Type 3. Status: sourced. "Left edge SND.UNA, right edge SND.UNA + SND.WND" is read off these two lines and the 2.3 quote.

### Claim 2.5. Shrinking the window is strongly discouraged; the receiver SHOULD NOT; the sender MUST cope; what to do when the usable window is negative; why a too-large window hurts.
- Link: [RFC 9293 section 3.8.6](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.8.6)
- Quotes: "The mechanisms provided allow a TCP endpoint to advertise a large window and to subsequently advertise a much smaller window without having accepted that much data. This so-called "shrinking the window" is strongly discouraged. The robustness principle [19] dictates that TCP peers will not shrink the window themselves, but will be prepared for such behavior on the part of other TCP peers."; "A TCP receiver SHOULD NOT shrink the window, i.e., move the right window edge to the left (SHLD-14). However, a sending TCP peer MUST be robust against window shrinking, which may cause the "usable window" (see Section 3.8.6.2.1) to become negative (MUST-34)."; "SHOULD NOT send new data (SHLD-15), but SHOULD retransmit normally the old unacknowledged data between SND.UNA and SND.UNA+SND.WND (SHLD-16)"; "If more data arrives than can be accepted, it will be discarded. This will result in excessive retransmissions, adding unnecessarily to the load on the network and the TCP endpoints."
- Type 3. Status: sourced. The Chapter's sentences on what happens "if the right edge never goes backwards, data already sent into the window stays inside it" are arithmetic on the definition of the edges, stated as conditionals. The Chapter says the standard gives no longer reason for SHLD-14 than the robustness principle; nothing in the section is more specific.

### Claim 2.6. The sender's loop (grow on the right while data in flight is below the window, shrink on the left on an acknowledgment).
- Not a quotation. Labelled in the Chapter as a reading of the rules in 2.3 and 2.4. The cost claims for `flight` and `shortest` (O(n) worst case, each item added once and dropped at most once) are read off the loops.

---

## Chapter 3: fail2ban (`sliding-window-fail2ban`)

### Claim 3.1. The ban action runs after `maxretry` matches within `findtime` seconds; the two settings define the window.
- Links: [man/jail.conf.5 L379](https://github.com/fail2ban/fail2ban/blob/61799e15e1dd4389dea0cc7595da0a287835a177/man/jail.conf.5#L379), [L270-L271](https://github.com/fail2ban/fail2ban/blob/61799e15e1dd4389dea0cc7595da0a287835a177/man/jail.conf.5#L270-L271), [L273-L274](https://github.com/fail2ban/fail2ban/blob/61799e15e1dd4389dea0cc7595da0a287835a177/man/jail.conf.5#L273-L274), [L274](https://github.com/fail2ban/fail2ban/blob/61799e15e1dd4389dea0cc7595da0a287835a177/man/jail.conf.5#L274)
- Quotes (roff markup dropped: the man page writes `\fBmaxretry\fR` and `\fBfindtime\fR` in bold, and `.B findtime` / `.B maxretry` set the key names): "after maxretry log lines matches within last findtime seconds" (line 379, from "command(s) that bans the IP address after \fBmaxretry\fR log lines matches within last \fBfindtime\fR seconds."); "time interval (in seconds or time abbreviation format) before the current time where failures will count towards a ban." (line 271, key name on line 270); "number of failures that have to occur in the last findtime seconds to ban the IP." (line 274, key name on line 273); "the last findtime seconds" (inside line 274).
- Type 2. Status: sourced.

### Claim 3.2. `Filter.setFindTime` hands `findtime` to the failure manager as `maxTime`.
- Link: [fail2ban/server/filter.py L283-L286](https://github.com/fail2ban/fail2ban/blob/61799e15e1dd4389dea0cc7595da0a287835a177/fail2ban/server/filter.py#L283-L286)
- Quote: `self.__findTime = value` `self.failManager.setMaxTime(value)`
- Type 1. Status: sourced.

### Claim 3.3. The failures are one `dict`, keyed by the ticket's ID, which comes from the IP address.
- Links: [failmanager.py L42](https://github.com/fail2ban/fail2ban/blob/61799e15e1dd4389dea0cc7595da0a287835a177/fail2ban/server/failmanager.py#L42), [ticket.py L51](https://github.com/fail2ban/fail2ban/blob/61799e15e1dd4389dea0cc7595da0a287835a177/fail2ban/server/ticket.py#L51), [ticket.py L95-L96](https://github.com/fail2ban/fail2ban/blob/61799e15e1dd4389dea0cc7595da0a287835a177/fail2ban/server/ticket.py#L95-L96), [failmanager.py L75-L77](https://github.com/fail2ban/fail2ban/blob/61799e15e1dd4389dea0cc7595da0a287835a177/fail2ban/server/failmanager.py#L75-L77), [failmanager.py L98-L109](https://github.com/fail2ban/fail2ban/blob/61799e15e1dd4389dea0cc7595da0a287835a177/fail2ban/server/failmanager.py#L98-L109)
- Quotes: `self.__failList = dict()`; `self.setID(ip)` (in `Ticket.__init__(self, ip=None, ...)`, whose docstring says "@param ip the IP address"); `def getID(self): return self._id`; `fid = ticket.getID()` `try:` `fData = self.__failList[fid]`; `except KeyError:` ... `self.__failList[fid] = fData`
- Type 1. Status: sourced.

### Claim 3.4. `toBan` compares the count with `maxretry` and deletes the host from the dict as it returns it.
- Link: [failmanager.py L157-L163](https://github.com/fail2ban/fail2ban/blob/61799e15e1dd4389dea0cc7595da0a287835a177/fail2ban/server/failmanager.py#L157-L163)
- Quote: `if data.getRetry() >= self.__maxRetry: del self.__failList[fid] return data`
- Type 1. Status: sourced.

### Claim 3.5. Per-host state is a count and a start time; a repeat failure calls `adjustTime` and `inc`.
- Links: [ticket.py L229-L236](https://github.com/fail2ban/fail2ban/blob/61799e15e1dd4389dea0cc7595da0a287835a177/fail2ban/server/ticket.py#L229-L236), [failmanager.py L88-L90](https://github.com/fail2ban/fail2ban/blob/61799e15e1dd4389dea0cc7595da0a287835a177/fail2ban/server/failmanager.py#L88-L90), [ticket.py L268-L270](https://github.com/fail2ban/fail2ban/blob/61799e15e1dd4389dea0cc7595da0a287835a177/fail2ban/server/ticket.py#L268-L270)
- Quotes: `self._firstTime = None` `self._retry = 1`; `self._firstTime = time if time is not None else self.getTime()`; `fData.adjustTime(unixTime, self.__maxTime)` `fData.inc(matches, attempt, count)`; `self._retry += count`
- Type 1. Status: sourced.

### Claim 3.6. `adjustTime` rescales the count by `maxTime / (time - firstTime)` when the first failure is older than `maxTime`.
- Link: [ticket.py L255-L266](https://github.com/fail2ban/fail2ban/blob/61799e15e1dd4389dea0cc7595da0a287835a177/fail2ban/server/ticket.py#L255-L266)
- Quote: "Adjust time of ticket and current attempts count considering given maxTime as estimation from rate by previous known interval (if it exceeds the findTime)"; `if self._firstTime < time - maxTime:` `self._retry = int(round(self._retry / float(time - self._firstTime) * maxTime))` `self._firstTime = time - maxTime`
- Type 1. Status: sourced. The worked case (4 failures since time 0, `maxTime` 10, a failure at time 20: round(4/20 x 10) = 2, then 3) is arithmetic on the line, labelled so. "Treats the earlier failures as spread evenly" is the arithmetic's meaning; the Chapter says the source does not state it.

### Claim 3.7. `cleanup` drops hosts whose last failure is `maxTime` old or older; the filter runs it at most every 5 seconds unless forced.
- Links: [failmanager.py L129-L147](https://github.com/fail2ban/fail2ban/blob/61799e15e1dd4389dea0cc7595da0a287835a177/fail2ban/server/failmanager.py#L129-L147), [filter.py L460-L467](https://github.com/fail2ban/fail2ban/blob/61799e15e1dd4389dea0cc7595da0a287835a177/fail2ban/server/filter.py#L460-L467)
- Quotes: `time -= self.__maxTime` ... `todelete = [fid for fid,item in self.__failList.items() if item.getTime() <= time]`; `if force or tm >= self.__nextSvcTime:` `self.__nextSvcTime = tm + 5` `self.failManager.cleanup(tm)`
- Type 1. Status: sourced. "The dict holds the hosts that failed within the window, plus those that have gone quiet since the last sweep" is the Chapter's reading.

### Claim 3.8. "A lookup, insert or delete is O(1) in the expected case."
- Not a claim about fail2ban. It restates the Hash tables Topic (Chapter `hash-tables-cpython-dict`), which cites CPython's own comment. The Build uses each Language's built-in map for this reason and says so.

---

## Chapter 4: Linux windowed min/max (`sliding-window-minmax`)

### Claim 4.1. BBR's bandwidth filter window is `CYCLE_LEN + 2` rounds, `CYCLE_LEN` is 8, `bbr_max_bw` returns the filter's value and each sample is fed with `minmax_running_max`.
- Links: [net/ipv4/tcp_bbr.c L132-L133](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/net/ipv4/tcp_bbr.c#L132-L133), [L130](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/net/ipv4/tcp_bbr.c#L130), [L214-L220](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/net/ipv4/tcp_bbr.c#L214-L220), [L797-L800](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/net/ipv4/tcp_bbr.c#L797-L800)
- Quotes: "Window length of bw filter (in rounds):" `static const int bbr_bw_rtts = CYCLE_LEN + 2;`; `#define CYCLE_LEN 8`; "Return the windowed max recent bandwidth sample" ... `return minmax_get(&bbr->bw);`; `minmax_running_max(&bbr->bw, bbr_bw_rtts, bbr->rtt_cnt, bw);`
- Type 1. Status: sourced. "10 rounds" is 8 + 2, labelled arithmetic in the Chapter.

### Claim 4.2. The kernel's comment: a new extreme makes everything earlier worthless.
- Link: [lib/win_minmax.c L19-L23](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/win_minmax.c#L19-L23)
- Quote: "Upon getting a new min, we can forget everything earlier because it has no value - the new min is <= everything else in the window by definition and it's the most recent."
- Type 1. Status: sourced. The monotonic queue built on this idea, and its costs (O(n) total, amortised O(1); a step can be O(K); O(K) space), are the Chapter's own and are read off the loops of the Reference Code. The Chapter does not claim the kernel uses a queue.

### Claim 4.3. What the filter is, what it promises, and what it gives up.
- Links: [lib/win_minmax.c L5-L10](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/win_minmax.c#L5-L10), [lib/win_minmax.c L12-L17](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/win_minmax.c#L12-L17), [include/linux/win_minmax.h L11-L20](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/linux/win_minmax.h#L11-L20)
- Quotes: "Kathleen Nichols' algorithm for tracking the minimum (or maximum) value of a data stream over some fixed time interval. (E.g., the minimum RTT over the past five minutes.) It uses constant space and constant time per update yet almost always delivers the same minimum as an implementation that has to keep all the data in the window."; "maintaining an invariant that the measurement time of the n'th best >= n-1'th best. It also makes sure that the three values are widely separated in the time window since that bounds the worse case error when that data is monotonically increasing over the window."; `struct minmax_sample { u32 t; u32 v; };` `struct minmax { struct minmax_sample s[3]; };`
- Type 1. Status: sourced. In the Chapter's quote of lines 5 to 10 the original has a line break after "(or maximum)"; the text is joined.

### Claim 4.4. `minmax_running_max` and `minmax_subwin_update`.
- Links: [lib/win_minmax.c L67-L81](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/win_minmax.c#L67-L81), [L28-L64](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/win_minmax.c#L28-L64)
- Quote: the function in the Chapter is lines 67 to 81 verbatim; "Passed entire window without a new val"; "a quarter of the window"; `dt > win`.
- Type 1. Status: sourced. The sentence that a window of `win` holds `win + 1` samples at one per tick is arithmetic on `dt > win`.

### Claim 4.5. A case where the filter differs from the exact window maximum.
- Observed, not cited: worked by hand from the lines in 4.4, and reproduced by running the compiled kernel file (input 3 9 7 4 3 1 0 8 3 5, `win` 4: output 3 9 9 9 9 9 4 8 8 8; exact 3 9 9 9 9 9 7 8 8 8).
