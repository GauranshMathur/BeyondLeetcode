# Add with carries

Java does not stop an integer sum from running past 32 bits. The answer is the low 32 bits of the true sum, read as signed. This Problem asks for that sum, built the way an adder builds it.

Add to the Build:

| Command | What it does | Prints |
|---|---|---|
| `wrapsum` | Adds all the words together, keeping only 32 bits at every step. The sequence does not change. | the sum read as a signed number, from -2147483648 to 2147483647; `0` if the sequence is empty |

Do not use `+` on the words. Use XOR, AND and a shift in a loop: XOR adds the bits without the carries, and AND moved one place to the left is the carries. Repeat with the two results until no carry is left.

## Example

Input:

```
load 100 -30 5
wrapsum
load 2147483647 1
wrapsum
```

Output:

```
75
-2147483648
```

The second sum is 2147483648 in true arithmetic, which does not fit in a signed 32-bit number; its 32 bits read as signed are -2147483648.
