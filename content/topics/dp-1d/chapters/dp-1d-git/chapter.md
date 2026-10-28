# git: keeping only the rows the recurrence reads

A table of answers has more entries than you ever need at once. In many recurrences an entry reads only the few entries just before it, and once those few readers are done an old entry is never looked at again. Its slot can be reused. When you type a git command that does not exist, git suggests the nearest real one, and the function that measures "nearest" is a table filled by exactly such a recurrence, which keeps only the last three of its rows ([levenshtein.c, lines 12 to 13](https://github.com/git/git/blob/39bf06adf96da25b87c9aa7d35a32ef3683eb4a4/levenshtein.c#L12-L13)). This Chapter reads that function in git 2.46.0 (the commit tagged `v2.46.0`), and then applies the same decision one dimension down, where the rows become a few numbers.

## Where git uses it

When git cannot find a command, `help_unknown_cmd` scores every candidate against what you typed: `levenshtein(cmd, candidate, 0, 2, 1, 3) + 1` ([help.c, lines 670 to 671](https://github.com/git/git/blob/39bf06adf96da25b87c9aa7d35a32ef3683eb4a4/help.c#L670-L671)). It then prints "git: '%s' is not a git command. See 'git --help'." ([line 727](https://github.com/git/git/blob/39bf06adf96da25b87c9aa7d35a32ef3683eb4a4/help.c#L727)) and, when one is close enough, "The most similar command is" or "The most similar commands are" ([lines 729 to 733](https://github.com/git/git/blob/39bf06adf96da25b87c9aa7d35a32ef3683eb4a4/help.c#L729-L733)). The four numbers are the cost of a swap, a substitution, an addition and a deletion. The function's comment names the weights "w (as in "sWap")", "s (as in "Substitution")", "a (for insertion, AKA "Add")" and "d (as in "Deletion")", and its signature ends `int w, int s, int a, int d` ([levenshtein.c, lines 34 to 42](https://github.com/git/git/blob/39bf06adf96da25b87c9aa7d35a32ef3683eb4a4/levenshtein.c#L34-L42); the comment markers dropped). So a swap is free here, a substitution costs 2, an addition 1 and a deletion 3 (reading the call against the signature).

## Three rows, not a matrix

The file's comment states the method and the saving: "The idea is to build a distance matrix for the substrings of both strings. To avoid a large space complexity, only the last three rows are kept in memory (if swaps had the same or higher cost as one deletion plus one insertion, only two rows would be needed)." ([levenshtein.c, lines 11 to 14](https://github.com/git/git/blob/39bf06adf96da25b87c9aa7d35a32ef3683eb4a4/levenshtein.c#L11-L14); the comment markers dropped) A matrix has one row per letter of the first string and one column per letter of the second. The comment then names the three rows that remain: "row2 holds the current row, row1 the previous row (i.e. for the substring of string1 of length "i"), and row0 the row before that." ([lines 19 to 20](https://github.com/git/git/blob/39bf06adf96da25b87c9aa7d35a32ef3683eb4a4/levenshtein.c#L19-L20); the comment markers dropped) The function allocates three arrays of `len2 + 1` numbers, one each ([lines 48 to 50](https://github.com/git/git/blob/39bf06adf96da25b87c9aa7d35a32ef3683eb4a4/levenshtein.c#L48-L50)), and the cell it is filling reads only cells in those three:

```c
/* substitution */
row2[j + 1] = row1[j] + s * (string1[i] != string2[j]);
/* swap */
if (i > 0 && j > 0 && string1[i - 1] == string2[j] &&
		string1[i] == string2[j - 1] &&
		row2[j + 1] > row0[j - 1] + w)
	row2[j + 1] = row0[j - 1] + w;
/* deletion */
if (row2[j + 1] > row1[j + 1] + d)
	row2[j + 1] = row1[j + 1] + d;
/* insertion */
if (row2[j + 1] > row2[j] + a)
	row2[j + 1] = row2[j] + a;
```

([levenshtein.c, lines 59 to 71](https://github.com/git/git/blob/39bf06adf96da25b87c9aa7d35a32ef3683eb4a4/levenshtein.c#L59-L71)) The substitution and the deletion read the previous row, `row1`, and the addition reads the cell just filled in the current row; only the swap reaches two rows back, to `row0` (reading of the lines above). That is the whole reason there are three rows and not two, and it is what the comment says. When a row is finished the three names move one place, and the oldest array becomes the next current row:

```c
dummy = row0;
row0 = row1;
row1 = row2;
row2 = dummy;
```

([levenshtein.c, lines 74 to 77](https://github.com/git/git/blob/39bf06adf96da25b87c9aa7d35a32ef3683eb4a4/levenshtein.c#L74-L77)) No row is allocated after the first three. The function's answer is one number, `i = row1[len2];` and later `return i;` ([lines 80 and 85](https://github.com/git/git/blob/39bf06adf96da25b87c9aa7d35a32ef3683eb4a4/levenshtein.c#L80-L85)). Time is still the size of the whole matrix, O(len1 × len2) in the **worst case**, because every cell is still computed (arithmetic on the two nested loops, [lines 54 and 58](https://github.com/git/git/blob/39bf06adf96da25b87c9aa7d35a32ef3683eb4a4/levenshtein.c#L54-L58)). Only the space changed, from len1 × len2 numbers to 3 × (len2 + 1).

## The same decision on a line

The rule is to keep as many past entries as the recurrence reaches back. A one-dimensional recurrence has no rows, only numbers. If `best[i]` is the best total for the first `i` items and it is `max(best[i-1], best[i-2] + v)`, it reaches back two, so two variables are enough. After each item the older one takes the newer's value and the newer takes the result, the same shift as the four lines above. Time stays O(n) in the **worst case**, and space falls from O(n) to O(1). If it is `max(best[i-1], best[i-K] + v)`, it reaches back `K`, and the numbers kept are the last `K`. Each is overwritten at slot `i mod K` exactly when it can no longer be read, a **ring** of `K` numbers: O(K) space (arithmetic on the recurrence).

What you give up is the path. A table that is kept can be walked back to see which items were chosen. TeX kept `best_place` for that ([the previous Chapter](/chapters/dp-1d-tex)), and git's function keeps nothing but the distance. When the answer is the only thing wanted, the table can go.

## What the Problems build

The sequence is now a list of values, which may be negative. `rob` picks items so that no two neighbours are both picked, with two variables. `spread K` generalises it to picks at least `K` apart, with a ring of `K` numbers. Choosing nothing is allowed, so the total is never below 0.
