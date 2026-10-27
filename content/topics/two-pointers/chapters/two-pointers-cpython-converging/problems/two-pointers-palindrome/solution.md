Start `lo` at the first item and `hi` at the last. While `lo < hi`:

- if `values[lo]` is 0, move `lo` right;
- else if `values[hi]` is 0, move `hi` left;
- else if the two items differ, the answer is `no`;
- else they match: move both inward.

When the pointers meet, every non-zero item has been paired with its mirror, so the answer is `yes`. Each step moves at least one pointer, so there are at most n steps: O(n) time in the worst case, O(1) extra space. Building a copy without the zeros and comparing it with its reverse also takes O(n) time but O(n) extra space.
