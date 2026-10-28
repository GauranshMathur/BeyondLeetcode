# CPython's regex engine: try an alternative, undo it, try the next

Some questions have no formula. Does `a(b|bc)d` match `abcd`? The group offers two ways to go on, and only one of them works. A program that cannot tell in advance has to **try**: pick a way, follow it, and if it fails, go back and pick the other. That is **backtracking**. This Chapter reads how Python's `re` module does it in CPython 3.13.0, and the rule the documentation gives for the order of the tries. In the Problems you build a small matcher that makes the same moves. The list of choices a backtracking search has made so far works like a stack, which the Stacks Topic taught, and the way back is to take choices off it.

## A decision tree

Match `a(b|bc)d` against `abcd`. The letter `a` matches. The group then has two alternatives. The first, `b`, matches at position 1, but then `d` must match at position 2, where the text has `c`: a dead end. Go back to the group and take the second alternative, `bc`. It matches positions 1 and 2, `d` matches position 3, and the text is used up: a match. Every group is a fork, and the choices made so far are a path from the root. The search walks the tree depth first and left to right, and each step has three parts: **choose** an alternative, **explore** what follows from it, and **undo** the choice if the exploring failed. This tree is drawn here for the example; the sources below say what CPython does with it.

## The order the documentation promises

The documentation of `re` says what a `|` means for the order of the tries. "As the target string is scanned, REs separated by '|' are tried from left to right. When one pattern completely matches, that branch is accepted." ([Doc/library/re.rst, lines 300 to 302](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Doc/library/re.rst#L300-L302)) And the consequence: "This means that once A matches, B will not be tested further, even if it would produce a longer overall match." ([lines 302 to 304](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Doc/library/re.rst#L302-L304)) So the first complete way found wins, and the order of the alternatives decides which way that is. Take `(a|ab)(c|bc)` on `abc`. The first group tries `a`, then the second group tries `c` (fails at the letter `b`) and `bc` (matches), so the answer is `a` then `bc`. The way `ab` then `c` also matches, but it is never reached (reasoning on the example).

## The code: save, try, restore

The engine is C code in `Modules/_sre/sre_lib.h`. The opcode for an alternation, `BRANCH`, is the whole loop in 32 lines:

```c
TARGET(SRE_OP_BRANCH):
    /* alternation */
    /* <BRANCH> <0=skip> code <JUMP> ... <NULL> */
    TRACE(("|%p|%p|BRANCH\n", pattern, ptr));
    LASTMARK_SAVE();
    if (state->repeat)
        MARK_PUSH(ctx->lastmark);
    for (; pattern[0]; pattern += pattern[0]) {
        if (pattern[1] == SRE_OP_LITERAL &&
            (ptr >= end ||
             (SRE_CODE) *ptr != pattern[2]))
            continue;
        if (pattern[1] == SRE_OP_IN &&
            (ptr >= end ||
             !SRE(charset)(state, pattern + 3,
                           (SRE_CODE) *ptr)))
            continue;
        state->ptr = ptr;
        DO_JUMP(JUMP_BRANCH, jump_branch, pattern+1);
        if (ret) {
            if (state->repeat)
                MARK_POP_DISCARD(ctx->lastmark);
            RETURN_ON_ERROR(ret);
            RETURN_SUCCESS;
        }
        if (state->repeat)
            MARK_POP_KEEP(ctx->lastmark);
        LASTMARK_RESTORE();
    }
    if (state->repeat)
        MARK_POP_DISCARD(ctx->lastmark);
    RETURN_FAILURE;
```

([Modules/_sre/sre_lib.h, lines 850 to 881](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Modules/_sre/sre_lib.h#L850-L881)) Read it as the three steps. Line 854, `LASTMARK_SAVE()`, saves the state before anything is tried. The `for` loop on line 857 walks the alternatives in order. `DO_JUMP` on line 868 runs the match from that alternative, and the result comes back in `ret`. If `ret` is true, the loop ends with `RETURN_SUCCESS` and no later alternative is looked at, which is the "first complete way wins" rule. If it is false, `LASTMARK_RESTORE()` on line 877 undoes whatever the failed try changed, and the loop goes on to the next alternative. When the loop runs out, `RETURN_FAILURE` on line 881 makes this whole call fail, so whoever called it undoes its own choice and moves on. The `if (state->repeat)` lines also push and pop the marks, with the `MARK_PUSH` and `MARK_POP` macros, when the match is inside a repeat; this Chapter leaves them aside.

What is saved? The engine's own comment says which calls need protecting: "The macros below should be used to protect recursive SRE(match)() calls that *failed* and do *not* return immediately (IOW, those that will backtrack)." ([sre_lib.h, lines 337 to 339](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Modules/_sre/sre_lib.h#L337-L339)) The two macros are small:

```c
#define LASTMARK_SAVE()     \
    do { \
        ctx->lastmark = state->lastmark; \
        ctx->lastindex = state->lastindex; \
    } while (0)
#define LASTMARK_RESTORE()  \
    do { \
        state->lastmark = ctx->lastmark; \
        state->lastindex = ctx->lastindex; \
    } while (0)
```

([lines 365 to 374](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Modules/_sre/sre_lib.h#L365-L374)) Save copies two numbers out of the state, `lastmark` and `lastindex`, and restore copies them back. They belong to the match state, which holds "marks": `int lastmark; int lastindex; const void** mark;` ([Modules/_sre/sre.h, lines 88 to 91](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Modules/_sre/sre.h#L88-L91)). A mark is a start or end position of a group, as the match object's own field says: "number of groups (start/end marks)" ([sre.h, line 51](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Modules/_sre/sre.h#L51)). So the undo that `BRANCH` performs between two alternatives is putting those two numbers back (a reading of the macros above).

## What it costs

The tree is the cost. A pattern with n groups of k alternatives each has up to k^n paths, because each group multiplies the number of paths by k (arithmetic on the tree), and a search that fails on every path walks all of them. That is exponential in the **worst case**. The next Chapter reads how Go avoids it.

## What the Problems build

The Build is a matcher for a tiny pattern language: letters, and groups such as `(b|bc)`. `match` walks the tree as above and prints which alternative each group used. The Extra Problems use the same three steps on other trees. `find` walks a grid of letters, where marking a cell as used is the choose and clearing the mark is the undo. `cuts` cuts a word into palindromes, where each cut is a choice. The Hints point back here when a Problem needs the undo.
