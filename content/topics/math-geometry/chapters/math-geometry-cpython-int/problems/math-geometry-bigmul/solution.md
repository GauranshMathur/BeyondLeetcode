Store each number as an array of decimal digits, least significant first, so that the digit at index `i` counts 10^i. The digit of `A` at index `i` times the digit of `B` at index `j` counts 10^(i + j), so it is added into the product's slot `i + j`.

```
z = n + m slots, all 0
for each digit f of A, at index i:
    carry = 0
    for each digit d of B, at index j:
        carry = carry + z[i + j] + d * f
        z[i + j] = carry mod 10
        carry = carry div 10
    z[i + m] = z[i + m] + carry
```

This is the loop from CPython's `x_mul` in the Chapter, in base 10 instead of base 2^30. The carry never passes 9: a slot holds at most 9, so `9 + 9 * 9 + 9` is 99 at the most. At the end, remove the zeros at the top of the array, keeping one digit, and print the digits from the top down.

Cost: the inner loop runs once for each pair of digits, so the time is O(n x m) in the worst case, and it is the same for every input of these sizes. Extra space is O(n + m) for the product.

The Reference Code keeps the Problem 1 commands, and `mul` is one more case.
