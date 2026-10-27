The growth step goes at the top of `call`, before the push. It computes the size in two moves: one doubling that always happens, then more doublings only while the frame still does not fit. A frame bigger than the segment can need several doublings at once: 5,000 bytes on an empty stack goes 2,048, 4,096, 8,192.

The check against the limit comes after the doubling and before any copying. If the stack would overflow, nothing is moved and nothing is pushed; the program prints one line and stops. The runtime stops the program there too (the Chapter shows the `throw`).

Copying costs `used` bytes, not the segment size. That is the part of the stack the runtime moves too.

Complexity. A `call` that moves the stack is O(used) in the **worst case**. Across any run of calls the segment at least doubles on every move, so the total bytes moved are bounded by a small multiple of the final `used`: `call` is O(1) **amortised** per byte of frame. `ret`, `depth`, `used` and the readers are O(1).

Two details are easy to miss. The segment is always 2,048 times a power of two, so with the default limit the largest segment is 536,870,912, because the next one up is over 1,000,000,000. And a `call` that overflows leaves nothing half-done, because the program stops.
