Put `lo` at the first item and `hi` at the last. While `lo < hi`, swap the two items and move `lo` right and `hi` left. This is the loop in CPython's `reverse_slice`.

The loop swaps floor(n / 2) times. Each swap puts two items in their final places, and the middle item of an odd-length sequence is already in its place. Time is O(n) in the worst case (and in every case), and extra space is O(1): one temporary value. A copy-and-reverse takes O(n) extra space for the same result.

`load` and `show` are the plumbing the later Problems reuse. Note that `show` of an empty sequence prints an empty line.
