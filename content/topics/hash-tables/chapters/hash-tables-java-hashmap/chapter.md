# Java: chains that become trees

CPython's dict walks from slot to slot until it finds room. Java's `HashMap` makes the opposite choice, called **chaining**: each slot of the table, which Java calls a **bin**, holds a list of the entries whose hashes land there, and a key that finds its bin occupied just joins the list. This Chapter reads OpenJDK 21 (`jdk-21+35`) and the rule it adds for the day a list gets too long.

## A table of bins

The implementation notes in `HashMap.java` start with the whole idea: "This map usually acts as a binned (bucketed) hash table, but when bins get too large, they are transformed into bins of TreeNodes". ([HashMap.java, lines 148 to 151](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L148-L151))

`put` takes the bin as the table length minus 1, ANDed with the hash: `tab[i = (n - 1) & hash]`. If the bin is empty, the new node goes there. If not, the code walks the list and either finds the key (and replaces the value) or reaches the last node and links the new one after it. ([putVal, lines 631 to 666](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L631-L666)) New nodes join at the end of the chain, so the chain keeps insertion order. Table lengths are powers of two: "The default initial capacity - MUST be a power of two." ([lines 235 to 238](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L235-L238)) The default is 16: `1 << 4`. ([line 238](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L238))

## Spreading the high bits

Masking keeps only the low bits of the hash, so two hashes that differ only in higher bits would always share a bin. Java fixes this before masking. The comment: "Because the table uses power-of-two masking, sets of hashes that vary only in bits above the current mask will always collide." The code that answers it is one line, `(h = key.hashCode()) ^ (h >>> 16)`: XOR the top 16 bits of the hash into the bottom 16. ([HashMap.hash, lines 320 to 339](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L320-L339)) For an `Integer` the hash code is the value itself: `hashCode()` returns `Integer.hashCode(value)`, which returns `value`. ([Integer.java, lines 1196 to 1198](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/lang/Integer.java#L1196-L1198) and [1209 to 1211](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/lang/Integer.java#L1209-L1211))

A check by hand, with 16 bins. The keys 65536 and 131072 are both multiples of 16, so masked alone they would both land in bin 0. With the spread, 65536 becomes `65536 ^ 1 = 65537` (bin 1) and 131072 becomes `131072 ^ 2 = 131074` (bin 2).

The comment says why one XOR is enough: "because we use trees to handle large sets of collisions in bins, we just XOR some shifted bits in the cheapest possible way".

## Long chains are rare, by design

With a well-spread hash, the comment expects short chains. "Ideally, under random hashCodes, the frequency of nodes in bins follows a Poisson distribution ... with a parameter of about 0.5 on average for the default resizing threshold of 0.75". It tabulates the expected share of bins with `k` nodes: 0.60653066 for none, 0.30326533 for one, down to 0.00000006 for eight, and "more: less than 1 in ten million". ([lines 178 to 200](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L178-L200))

The class documentation turns that into a promise with a condition: "constant-time performance for the basic operations (get and put), assuming the hash function disperses the elements properly among the buckets." ([lines 49 to 51](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L49-L51)) So `get` and `put` are O(1) expected. If every key lands in one bin, a chain of `n` nodes costs O(n) to search, in the worst case.

## A ninth node turns the bin into a tree

Three constants set the policy: `TREEIFY_THRESHOLD = 8`, `UNTREEIFY_THRESHOLD = 6` and `MIN_TREEIFY_CAPACITY = 64`. ([lines 253 to 275](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L253-L275)) The first is documented as: "Bins are converted to trees when adding an element to a bin with at least this many nodes." The check is inside `putVal`: after linking a new node the code tests `binCount >= TREEIFY_THRESHOLD - 1`, with the comment `// -1 for 1st`. ([lines 646 to 651](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L646-L651)) Count it through: the walk starts at the first node, so a new node linked when `binCount` is 7 is the ninth in its bin.

What happens next depends on the table. `treeifyBin` is documented: "Replaces all linked nodes in bin at index for given hash unless table is too small, in which case resizes instead." ([lines 757 to 765](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L757-L765)) Below 64 bins, a long chain is answered by doubling the table. At 64 bins or more, the nodes become a tree.

The reason for trees is in the notes: they give "worst-case O(log n) operations when keys either have distinct hashes or are orderable". They are ordered "primarily by hashCode, but in the case of ties, if two elements are of the same 'class C implements Comparable<C>', type then their compareTo method is used". So "performance degrades gracefully under accidental or malicious usages in which hashCode() methods return values that are poorly distributed, as well as those in which many keys share a hashCode, so long as they are also Comparable." ([lines 159 to 175](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L159-L175)) The proposal that introduced trees, JEP 180, gives the same bound: "In the case of high hash collisions, this will improve worst-case performance from O(n) to O(log n)." ([JEP 180: Handle Frequent HashMap Collisions with Balanced Trees](https://openjdk.org/jeps/180), section "Description")

The trade is size: "Because TreeNodes are about twice the size of regular nodes, we use them only when bins contain enough nodes to warrant use". ([lines 177 to 179](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/HashMap.java#L177-L179)) A tree bin is a different structure, but it is still one bin of the table.

## What you build

Two Problems. First the plain chained table with the spread, then the ninth-node rule with both of its answers, a resize below 64 bins and a tree at 64 or more. The resize that the second one needs is the subject of the next Chapter.
