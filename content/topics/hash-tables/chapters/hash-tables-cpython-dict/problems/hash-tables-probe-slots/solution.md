All three read commands use one search. It starts at `key & mask`, and while the slot holds another key it moves on with the recurrence, counting the slots it looks at. It stops at a slot holding the key or at an Unused slot. `get` and `probes` report on where it stopped. `put` either replaces the value in a slot it found, or writes the new key into the Unused slot it stopped at.

Shift `perturb` before using it. Doing it after gives a different path for keys with high bits set, and the second example shows exactly that difference.

The test inputs never fill the table: the search for a missing key has to reach an Unused slot to stop. A lookup that hits on its first slot costs O(1). The expected cost stays small only while the table is not nearly full; the worst case is O(n), when every slot the search meets is taken.
