# Human review queue

`docs/content-standards.md` holds every claim a learner reads to a primary source that a person has opened and checked. Agents draft content and list every link it cites here. A person opens each one, confirms it says what the sentence says for the version named, and ticks it.

Each Topic has its own section, written by its card. Agents add entries only to their own Topic's section, never to another's.

One line per cited link, grouped by Chapter:

```
- [ ] [what the link is](https://pinned/permalink) · chapters/<chapter-id>/chapter.md: the claim it supports
```

A link that doesn't hold up gets a note under its line, and the claim goes back to `[NEEDS SOURCE]`.

## Hash tables

## Two pointers

## Binary search

## Stacks

- [ ] [Go 1.22.0 runtime/stack.go L74-L75, stackMin](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L74-L75) · chapters/stacks-go-goroutine-stacks/chapter.md: a goroutine stack is at least 2048 bytes
- [ ] [Go 1.22.0 runtime/stack.go L67-L72, stackSystem](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L67-L72) · chapters/stacks-go-goroutine-stacks/chapter.md: stackSystem is non-zero only on Windows, Plan 9 and iOS, so the Linux minimum is 2048
- [ ] [Go 1.22.0 runtime/stack.go L21-L23, stack guard check](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L21-L23) · chapters/stacks-go-goroutine-stacks/chapter.md: each function compares SP with g->stackguard
- [ ] [Go 1.22.0 runtime/stack.go L950-L951, newstack called from morestack](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L950-L951) · chapters/stacks-go-goroutine-stacks/chapter.md: newstack is called from morestack when more stack is needed
- [ ] [Go 1.22.0 runtime/stack.go L952, multiplicative growth](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L952) · chapters/stacks-go-goroutine-stacks/chapter.md: stack growth is multiplicative, for constant amortized cost
- [ ] [Go 1.22.0 runtime/stack.go L1073-L1087, newstack growth rule](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L1073-L1087) · chapters/stacks-go-goroutine-stacks/chapter.md: new size is twice the old, doubled again until the frame fits
- [ ] [Go 1.22.0 runtime/stack.go L862, used bytes](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L862) · chapters/stacks-go-goroutine-stacks/chapter.md: copystack computes used as old.hi - sp
- [ ] [Go 1.22.0 runtime/stack.go L884, ncopy](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L884) · chapters/stacks-go-goroutine-stacks/chapter.md: ncopy starts as used
- [ ] [Go 1.22.0 runtime/stack.go L910, memmove](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L910) · chapters/stacks-go-goroutine-stacks/chapter.md: only the used part is memmoved to the new stack
- [ ] [Go 1.22.0 runtime/stack.go L1096-L1103, overflow](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L1096-L1103) · chapters/stacks-go-goroutine-stacks/chapter.md: growth past maxstacksize throws stack overflow
- [ ] [Go 1.22.0 runtime/proc.go L153-L157, maxstacksize](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/proc.go#L153-L157) · chapters/stacks-go-goroutine-stacks/chapter.md: max stack size is 1 GB on 64-bit (1000000000)
- [ ] [Go 1.22.0 runtime/mgcmark.go L872-L873, GC shrinks stacks](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/mgcmark.go#L872-L873) · chapters/stacks-go-goroutine-stacks/chapter.md: the garbage collector calls shrinkstack while scanning
- [ ] [Go 1.22.0 runtime/stack.go L1193-L1208, shrinkstack](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L1193-L1208) · chapters/stacks-go-goroutine-stacks/chapter.md: shrink to half, not below the minimum, only if used is under a quarter
- [ ] [Go 1.22.0 runtime/stack.go L1301-L1302, startingStackSize](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L1301-L1302) · chapters/stacks-go-goroutine-stacks/chapter.md: startingStackSize is updated every GC from the average scanned stack
- [ ] [OpenJDK jdk-21+35 Stack.java L29-L35, class description](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Stack.java#L29-L35) · chapters/stacks-java-stack-class/chapter.md: Stack extends Vector with five operations
- [ ] [OpenJDK jdk-21+35 Stack.java L50, declaration](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Stack.java#L50) · chapters/stacks-java-stack-class/chapter.md: public class Stack<E> extends Vector<E>
- [ ] [OpenJDK jdk-21+35 Stack.java L67-L71, push](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Stack.java#L67-L71) · chapters/stacks-java-stack-class/chapter.md: push is addElement
- [ ] [OpenJDK jdk-21+35 Stack.java L81-L89, pop](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Stack.java#L81-L89) · chapters/stacks-java-stack-class/chapter.md: pop is peek then removeElementAt(len - 1)
- [ ] [OpenJDK jdk-21+35 Stack.java L99-L105, peek](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Stack.java#L99-L105) · chapters/stacks-java-stack-class/chapter.md: peek throws EmptyStackException when empty
- [ ] [OpenJDK jdk-21+35 Stack.java L117-L138, search](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Stack.java#L117-L138) · chapters/stacks-java-stack-class/chapter.md: search is a 1-based distance from the top, -1 if absent
- [ ] [OpenJDK jdk-21+35 Vector.java L163-L169, Vector()](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Vector.java#L163-L169) · chapters/stacks-java-stack-class/chapter.md: a default Vector has 10 slots and capacity increment zero
- [ ] [OpenJDK jdk-21+35 Vector.java L256-L263, grow](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Vector.java#L256-L263) · chapters/stacks-java-stack-class/chapter.md: grow copies with Arrays.copyOf
- [ ] [OpenJDK jdk-21+35 Vector.java L232-L236, ensureCapacity doc](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Vector.java#L232-L236) · chapters/stacks-java-stack-class/chapter.md: with increment zero the new capacity is twice the old
- [ ] [OpenJDK jdk-21+35 Vector.java L547-L562, removeElementAt](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Vector.java#L547-L562) · chapters/stacks-java-stack-class/chapter.md: removing the last element moves nothing and never shrinks the array
- [ ] [OpenJDK jdk-21+35 Vector.java L561, null the slot](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Vector.java#L561) · chapters/stacks-java-stack-class/chapter.md: the freed slot is set to null to let gc work
- [ ] [OpenJDK jdk-21+35 Vector.java L587, insertElementAt](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Vector.java#L587) · chapters/stacks-java-stack-class/chapter.md: insertElementAt is a public Vector method, so a Stack has it
- [ ] [OpenJDK jdk-21+35 Vector.java L615, addElement](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Vector.java#L615) · chapters/stacks-java-stack-class/chapter.md: addElement is synchronized
- [ ] [OpenJDK jdk-21+35 Stack.java L81, synchronized pop (also L99 peek, L131 search)](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Stack.java#L81) · chapters/stacks-java-stack-class/chapter.md: pop, peek and search are synchronized
- [ ] [OpenJDK jdk-21+35 Stack.java L39-L43, prefer Deque](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Stack.java#L39-L43) · chapters/stacks-java-stack-class/chapter.md: the Javadoc says to prefer Deque, with ArrayDeque as the example
- [ ] [CPython v3.13.0 Objects/listsort.txt L338-L339, consecutive runs](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listsort.txt#L338-L339) · chapters/stacks-timsort-pending/chapter.md: merging is always done on two consecutive runs
- [ ] [CPython v3.13.0 Objects/listsort.txt L341-L342, pending stack](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listsort.txt#L341-L342) · chapters/stacks-timsort-pending/chapter.md: a run length goes to found_new_run to merge runs on a stack of pending runs
- [ ] [CPython v3.13.0 Objects/listobject.c L1688-L1689, pending array](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listobject.c#L1688-L1689) · chapters/stacks-timsort-pending/chapter.md: the stack is int n and an array pending[MAX_MERGE_PENDING]
- [ ] [CPython v3.13.0 Objects/listobject.c L1629-L1634, MAX_MERGE_PENDING](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listobject.c#L1629-L1634) · chapters/stacks-timsort-pending/chapter.md: at most floor(log2(n)) + 1 entries
- [ ] [CPython v3.13.0 Objects/listsort.txt L342-L347, delay trade-off](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listsort.txt#L342-L347) · chapters/stacks-timsort-pending/chapter.md: merge late to find patterns, early for the memory hierarchy, and the stack has a fixed size
- [ ] [CPython v3.13.0 Objects/listsort.txt L349-L355, original rule](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listsort.txt#L349-L355) · chapters/stacks-timsort-pending/chapter.md: the first rule was Fibonacci-based and its invariants were not preserved
- [ ] [CPython v3.13.0 Objects/listsort.txt L363-L367, powersort](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listsort.txt#L363-L367) · chapters/stacks-timsort-pending/chapter.md: the code uses powersort from Munro and Wild
- [ ] [CPython v3.13.0 Objects/listsort.txt L378-L380, power](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listsort.txt#L378-L380) · chapters/stacks-timsort-pending/chapter.md: power is the depth of the node in an ideal binary merge tree, root is 1
- [ ] [CPython v3.13.0 Objects/listobject.c L2553-L2589, powerloop](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listobject.c#L2553-L2589) · chapters/stacks-timsort-pending/chapter.md: powerloop computes the power from s1, n1, n2 and n
- [ ] [CPython v3.13.0 Objects/listobject.c L2606-L2624, found_new_run](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listobject.c#L2606-L2624) · chapters/stacks-timsort-pending/chapter.md: merge while the second-from-top power is greater than the new power
- [ ] [CPython v3.13.0 Objects/listobject.c L3056-L3059, push](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listobject.c#L3056-L3059) · chapters/stacks-timsort-pending/chapter.md: the new run is pushed after found_new_run returns
- [ ] [CPython v3.13.0 Objects/listsort.txt L426-L427, invariant](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listsort.txt#L426-L427) · chapters/stacks-timsort-pending/chapter.md: powers on the run stack are strictly decreasing from the top
- [ ] [CPython v3.13.0 Objects/listobject.c L2631-L2644, merge_force_collapse](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listobject.c#L2631-L2644) · chapters/stacks-timsort-pending/chapter.md: at the end, merge until one run remains
- [ ] [CPython v3.13.0 Parser/lexer/state.h L90-L94, bracket stack](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Parser/lexer/state.h#L90-L94) · chapters/stacks-cpython-tokenizer/chapter.md: three arrays of MAXLEVEL entries and a level counter
- [ ] [CPython v3.13.0 Parser/lexer/state.h L7, MAXLEVEL](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Parser/lexer/state.h#L7) · chapters/stacks-cpython-tokenizer/chapter.md: MAXLEVEL is 200
- [ ] [CPython v3.13.0 Parser/lexer/lexer.c L1182-L1196, opening bracket](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Parser/lexer/lexer.c#L1182-L1196) · chapters/stacks-cpython-tokenizer/chapter.md: an opening bracket pushes, or errors with too many nested parentheses
- [ ] [CPython v3.13.0 Parser/lexer/lexer.c L1197-L1235, closing bracket](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Parser/lexer/lexer.c#L1197-L1235) · chapters/stacks-cpython-tokenizer/chapter.md: a closing bracket pops and reports unmatched or mismatched with the opening line
- [ ] [CPython v3.13.0 Parser/pegen_errors.c L51-L58, unclosed](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Parser/pegen_errors.c#L51-L58) · chapters/stacks-cpython-tokenizer/chapter.md: the unclosed-bracket error names the top of the stack: '%c' was never closed
- [ ] [CPython v3.13.0 Parser/pegen_errors.c L76-L79, EOF with open brackets](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Parser/pegen_errors.c#L76-L79) · chapters/stacks-cpython-tokenizer/chapter.md: at EOF with level non-zero the unclosed error is raised
- [ ] [CPython v3.13.0 Parser/pegen_errors.c L423-L426, EOF with open brackets](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Parser/pegen_errors.c#L423-L426) · chapters/stacks-cpython-tokenizer/chapter.md: the same at the parser level
- [ ] [CPython v3.13.0 Doc/library/dis.rst L1071-L1073, LOAD_CONST](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Doc/library/dis.rst#L1071-L1073) · chapters/stacks-cpython-tokenizer/chapter.md: LOAD_CONST pushes a constant onto the stack
- [ ] [CPython v3.13.0 Doc/library/dis.rst L657-L664, BINARY_OP](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Doc/library/dis.rst#L657-L664) · chapters/stacks-cpython-tokenizer/chapter.md: BINARY_OP pops rhs then lhs and pushes lhs op rhs
- [ ] [CPython v3.13.0 Doc/reference/datamodel.rst L1272-L1273, co_stacksize](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Doc/reference/datamodel.rst#L1272-L1273) · chapters/stacks-cpython-tokenizer/chapter.md: co_stacksize is the required stack size of the code object

## Sliding window

## Linked lists
