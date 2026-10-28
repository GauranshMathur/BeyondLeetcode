A ServeMux wildcard matches exactly one segment. Give the trie the same for characters: count the stored keys that fit a pattern in which a dot stands for any one character. The source for each claim is in [Go ServeMux: a tree of path segments](/chapters/tries-servemux).

New command:

| Command | What it does | Prints |
|---|---|---|
| `find PATTERN` | Counts the stored keys that match `PATTERN` entirely. | the count |

`PATTERN` is 1 to 20 characters, each a lowercase letter, a digit, or `.`. A letter or digit matches only itself. A `.` matches any one character, never none and never two. A key matches when it has the same length as the pattern and every character fits. A key that only starts like the pattern, or that is only a prefix of it, does not match.

The keys come from `add` and `del` of Problem 1. There are at most 2,000 commands.

## Example

Input:

```
add cat 1
add cot 2
add cut 3
add ct 4
add cats 5
find c.t
find c..
find cat
find ....
```

Output:

```
3
3
1
1
```

`c.t` fits `cat`, `cot` and `cut`, but not `ct` (too short) or `cats` (too long). `c..` fits the same three. `....` fits only `cats`.
