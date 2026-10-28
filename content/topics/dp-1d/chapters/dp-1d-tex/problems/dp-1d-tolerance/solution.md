Fill the same table as `wrap`. For each `j` and each start `i` whose line fits in `W`, compute the unused width. If `j` is below `n` and the unused width is over `T`, skip that start. Otherwise use it as before. A `T` of at least `W` skips nothing, so `tolerant W W` equals `wrap W`; the Reference Code shares one function between the two commands.

**Why it is right.** The rule only removes some lines from the choices. Every layout that obeys it is still a first part plus a last line that obeys it, so the argument for `wrap` carries over with the smaller set of lines. The last line is exempt because it is the end of the paragraph and has nothing after it to balance.

**Cost.** The same as `wrap`: O(n × min(n, W)) in the **worst case**, O(n) space.
