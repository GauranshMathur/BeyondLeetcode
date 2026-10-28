Each node holds a map from a character to its child and a value that is empty unless a key ends at the node. `add` walks down the key, creating a node for each character that has none, and sets the value at the end. `get` walks down and prints the value, or `none` if a node is missing or the last node holds no value. A prefix node that holds no value is not a key, which is why `get a` prints `none` after `add ab 1`.

`del` walks down once and keeps the path. If the end of the path is missing or holds no value, nothing was stored and it prints `0`. Otherwise it clears the value and walks back up the path, cutting each node that has no children and no value, and stops at the first one that has either. That stop is what keeps `foo` in the example: it has children. A real rax has no parent pointer either, and uses a stack for the same purpose (see the Chapter).

`nodes` and `size` visit every node once.

Cost, for a key of L characters: `add`, `get` and `del` take O(L) **expected** time, because each step is a lookup in a hash map and one lookup is O(1) expected. `nodes` and `size` are O(N) for N nodes. The tree holds at most one node per character of every stored key, so memory is O(total length of the keys) in the worst case, and less when keys share a prefix.
