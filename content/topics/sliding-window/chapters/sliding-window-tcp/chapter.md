# TCP: a window with two edges

The window in the last Chapter had a fixed length, K seconds. Many windows do not. This Chapter reads how the standard for TCP, the protocol under most connections on the internet, limits the data a sender may have outstanding, and there the length of the window is whatever the receiver says it is, so it grows and shrinks while its edges move. The source is RFC 9293, the current TCP standard (IETF, August 2022). In the Problems you build the two moves of such a window on a sequence of positive integers, where each item is the size of one segment.

## The window in the standard

TCP counts bytes, not segments. "A fundamental notion in the design is that every octet of data sent over a TCP connection has a sequence number." ([RFC 9293, section 3.4](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.4)) The sender keeps three variables for the window. The standard's table lists them as `SND.UNA`, "send unacknowledged", `SND.NXT`, "send next", and `SND.WND`, "send window". ([RFC 9293, section 3.3.1](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.3.1)) Its Figure 3, "Send Sequence Space", cuts the numbers into four regions: "1 - old sequence numbers that have been acknowledged", "2 - sequence numbers of unacknowledged data", "3 - sequence numbers allowed for new data transmission" and "4 - future sequence numbers that are not yet allowed". (same section)

The window is anchored at the oldest byte not yet acknowledged. The standard says so when it describes how the window is updated: "Note that SND.WND is an offset from SND.UNA". ([section 3.10.7.4, ESTABLISHED STATE](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.10.7.4)) The sender's own rule for how much more it may send is the "usable window": "U = SND.UNA + SND.WND - SND.NXT", which the standard glosses as "the offered window less the amount of data sent but not acknowledged". ([section 3.8.6.2.1](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.8.6.2.1)) So the window has a **left edge**, `SND.UNA`, and a **right edge**, `SND.UNA + SND.WND`, and the data in flight sits between the left edge and `SND.NXT`.

## Each edge has its own rule

The left edge moves when an acknowledgment arrives: "If SND.UNA < SEG.ACK =< SND.NXT, then set SND.UNA <- SEG.ACK. Any segments on the retransmission queue that are thereby entirely acknowledged are removed." ([section 3.10.7.4](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.10.7.4)) It only ever moves right, and the condition `SND.UNA < SEG.ACK` is what stops an old acknowledgment from moving it back.

The right edge moves when the receiver offers a new window. The same section says the sender sets `SND.WND <- SEG.WND` only "If (SND.WL1 < SEG.SEQ or (SND.WL1 = SEG.SEQ and SND.WL2 =< SEG.ACK))", and explains the check: "The check here prevents using old segments to update the window." (same section) A segment that arrives late cannot move the right edge to a value that was already out of date.

Put the two rules together and a sender's loop looks like this (a reading of the rules above, not a quotation). While the data in flight is less than the window, send more: the right side of the data grows. When an acknowledgment arrives, drop the acknowledged data: the left side shrinks. The two edges move on different events, and neither moves back because of a late message.

## The decision: the right edge should not move left

The receiver may offer any window, so it could offer a smaller one than before. The standard says what it thinks of that: "The mechanisms provided allow a TCP endpoint to advertise a large window and to subsequently advertise a much smaller window without having accepted that much data. This so-called 'shrinking the window' is strongly discouraged. The robustness principle [19] dictates that TCP peers will not shrink the window themselves, but will be prepared for such behavior on the part of other TCP peers." ([section 3.8.6](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.8.6)) The rule that follows is split between the two ends: "A TCP receiver SHOULD NOT shrink the window, i.e., move the right window edge to the left (SHLD-14). However, a sending TCP peer MUST be robust against window shrinking, which may cause the 'usable window' (see Section 3.8.6.2.1) to become negative (MUST-34)." (same section)

The receiver is asked never to move the right edge left, and the sender is asked to cope if one does. When the usable window is negative the standard tells the sender what to do: it "SHOULD NOT send new data (SHLD-15), but SHOULD retransmit normally the old unacknowledged data between SND.UNA and SND.UNA+SND.WND (SHLD-16)". (same section) The standard also gives the cost of the opposite mistake, offering too much: "If more data arrives than can be accepted, it will be discarded. This will result in excessive retransmissions, adding unnecessarily to the load on the network and the TCP endpoints." (same section) The standard does not spell out a longer reason for SHLD-14 than the robustness principle.

In window terms, SHLD-14 asks that the right edge never go backwards. If it never does, data the sender has already sent into the window stays inside it. If it does, the usable window goes negative, which is the case MUST-34 makes the sender handle.

## Two questions about a window of unfixed size

The Problems do not simulate TCP. They ask two questions about the shape of this kind of window, over a sequence of positive segment sizes in the order they are sent.

First: given a window of `W` bytes, what is the greatest number of consecutive segments that fit? Grow the right side while the total is at most `W`; when the next segment would not fit, advance the left side, dropping the oldest segment, until it does. This is the loop above. The left side only moves right and the right side only moves right, so each of the n segments is added once and dropped at most once: O(n) in the **worst case**, with O(1) extra space. Starting afresh at every segment and growing until the window is full is O(n²) in the **worst case**.

Second, the mirror image: given a target of `S` bytes, what is the fewest consecutive segments that carry at least `S`? Here the window grows until it is big enough, and then the left side shrinks it as far as it can while it stays big enough. This is a question about windows, not a claim about TCP. It has the same two-edge shape and the same O(n) cost in the **worst case**.

Both work because the segment sizes are positive. Taking in a segment can only raise the total, and dropping one can only lower it. Without that the left side could not know whether moving helped.

## What the Problems build

The same program as before keeps growing. `flight W` is the first question and `shortest S` is the second. The commands from the last Chapter stay.
