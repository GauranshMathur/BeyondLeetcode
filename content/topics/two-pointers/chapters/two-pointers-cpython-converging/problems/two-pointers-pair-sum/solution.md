Set `lo = 0` and `hi = n - 1`. While `lo < hi`, look at `total = values[lo] + values[hi]`:

- equal to `T`: print `lo + 1` and `hi + 1`;
- smaller than `T`: move `lo` right;
- bigger than `T`: move `hi` left.

If the pointers meet, print `none`.

**Why it is right.** Claim: at every step, every pair that sums to `T` has both its positions inside `lo..hi`. At the start that holds. Suppose the sum is too small. Any pair that uses position `lo` needs a partner at a position `j <= hi`, and the item at `j` is at most the item at `hi` (the sequence is sorted), so that pair sums to at most `total`, which is too small. So no answer uses `lo` and moving it loses nothing. The too-big case is the same for `hi`. When the sum equals `T`, the pair found has the smallest left position and the largest right position of any answer, because every answer lies inside `lo..hi`. That is the tie rule in the statement.

**Cost.** Each step moves a pointer, so at most n - 1 steps: O(n) in the worst case, O(1) extra space. Trying every pair is O(n^2), and one of the Hidden Tests is large enough to make that slow.
