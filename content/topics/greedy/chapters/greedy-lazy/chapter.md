# zlib: when taking the longest match is a guess

Three Chapters have shown a greedy rule next to the argument that makes it safe. This one is the other half of the story: a rule that looks right, that a real compressor uses, and that has no such argument. The system is the matching half of DEFLATE: the same format ([RFC 1951](https://www.rfc-editor.org/rfc/rfc1951.html)) and the same zlib 1.3.1 as the last Chapter, with code links at the commit that the tag v1.3.1 names (`51b7f2abdade71cd9bb0e7a373ef2610ec6f9daf`).

## Take the longest match

A DEFLATE compressor turns a text into **tokens**: a literal byte, or a match, which points back at an earlier copy of the text and has a length from 3 to 258 ([RFC 1951, section 3.2.5](https://www.rfc-editor.org/rfc/rfc1951.html#section-3)). The specification describes how a compressor can find matches, in a section that it says is not required: "a compressor need not follow it in order to be compliant". ([RFC 1951, section 4](https://www.rfc-editor.org/rfc/rfc1951.html#section-4)) The compressor "compares all strings on the XYZ hash chain with the actual input data sequence starting at the current point, and selects the longest match." ([RFC 1951, section 4](https://www.rfc-editor.org/rfc/rfc1951.html#section-4)) That is a greedy rule: at this position, take the longest match.

zlib's fast function does just that and nothing more: "This function does not perform lazy evaluation of matches and inserts new strings in the dictionary only for unmatched strings or for short matches. It is used only for the fast compression options." ([deflate.c, lines 1807 to 1809](https://github.com/madler/zlib/blob/51b7f2abdade71cd9bb0e7a373ef2610ec6f9daf/deflate.c#L1807-L1809)) Even this is not always the longest match that exists. zlib's own notes say why: "To avoid a worst-case situation, very long hash chains are arbitrarily truncated at a certain length, determined by a runtime option (level parameter of deflateInit). So deflate() does not always find the longest possible match but generally finds a match which is long enough." ([doc/algorithm.txt, lines 32 to 35](https://github.com/madler/zlib/blob/51b7f2abdade71cd9bb0e7a373ef2610ec6f9daf/doc/algorithm.txt#L32-L35))

## The patch: wait one position

The other function adds a step. Its comment: "Same as above, but achieves better compression. We use a lazy evaluation for matches: a match is finally adopted only if there is no better match at the next window position." ([deflate.c, lines 1906 to 1908](https://github.com/madler/zlib/blob/51b7f2abdade71cd9bb0e7a373ef2610ec6f9daf/deflate.c#L1906-L1908)) The specification describes the same step: "after a match of length N has been found, the compressor searches for a longer match starting at the next input byte. If it finds a longer match, it truncates the previous match to a length of one (thus producing a single literal byte) and then emits the longer match." ([RFC 1951, section 4](https://www.rfc-editor.org/rfc/rfc1951.html#section-4)) In the code the test is one line:

```c
        /* If there was a match at the previous step and the current
         * match is not better, output the previous match:
         */
        if (s->prev_length >= MIN_MATCH && s->match_length <= s->prev_length) {
```

([deflate.c, lines 1964 to 1967](https://github.com/madler/zlib/blob/51b7f2abdade71cd9bb0e7a373ef2610ec6f9daf/deflate.c#L1964-L1967).) Otherwise the previous position is given up as a literal: "If there was a match but the current match is longer, truncate the previous match to a single literal." ([deflate.c, lines 1995 to 1997](https://github.com/madler/zlib/blob/51b7f2abdade71cd9bb0e7a373ef2610ec6f9daf/deflate.c#L1995-L1997)) A match is kept unless the next position has a strictly longer one. A note at the top of `deflate.c` credits the idea: "The idea of lazy evaluation of matches is due to Jan-Mark Wams, and I found it in 'freeze' written by Leonid Broukhis." ([deflate.c, lines 33 to 34](https://github.com/madler/zlib/blob/51b7f2abdade71cd9bb0e7a373ef2610ec6f9daf/deflate.c#L33-L34)) The notes add that "The lazy match evaluation is not performed for the fastest compression modes (level parameter 1 to 3)." ([doc/algorithm.txt, lines 51 to 52](https://github.com/madler/zlib/blob/51b7f2abdade71cd9bb0e7a373ef2610ec6f9daf/doc/algorithm.txt#L51-L52))

## Why neither rule is a proof

The Problem keeps only these two rules, simplified, on a **table** that gives the longest match at each position. Both are guesses, and the table shows it in two directions. On `3 8 0 0 0 0 0 0 0` the greedy rule takes the 3 at position 0 and is left with six positions that have no match: 7 tokens. The lazy rule sees the 8 at position 1, writes position 0 as a literal and takes the 8: 2 tokens. Waiting wins.

On `5 6 0 0 0 5 0 0 0 0` it loses. The greedy rule takes the 5 at position 0 and the 5 at position 5: 2 tokens. The lazy rule sees that position 1 has a 6, which is longer than 5. It writes position 0 as a literal and takes the 6, which covers positions 1 to 6. The 5 at position 5 is gone, and positions 7, 8 and 9 have no match: 1 + 1 + 3 = 5 tokens. A longer match was better at its position and worse for what it left behind. These tables are the Problem's, not data from zlib, and the claim is not that zlib does worse on real text. The comment on zlib's lazy function says it "achieves better compression" ([deflate.c, line 1906](https://github.com/madler/zlib/blob/51b7f2abdade71cd9bb0e7a373ef2610ec6f9daf/deflate.c#L1906)), and nothing here contradicts that. The point is narrower: neither rule has the exchange argument of the earlier Chapters, because the choice at one position changes which later matches are still possible. A rule like that is a heuristic, and zlib treats it as one: it has "Values for max_lazy_match, good_match and max_chain_length, depending on the desired pack level (0..9)" ([deflate.c, lines 93 to 94](https://github.com/madler/zlib/blob/51b7f2abdade71cd9bb0e7a373ef2610ec6f9daf/deflate.c#L93-L94)).

## A greedy choice that is provably safe

Change the rule and the answer changes. The Extra Problem lets a match be cut to any length from 1 to its item. It is the Problem's rule, not DEFLATE's: DEFLATE's shortest match is 3. A token is then a jump from a position to any later position within reach, and the fewest tokens is the fewest jumps to the end. Here a safe greedy choice exists, and it is not to take the longest jump from where you stand. Keep the furthest position that the current number of jumps can reach. Each time the walk gets there, one more jump is unavoidable, and the best one lands on the position that reaches furthest of all those passed. The exchange argument is that the jump from the furthest-reaching position can land on every position beyond what any other jump of the same count reaches, and the nearer positions were already reachable with fewer jumps. On `3 0 7 0 0 0 0 0 0` that choice cuts the 3 to 2 and then takes the 7: 2 tokens, where both rules above need 7.

## The cost

All of the rules are one pass over `n` positions, each position the start of at most one token: O(n) in the **worst case**, with O(1) extra space. A real compressor's cost is dominated by the search for matches, which the Problem does not model. That search is what zlib cuts short, as the quote above says.

## What the Problems build

`greedy` and `lazy` print the number of tokens each rule writes for the loaded table, and the Extra Problem `reach` prints the fewest tokens when matches may be cut. The program now holds the four pieces of the Topic: the blocks, the Huffman cost, the deadline order and the parse.
