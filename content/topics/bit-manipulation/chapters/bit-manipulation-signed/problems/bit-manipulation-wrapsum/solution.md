For two words `a` and `b`, repeat: `sum = a ^ b`, `carry = (a & b) << 1`, then `a = sum`, `b = carry`, until `b` is 0. At the end `a` is the sum of the original two, kept to 32 bits. Do it word by word: start the total at 0, and fold each word in.

Each round pushes every carry at least one place up. A carry that leaves bit 31 is dropped, because only 32 bits are kept, and that is the wrap. After at most 32 rounds there are no carries, so one addition is O(1) in the worst case and the whole sum is O(n) for n words, with O(1) extra space.

Keep the width in every Language. Go's `uint32` wraps by itself. TypeScript's bitwise operators already work on 32-bit signed integers, so `(a & b) << 1` stays inside 32 bits, and `| 0` or the operators themselves read the result as signed. Python needs `& 0xFFFFFFFF` after the shift, or the carry grows without end, and a conversion to signed at the end.

**Edges.** `4294967295` plus `1` is `0` (all 32 bits set, plus one, carries out of the top and is dropped, which prints `0`). `2147483647` plus `1` prints `-2147483648`. An empty sequence prints `0`.
