# Read a field as signed

The Linux kernel reads a small signed number out of a word with the helper `sign_extend32`, two shifts and no branch. You start the Build that holds the bit tricks of this Topic.

The Build reads commands from standard input, one per line, and works on one **sequence** of **words**. Blank lines are ignored. The sequence starts empty. Commands that print, print one line. A word is 32 bits. You write a word as a whole number from -2147483648 to 4294967295, and what is kept is its 32 bits: `-1` and `4294967295` are the same word, and so are `-2147483648` and `2147483648`.

| Command | What it does | Prints |
|---|---|---|
| `load w1 w2 ...` | Replaces the sequence with the given words. With no words, the sequence is empty. | nothing |
| `show` | Writes each word as a signed number, from -2147483648 to 2147483647. | the words, separated by single spaces; an empty line if the sequence is empty |
| `ushow` | Writes each word as an unsigned number, from 0 to 4294967295. | the words, separated by single spaces; an empty line if the sequence is empty |
| `signext B` | Takes the lowest `B` bits of each word as a field and reads the field as a signed number of `B` bits, which runs from -2^(`B`-1) up to 2^(`B`-1) - 1. The bits of the word above the field are ignored. The sequence does not change. | the numbers, separated by single spaces; an empty line if the sequence is empty |

`B` is from 1 to 32. With `B` = 32 the field is the whole word, so `signext 32` prints what `show` prints.

## Example

Input:

```
load 200 5 -3
show
ushow
signext 8
```

Output:

```
200 5 -3
200 5 4294967293
-56 5 -3
```

`200` is `11001000` in its low byte, which has its top bit set, so as an 8-bit field it is 200 - 256 = -56. `5` has its top bit clear and stays 5. `-3` is the word `4294967293`, whose low 8 bits are `11111101`, which as an 8-bit field is -3 again.
