# Flags in words

The kernel keeps a set of numbered flags as an array of words, one bit per flag, and finds bit `nr` in word `nr / BITS_PER_LONG`. In the Build the words are 32 bits wide, so the sequence is now also an array of flags.

Flag `i` is bit `i % 32` of word `i / 32` (whole-number division, rounding down), and bit 0 is the lowest bit of a word. Add to the Build:

| Command | What it does | Prints |
|---|---|---|
| `set I` | Turns flag `I` on. | nothing |
| `clear I` | Turns flag `I` off. | nothing |
| `flip I` | Turns flag `I` on if it is off and off if it is on. | nothing |
| `test I` | Reads flag `I`. | `1` if it is on, `0` if it is off |

`I` is from 0 to 1,000,000. A flag past the end of the sequence is off. `set` and `flip` on a flag past the end first add words with value 0 to the end, as many as it takes to have the word that holds the flag, and no more. `clear` and `test` never add words. No command ever removes a word: clearing the only flag of the last word leaves a word of 0.

## Example

Input:

```
set 3
set 40
test 3
test 4
ushow
flip 3
clear 40
ushow
```

Output:

```
1
0
8 256
0 0
```

`set 3` makes one word with value 8. `set 40` adds a second word, and flag 40 is bit 8 of it, so its value is 256. The last two commands turn both flags off, and the sequence is still two words long.
