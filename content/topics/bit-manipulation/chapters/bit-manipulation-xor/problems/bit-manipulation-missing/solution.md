XOR all the numbers 0 to `n` and all the words together. Every number that is present is XORed twice and cancels; the missing number is XORed once and is what remains. In one pass: start with `answer = n`, and for each position `i` and word `w`, do `answer ^= i ^ w`. Position `i` runs from 0 to `n - 1`, and with the starting `n` that covers every number from 0 to `n` once.

One pass, so time is O(n) in the worst case, and space is O(1). A sum would also work on paper, `n(n+1)/2` minus the total of the words, but a total of many large words can be wider than a word; XOR never carries, so it cannot.

**Edges.** With an empty sequence `n` is 0 and the missing number is 0. `load 0` has `n` = 1 and prints 1; `load 1` prints 0. When the missing number is `n` itself, the starting value is not cancelled by any word, and that is the answer.
