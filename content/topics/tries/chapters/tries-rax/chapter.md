# Redis rax: the edge lives in the parent

A **trie** (or prefix tree) stores keys by their characters. The root stands for the empty string, and each step down the tree adds one character, so every key is a path and two keys that start the same share their first nodes. Redis keeps a stream's entries in one: `rax *rax; /* The radix tree holding the stream. */` ([src/stream.h, line 17](https://github.com/redis/redis/blob/f60370ce28b946c1146dcea77c9c399d39601aaa/src/stream.h#L17)). The tree is called **rax**. This Chapter reads Redis 7.2.5, where the file `src/rax.h` opens with a drawing of it, and asks one question about the node: where is the character stored? In the Problems you build the plain tree, and then count the nodes that rax's compression would leave.

## The plain tree

The comment draws a tree that holds the strings "foo", "foobar" and "footer", and begins its first drawing with "This is the vanilla representation:" ([src/rax.h, line 41](https://github.com/redis/redis/blob/f60370ce28b946c1146dcea77c9c399d39601aaa/src/rax.h#L41)). Its legend says: "When the node represents a key inside the radix tree, we write it between [], otherwise it is written between ()." ([lines 38 to 39](https://github.com/redis/redis/blob/f60370ce28b946c1146dcea77c9c399d39601aaa/src/rax.h#L38-L39))

Count the nodes in that drawing: the root (the empty string), then `f`, `fo`, `foo`, `foot`, `foote`, `footer`, `foob`, `fooba` and `foobar`. That is 10 nodes for 3 keys. In the drawing `foo` is written between `[]`, so it is a key, and it also has two children, `t` and `b`. ([lines 43 to 55](https://github.com/redis/redis/blob/f60370ce28b946c1146dcea77c9c399d39601aaa/src/rax.h#L43-L55)) A node can be a key and have children, and most nodes are not keys at all. Your Build keeps that difference: a node holds a value only when a key ends there.

## Where the character is stored

The obvious node holds its own character and a list of children. rax does not. Its node comment reads: "If node is not compressed we have 'size' bytes, one for each children character, and 'size' raxNode pointers, point to each child node." ([lines 105 to 106](https://github.com/redis/redis/blob/f60370ce28b946c1146dcea77c9c399d39601aaa/src/rax.h#L105-L106)) The next sentence names the decision: "Note how the character is not stored in the children but in the edge of the parents" ([lines 107 to 108](https://github.com/redis/redis/blob/f60370ce28b946c1146dcea77c9c399d39601aaa/src/rax.h#L107-L108)). The layout is drawn as `[header iscompr=0][abc][a-ptr][b-ptr][c-ptr](value-ptr?)` ([line 110](https://github.com/redis/redis/blob/f60370ce28b946c1146dcea77c9c399d39601aaa/src/rax.h#L110)): a small header, then the child characters side by side, then one pointer per child.

The header is four bit fields:

```c
    uint32_t iskey:1;     /* Does this node contain a key? */
    uint32_t isnull:1;    /* Associated value is NULL (don't store it). */
    uint32_t iscompr:1;   /* Node is compressed. */
    uint32_t size:29;     /* Number of children, or compressed string len. */
```

([lines 99 to 102](https://github.com/redis/redis/blob/f60370ce28b946c1146dcea77c9c399d39601aaa/src/rax.h#L99-L102))

Put the pieces together. A node with `size` children takes `size` bytes of characters and `size` pointers, and a node with no children takes neither. The cost follows the children a node has, not the size of the alphabet. That is the memory side of the decision. The rax project's README gives the speed side: "Edges are stored as arrays of bytes directly in the parent node, no need to access non useful children while trying to find a match." ([README.md, line 30](https://github.com/antirez/rax/blob/1927550cb218ec3c3dda8b39d82d1d019bf0476d/README.md#L30)) It adds that the edge characters and the edge pointers are kept as "two separated arrays: an array of edge chars and one of edge pointers" ([line 31](https://github.com/antirez/rax/blob/1927550cb218ec3c3dda8b39d82d1d019bf0476d/README.md#L31)), so the characters sit side by side in memory, as the layout above shows. The README is the standalone rax project's, pinned to a commit.

Your Build stores each node's children in a hash map instead of two packed arrays, so each step down is one lookup, O(1) **expected**. A call on a key of L characters walks at most L + 1 nodes, which is O(L) expected. rax scans the edge characters of a node (the README says "scanning of the correct child", [line 31](https://github.com/antirez/rax/blob/1927550cb218ec3c3dda8b39d82d1d019bf0476d/README.md#L31)), so its cost at each level grows with the number of children that node has.

## No parent pointer

A node has no field that points up. The comment says so: "The nodes do not have a "parent" field for space concerns, so we use the auxiliary stack when needed." ([lines 140 to 141](https://github.com/redis/redis/blob/f60370ce28b946c1146dcea77c9c399d39601aaa/src/rax.h#L140-L141)) Deleting a key needs to cut the nodes that lead nowhere, which means walking back up. A walk that remembers its path in a list does the same job, and that is how you will write `del` in Problem 1.

## Chains of one

Look at `foobar` in the drawing: below `foob` every node has one child. rax stores such a chain in one node. The comment says: "However, this implementation implements a very common optimization where successive nodes having a single child are "compressed" into the node itself as a string of characters, each representing a next-level child, and only the link to the node representing the last character node is provided inside the representation." ([src/rax.h, lines 57 to 61](https://github.com/redis/redis/blob/f60370ce28b946c1146dcea77c9c399d39601aaa/src/rax.h#L57-L61)) In the second drawing the same three keys take 6 nodes instead of 10: the root holds `foo`, `foot` holds `er`, and `foob` holds `ar`. ([lines 64 to 70](https://github.com/redis/redis/blob/f60370ce28b946c1146dcea77c9c399d39601aaa/src/rax.h#L64-L70))

The optimisation has a price, which the comment also states. Adding "first" means "a "node splitting" operation is needed, since the "foo" prefix is no longer composed of nodes having a single child one after the other." ([lines 72 to 75](https://github.com/redis/redis/blob/f60370ce28b946c1146dcea77c9c399d39601aaa/src/rax.h#L72-L75)) After the split the tree has 10 nodes again, by the count of the third drawing ([lines 79 to 89](https://github.com/redis/redis/blob/f60370ce28b946c1146dcea77c9c399d39601aaa/src/rax.h#L79-L89)). Deleting works the other way: "Similarly after deletion, if a new chain of nodes having a single child is created (the chain must also not include nodes that represent keys), it must be compressed back into a single node." ([lines 91 to 93](https://github.com/redis/redis/blob/f60370ce28b946c1146dcea77c9c399d39601aaa/src/rax.h#L91-L93))

Which nodes may share a chain? The code that recompresses after a delete says: "Compressed nodes represent chains of nodes that are not keys and have a single child". ([src/rax.c, lines 1095 to 1096](https://github.com/redis/redis/blob/f60370ce28b946c1146dcea77c9c399d39601aaa/src/rax.c#L1095-L1096)) The function that builds a chain adds one case: the node it turns into a chain "can be a key or not: this property and the associated value if any will be preserved." ([lines 391 to 392](https://github.com/redis/redis/blob/f60370ce28b946c1146dcea77c9c399d39601aaa/src/rax.c#L391-L392)) So the first node of a chain may be a key, and the nodes it absorbs may not.

Problem 2 turns those sentences into a rule you can count with. Read it as this Problem's rule, written from the comments above. It is not a copy of rax's code, and the Problem does not claim that rax's own node counter would agree with it after every sequence of inserts and deletes.

## What the Build leaves out

The Build stores integers and prints counts. It does not store `iscompr`, packed bytes or value pointers, and it never allocates a compressed node: Problem 2 only counts what compression would leave. rax takes a key as a pointer and a length: `int raxInsert(rax *rax, unsigned char *s, size_t len, void *data, void **old);` ([src/rax.h, line 193](https://github.com/redis/redis/blob/f60370ce28b946c1146dcea77c9c399d39601aaa/src/rax.h#L193)). The Build's keys are letters and digits.
