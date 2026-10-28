# Hunspell: ranking spelling suggestions by what two words share

A table over one sequence is a row of numbers, as in the 1-D Topic. Two sequences need a grid. Take two words and let the cell at row `i` and column `j` answer a question about the first `i` letters of one and the first `j` letters of the other. Row 0 and column 0 are the empty prefixes, and the answer for the whole pair sits in the far corner. This Chapter reads one such grid in a spell checker. Hunspell is "a free spell checker and morphological analyzer library and command-line tool" ([README.md, lines 3 to 4](https://github.com/hunspell/hunspell/blob/2969be996acad84b91ab3875b1816636fe61a40e/README.md#L3-L4)), "used by LibreOffice office suite, free browsers, like Mozilla Firefox and Google Chrome" ([lines 6 to 7](https://github.com/hunspell/hunspell/blob/2969be996acad84b91ab3875b1816636fe61a40e/README.md#L6-L7)). The version read is v1.7.2, the commit `2969be9`, and the file is `src/hunspell/suggestmgr.cxx`.

## Where Hunspell asks

For a badly misspelled word, the function `ngsuggest` is there to "generate a set of suggestions for very poorly spelled words" ([line 1113](https://github.com/hunspell/hunspell/blob/2969be996acad84b91ab3875b1816636fe61a40e/src/hunspell/suggestmgr.cxx#L1113); the comment marker dropped). Its first step is to "exhaustively search through all root words" and keep "the MAX_ROOTS most similar root words" ([lines 1120 to 1121](https://github.com/hunspell/hunspell/blob/2969be996acad84b91ab3875b1816636fe61a40e/src/hunspell/suggestmgr.cxx#L1120-L1121); the comment markers dropped). It then re-ranks what it found: "weight suggestions with a similarity index, based on the longest common subsequent algorithm and resort" ([lines 1442 to 1443](https://github.com/hunspell/hunspell/blob/2969be996acad84b91ab3875b1816636fe61a40e/src/hunspell/suggestmgr.cxx#L1442-L1443); the comment markers dropped, and "subsequent" is the source's own spelling). For each guess it calls `int _lcs = lcslen(word, gl.c_str());` ([line 1471](https://github.com/hunspell/hunspell/blob/2969be996acad84b91ab3875b1816636fe61a40e/src/hunspell/suggestmgr.cxx#L1471)), and the score begins "length of longest common subsequent minus length difference" followed by `2 * _lcs - abs((int)(n - len)) +` ([lines 1516 to 1517](https://github.com/hunspell/hunspell/blob/2969be996acad84b91ab3875b1816636fe61a40e/src/hunspell/suggestmgr.cxx#L1516-L1517); the comment marker dropped). Read it as twice the length of the shared subsequence, minus how far the two words are apart in length, with more terms added to the same expression ([lines 1515 to 1532](https://github.com/hunspell/hunspell/blob/2969be996acad84b91ab3875b1816636fe61a40e/src/hunspell/suggestmgr.cxx#L1515-L1532)).

A **subsequence** of a word keeps some of its letters in their original order, not necessarily next to each other. The **longest common subsequence** of two words is the longest word that is a subsequence of both. Typed `definately` against the guess `definitely`, it is `defintely`, 9 letters, so the first term is 2 × 9 = 18 and the length difference is 0 (arithmetic on the formula above, not output of Hunspell).

## The table in the source

The function that computes it is introduced by one comment, "longest common subsequence" ([line 2190](https://github.com/hunspell/hunspell/blob/2969be996acad84b91ab3875b1816636fe61a40e/src/hunspell/suggestmgr.cxx#L2190); the comment marker dropped). It allocates two arrays, one byte for every pair of prefix lengths from 0 to `m` and from 0 to `n`, where `m` and `n` are the lengths of the two words: `char* c = new char[(m + 1) * (n + 1)];` and `char* b = new char[(m + 1) * (n + 1)];` ([lines 2205 to 2206](https://github.com/hunspell/hunspell/blob/2969be996acad84b91ab3875b1816636fe61a40e/src/hunspell/suggestmgr.cxx#L2205-L2206)). `c` holds the lengths. `b` holds a direction for each cell, one of three names: `enum { LCS_UP, LCS_LEFT, LCS_UPLEFT };` ([src/hunspell/suggestmgr.hxx, line 91](https://github.com/hunspell/hunspell/blob/2969be996acad84b91ab3875b1816636fe61a40e/src/hunspell/suggestmgr.hxx#L91)). Row 0 and column 0 are set to 0 ([lines 2207 to 2210](https://github.com/hunspell/hunspell/blob/2969be996acad84b91ab3875b1816636fe61a40e/src/hunspell/suggestmgr.cxx#L2207-L2210)): the empty prefix shares nothing with anything. The cell at row `i` and column `j` is `c[i * (n + 1) + j]`, so each row holds `n + 1` cells, and the rest is filled by this:

```c
if (((utf8) && (su[i - 1] == su2[j - 1])) ||
    ((!utf8) && (s[i - 1] == s2[j - 1]))) {
  c[i * (n + 1) + j] = c[(i - 1) * (n + 1) + j - 1] + 1;
  b[i * (n + 1) + j] = LCS_UPLEFT;
} else if (c[(i - 1) * (n + 1) + j] >= c[i * (n + 1) + j - 1]) {
  c[i * (n + 1) + j] = c[(i - 1) * (n + 1) + j];
  b[i * (n + 1) + j] = LCS_UP;
} else {
  c[i * (n + 1) + j] = c[i * (n + 1) + j - 1];
  b[i * (n + 1) + j] = LCS_LEFT;
}
```

([lines 2213 to 2223](https://github.com/hunspell/hunspell/blob/2969be996acad84b91ab3875b1816636fe61a40e/src/hunspell/suggestmgr.cxx#L2213-L2223); indentation reduced) The condition compares letter `i` of the first word with letter `j` of the second, in the UTF-8 form of the text on its first line and in single-byte text on its second (reading of the condition). When they match, the cell is the cell diagonally up and to the left, plus one, and the direction is `LCS_UPLEFT`. When they do not, the cell is the larger of the cell above and the cell to its left, and the direction says which: on a tie, `>=` sends it up. Each cell reads at most three cells that are already filled, so every cell costs O(1). The two loops run `m` and `n` times ([lines 2211 to 2212](https://github.com/hunspell/hunspell/blob/2969be996acad84b91ab3875b1816636fe61a40e/src/hunspell/suggestmgr.cxx#L2211-L2212)), so the time is O(m × n) in the **worst case**, and so is the space, because both arrays have a cell for every pair.

## Walking back

`lcs` frees the lengths with `delete[] c;` and hands back only the directions with `return b;` ([lines 2226 and 2229](https://github.com/hunspell/hunspell/blob/2969be996acad84b91ab3875b1816636fe61a40e/src/hunspell/suggestmgr.cxx#L2226-L2229)). The caller, `lcslen`, starts at the far corner and follows the directions back:

```c
while ((i != 0) && (j != 0)) {
  if (result[i * (n + 1) + j] == LCS_UPLEFT) {
    len++;
    i--;
    j--;
  } else if (result[i * (n + 1) + j] == LCS_UP) {
    i--;
  } else
    j--;
}
```

([lines 2236 to 2245](https://github.com/hunspell/hunspell/blob/2969be996acad84b91ab3875b1816636fe61a40e/src/hunspell/suggestmgr.cxx#L2236-L2245); indentation reduced) Every diagonal step is one letter of the longest common subsequence, so counting the steps gives its length, and the walk stops when it reaches row 0 or column 0. This code only counts. The same walk could write down `first[i - 1]` at every diagonal step and, read backwards, spell the subsequence itself. That is the reason to keep the table: a number is in one cell, but a **path** needs the choices that led there. The previous Topic's [git Chapter](/chapters/dp-1d-git) read the opposite decision, dropping every row nobody will read again. A table is kept whole when the way back is wanted, and rolled when only the answer is. The last Chapter of this Topic rolls one.

## What the Problems build

The Build holds two words. `words X Y` sets them, `show` prints them, and an empty word is written `-`. `common` prints the corner of the table: the length of the longest common subsequence. `trace` walks back the way `lcslen` does, with the same tie rule, and prints the subsequence. The Extra Problem `weave` uses the same grid with a third word, to ask whether it can be woven from the first two.
