Search the trie recursively with the position `i` in the pattern. When `i` is the length of the pattern, the answer for this node is 1 if a key ends here and 0 otherwise. For a letter or digit, go on with the child for that character, and give 0 if there is none. For a `.`, go on with every child and add the answers up.

The pattern runs out exactly at the depth of a matching key, so keys longer than the pattern are not counted, and keys that end earlier are never reached.

Cost, for a pattern of L characters: with no dot it is one walk, O(L) expected. Each dot makes the search branch into every child of that node, so in the **worst case** (a pattern made only of dots) the search visits every node of the tree at depths up to L: O(N) for N nodes. This is the same backtracking, in a smaller form, as the router's search for a literal before a wildcard.
