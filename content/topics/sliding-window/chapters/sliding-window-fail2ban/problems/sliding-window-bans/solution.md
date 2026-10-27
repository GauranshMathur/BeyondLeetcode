Keep `counts`, a map from host to its failures inside the window, a set `banned`, and a list `order`. For each second `i` with host `h = values[i]`:

1. add one to `counts[h]`;
2. if `i >= F`, let `old = values[i - F]`, take one from `counts[old]`, and delete `old` from the map if its count is now 0;
3. if `counts[h] >= M` and `h` is not in `banned`, add it to both `banned` and `order`.

Print `order`.

**Why it is right.** After step 2 the map holds exactly the counts for seconds `i - F + 1` to `i`. A count only goes up when its host enters the window, so only `h` can newly reach `M` at second `i`. A host already banned is skipped, which gives the "printed once" rule, and `order` is in the order the bans happened.

**Cost.** Each second does a constant number of map operations. Each is O(1) in the **expected** case (the **worst case** of a hash table is covered in the Hash tables Topic), so the run is O(n) expected. Space is O(min(F, n)) for the map plus the bans. This Build uses each Language's built-in map, not the table from the Hash tables Topic. Re-counting the host in the last `F` items at every second is O(n × F) in the worst case.
