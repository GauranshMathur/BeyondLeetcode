A delete is a search that ends on a hit: it finds the slot and writes the Dummy marker into it. A search is unchanged except that Dummy is treated like a taken slot, so it keeps going. That is the whole reason for the marker: with Unused, a key placed further along the path would be lost.

`put` is two walks over the same path. The first is the ordinary search, and decides between replacing and inserting. If it inserts, the second walk starts again from the key's first slot and takes the first slot that is Unused or Dummy. This is the order the Chapter's source reads: look up first, then `find_empty_slot`, whose test is "holds a key".

Each walk is O(1) expected and O(n) in the worst case. Dummy slots make searches longer without holding anything, which is why a table that is deleted from a lot is eventually rebuilt (a later Problem).
