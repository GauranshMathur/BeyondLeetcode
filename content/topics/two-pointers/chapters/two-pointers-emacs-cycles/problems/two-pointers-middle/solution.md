Set `slow = fast = S`. While `fast != -1` and the link of `fast` is not `-1`: move `slow` one link and `fast` two links. Print `slow`.

**Why it is the middle.** The fast pointer takes two links in the time the slow one takes one. When the loop stops after r rounds, the fast pointer is at position 2r, which is either just past the end (n = 2r) or on the last node (n = 2r + 1). The slow pointer is at position r, which is `floor(n / 2)` in both cases. Example: for n = 4 the pointers (slow, fast) go (0, 0), (1, 2), then (2, past the end), and the answer is position 2.

Cost: the slow pointer takes about n / 2 steps and the fast one about n, so O(n) time in the worst case and O(1) extra space. Counting the nodes first and walking again also takes O(n) time, but two passes.
