# CPython: matching brackets and evaluating bytecode

A stack is the natural tool for two jobs a language implementation does all the time: checking that brackets match, and evaluating an expression. This Chapter reads how CPython 3.13.0 does each. The first is a stack with a fixed size, in the tokenizer. The second is the interpreter's value stack. In the Problems you build both.

## The tokenizer's bracket stack

Before CPython parses Python source, its tokenizer splits it into tokens. It also tracks how deeply brackets are nested. The state holds a stack in three plain arrays and a counter: `char parenstack[MAXLEVEL]`, `int parenlinenostack[MAXLEVEL]`, `int parencolstack[MAXLEVEL]` and `int level` ([Parser/lexer/state.h, lines 90 to 94](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Parser/lexer/state.h#L90-L94)). `MAXLEVEL` is 200: `#define MAXLEVEL 200        /* Max parentheses level */` ([line 7](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Parser/lexer/state.h#L7)). Each entry is the bracket character and the line it opened on (and its column, which the Build leaves out).

Compare this with the stacks so far. Go's stack grows by moving, and Java's by doubling. This one cannot grow at all. It is an array of 200 slots, and what happens at the limit is a decision about the user: refuse.

**Opening a bracket** (`(`, `[` or `{`) pushes ([Parser/lexer/lexer.c, lines 1182 to 1196](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Parser/lexer/lexer.c#L1182-L1196)). If `tok->level >= MAXLEVEL` it reports a syntax error with the text "too many nested parentheses" instead. Otherwise it stores the bracket, the line number and the column at `tok->level`, and adds one to `level`.

**Closing a bracket** pops, and checks ([lines 1197 to 1235](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Parser/lexer/lexer.c#L1197-L1235)):

- If the stack is empty (`!tok->level`) the error is "unmatched '%c'" with the closing bracket.
- Otherwise the level goes down and the stored opening bracket is compared with the closing one. When they do not pair, the message is "closing parenthesis '%c' does not match opening parenthesis '%c'", and when the opening bracket was on a different line, " on line %d" follows with the line it opened on. The code pops first and then compares, so the mismatched opening bracket is gone either way.

**At the end of the input**, an unclosed bracket is reported by the parser, not the tokenizer: when it reaches the end of file with `p->tok->level` not zero, `raise_unclosed_parentheses_error` names the bracket on top of the stack, the innermost one still open, with the text "'%c' was never closed" ([Parser/pegen_errors.c, lines 51 to 58](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Parser/pegen_errors.c#L51-L58) and [lines 76 to 79](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Parser/pegen_errors.c#L76-L79) and [lines 423 to 426](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Parser/pegen_errors.c#L423-L426)).

So the whole check is one stack, O(1) per character in the **worst case** and O(n) for n characters. The stack takes at most 200 entries (O(1) space) because of the limit; without a limit it would take as many as there are open brackets.

## The interpreter's value stack

CPython's bytecode is a program for a stack machine. The documentation of the `dis` module (the bytecode disassembler) describes each instruction by what it does to the stack. `LOAD_CONST` "Pushes `co_consts[consti]` onto the stack" ([Doc/library/dis.rst, lines 1071 to 1073](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Doc/library/dis.rst#L1071-L1073)). `BINARY_OP` takes two:

```
rhs = STACK.pop()
lhs = STACK.pop()
STACK.append(lhs op rhs)
```

([lines 657 to 664](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Doc/library/dis.rst#L657-L664))

Instructions run in order, so a program that loads the operands first and applies each operator afterwards, such as load 3, load 4, add, load 2, multiply, computes `(3 + 4) * 2` without any brackets: the order of the instructions already says what binds to what. That operand-first order is called **postfix** (or reverse Polish notation). The Build takes programs of that shape as input. (This is our example; we do not claim it is the exact bytecode the compiler writes for that expression.)

Every code object records how big its stack gets: `co_stacksize` is "The required stack size of the code object" ([Doc/reference/datamodel.rst, lines 1272 to 1273](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Doc/reference/datamodel.rst#L1272-L1273)). In your Build, the deepest the stack gets during an evaluation is the number to report in its place.

Evaluating n tokens costs O(n) time in the **worst case**: each token is pushed or applied once. The deepest the stack gets can be as large as n/2 + 1 (all the numbers first, then the operators).
