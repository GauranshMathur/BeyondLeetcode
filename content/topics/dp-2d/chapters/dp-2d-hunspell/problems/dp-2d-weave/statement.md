# Two words woven into one

An **Extra Problem**: it branches off after `trace` and does not affect completing the Topic.

Hunspell's grid compares two words letter by letter. The same grid answers a different question about a third word: can it be made by weaving the first two together?

Add:

| Command | What it does | Prints |
|---|---|---|
| `weave T` | Tells whether `T` is a weave of the first and the second word. | `yes` or `no` |

`T` is a **weave** of the two words if you can split its letters into two groups, so that the letters of one group in order spell the first word and the letters of the other in order spell the second word. Every letter of `T` belongs to exactly one group. `T` is 0 to 2000 letters, and an empty `T` is written `-`. The words do not change.

## Example

Input:

```
words abc abd
weave abcabd
weave aabbcd
weave abdabc
words - abc
weave abc
weave abd
```

Output:

```
yes
yes
yes
yes
no
```

`abcabd` is all of `abc`, then all of `abd`. In `aabbcd` the letters alternate: `a` from `abc`, `a` from `abd`, `b` from `abc`, `b` from `abd`, `c`, `d`. `abdabc` is the second word first. With an empty first word, a weave is the second word itself: `abc` is one and `abd` is not.
