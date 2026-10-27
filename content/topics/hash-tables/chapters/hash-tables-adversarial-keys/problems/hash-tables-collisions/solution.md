`collide I` is a loop of 10 steps that appends `BB` when the next bit of `I` is set and `Aa` otherwise.

For the table, the new part is only the resize rule for tree bins. A tree bin is split like a chain, and each half is a tree again if it holds more than 6 nodes. With one hash for all keys in the bin, they all fall on the same side, so the tree bin moves whole and stays a tree.

Think about what the flood does. Below 64 bins each long bin only makes the table bigger, and since the keys share a hash it never gets shorter: this is the table doubling again and again for nothing, until it has 64 bins. At 64 bins or more the bin becomes a tree. After that a lookup in it is O(log n) in Java, a worst-case bound the source states for keys that can be ordered, instead of the O(n) of a walk down a chain. This Build keeps the tree bin as a counted list, which is enough for the commands but is not the tree itself.
