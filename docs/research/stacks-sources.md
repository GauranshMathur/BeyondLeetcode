# Stacks: sources

Research for the Topic "stacks" (card C103, issue #265). Every claim a Chapter makes about a real system is listed below with its source, in the form of the Dynamic arrays sources file.

Tags (resolved to commit SHAs with `git ls-remote`):

| Project | Tag | Commit |
|---|---|---|
| Go | `go1.22.0` | `a10e42f219abb9c5bc4e7d86d9464700a42c7d57` |
| OpenJDK | `jdk-21+35` | `890adb6410dab4606a4f26a942aed02fb2f55387` (tag object `07687d169a5e181789869817f10f3e8a4a4c30a9`) |
| CPython | `v3.13.0` | `60403a5409ff2c3f3b07dd2ca91a7a3e096839c7` (annotated tag object `3f27099d916c7b885e3daf1fabedcc119462014d`) |

Method. Files were fetched with `curl -fsSL https://raw.githubusercontent.com/<org>/<repo>/<sha>/<path>` at the commit above and the quoted lines read with `sed -n 'a,bp'`. Every link below is a permalink to that commit. Source types: 1 = source code, 2 = official docs for that version, 3 = paper or design doc, 4 = engineer post. In this Topic, listsort.txt and the Javadoc comments are the builders' own notes and count as type 1 or 2 as marked. Status is "sourced" for every entry; opening each link is the human reviewer's box (see the Stacks section of `human-review-queue.md`).

Claims that are our own reasoning and not quotes (so no source is claimed): the largest Go stack on 64-bit is 2^29 = 536,870,912 bytes (arithmetic from `maxstacksize` and the doubling); the shrink rule leaves the stack under half full; Vector push is amortised O(1) and pop worst-case O(1); the pending-run stack work is amortised O(1) per run; the postfix example `(3 + 4) * 2` is ours, not the compiler's output.

Left out because no primary source was found in this pass: any claim about Python's recursion limit, any performance comparison of `Stack` and `ArrayDeque`, and the exact bytecode the compiler writes for an expression.


---

## Chapter 1: Go goroutine stacks

### Claim 1. A goroutine stack is at least 2048 bytes.

- Link: [Go 1.22.0 runtime/stack.go L74-L75, stackMin](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L74-L75)
- Quote (lines 74-75): `// The minimum size of stack used by Go code / stackMin = 2048`
- Type: 1. Status: sourced.

### Claim 2. StackSystem is non-zero only on Windows, Plan 9 and iOS, so the Linux minimum is 2048.

- Link: [Go 1.22.0 runtime/stack.go L67-L72, stackSystem](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L67-L72)
- Quote (lines 67-72): `const ( / // stackSystem is a number of additional bytes to add / // to each stack below the usual guard area for OS-specific / // purposes like signal handling. Used on Windows, Plan 9, / // and iOS because they do not use a separate stack. / stackSystem = goos.IsWindows*512*goarch.PtrSize + goos.IsPlan9*512 + goos.IsIos*goarch.IsArm64*1024`
- Type: 1. Status: sourced.

### Claim 3. Each function compares SP with g->stackguard.

- Link: [Go 1.22.0 runtime/stack.go L21-L23, stack guard check](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L21-L23)
- Quote (lines 21-23): `The per-goroutine g->stackguard is set to point StackGuard bytes / above the bottom of the stack.  Each function compares its stack / pointer against g->stackguard to check for overflow.  To cut one`
- Type: 1. Status: sourced.

### Claim 4. Newstack is called from morestack when more stack is needed.

- Link: [Go 1.22.0 runtime/stack.go L950-L951, newstack called from morestack](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L950-L951)
- Quote (lines 950-951): `// Called from runtime·morestack when more stack is needed. / // Allocate larger stack and relocate to new stack.`
- Type: 1. Status: sourced.

### Claim 5. Stack growth is multiplicative, for constant amortized cost.

- Link: [Go 1.22.0 runtime/stack.go L952, multiplicative growth](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L952)
- Quote (lines 952-952): `// Stack growth is multiplicative, for constant amortized cost.`
- Type: 1. Status: sourced.

### Claim 6. New size is twice the old, doubled again until the frame fits.

- Link: [Go 1.22.0 runtime/stack.go L1073-L1087, newstack growth rule](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L1073-L1087)
- Quote (lines 1073-1087): `// Allocate a bigger segment and move the stack. / oldsize := gp.stack.hi - gp.stack.lo / newsize := oldsize * 2 / // Make sure we grow at least as much as needed to fit the new frame. / // (This is just an optimization - the caller of morestack will / // recheck the bounds on return.) / if f := findfunc(gp.sched.pc); f.valid() { / max := uintptr(funcMaxSPDelta(f)) / needed := max + stackGuard / used := gp.stack.hi - gp.sched.sp / for newsize-used < needed { / newsize *= 2 / } / }`
- Type: 1. Status: sourced.

### Claim 7. Copystack computes used as old.hi - sp.

- Link: [Go 1.22.0 runtime/stack.go L862, used bytes](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L862)
- Quote (lines 862-862): `used := old.hi - gp.sched.sp`
- Type: 1. Status: sourced.

### Claim 8. Ncopy starts as used.

- Link: [Go 1.22.0 runtime/stack.go L884, ncopy](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L884)
- Quote (lines 884-884): `ncopy := used`
- Type: 1. Status: sourced.

### Claim 9. Only the used part is memmoved to the new stack.

- Link: [Go 1.22.0 runtime/stack.go L910, memmove](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L910)
- Quote (lines 910-910): `memmove(unsafe.Pointer(new.hi-ncopy), unsafe.Pointer(old.hi-ncopy), ncopy)`
- Type: 1. Status: sourced.

### Claim 10. Growth past maxstacksize throws stack overflow.

- Link: [Go 1.22.0 runtime/stack.go L1096-L1103, overflow](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L1096-L1103)
- Quote (lines 1096-1103): `if newsize > maxstacksize || newsize > maxstackceiling { / if maxstacksize < maxstackceiling { / print("runtime: goroutine stack exceeds ", maxstacksize, "-byte limit\n") / } else { / print("runtime: goroutine stack exceeds ", maxstackceiling, "-byte limit\n") / } / print("runtime: sp=", hex(sp), " stack=[", hex(gp.stack.lo), ", ", hex(gp.stack.hi), "]\n") / throw("stack overflow")`
- Type: 1. Status: sourced.

### Claim 11. Max stack size is 1 GB on 64-bit (1000000000).

- Link: [Go 1.22.0 runtime/proc.go L153-L157, maxstacksize](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/proc.go#L153-L157)
- Quote (lines 153-157): `// Max stack size is 1 GB on 64-bit, 250 MB on 32-bit. / // Using decimal instead of binary GB and MB because / // they look nicer in the stack overflow failure message. / if goarch.PtrSize == 8 { / maxstacksize = 1000000000`
- Type: 1. Status: sourced.

### Claim 12. The garbage collector calls shrinkstack while scanning.

- Link: [Go 1.22.0 runtime/mgcmark.go L872-L873, GC shrinks stacks](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/mgcmark.go#L872-L873)
- Quote (lines 872-873): `// Shrink the stack if not much of it is being used. / shrinkstack(gp)`
- Type: 1. Status: sourced.

### Claim 13. Shrink to half, not below the minimum, only if used is under a quarter.

- Link: [Go 1.22.0 runtime/stack.go L1193-L1208, shrinkstack](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L1193-L1208)
- Quote (lines 1193-1208): `oldsize := gp.stack.hi - gp.stack.lo / newsize := oldsize / 2 / // Don't shrink the allocation below the minimum-sized stack / // allocation. / if newsize < fixedStack { / return / } / // Compute how much of the stack is currently in use and only / // shrink the stack if gp is using less than a quarter of its / // current stack. The currently used stack includes everything / // down to the SP plus the stack guard space that ensures / // there's room for nosplit functions. / avail := gp.stack.hi - gp.stack.lo / if used := gp.stack.hi - gp.sched.sp + stackNosplit; used >= avail/4 { / return / }`
- Type: 1. Status: sourced.

### Claim 14. StartingStackSize is updated every GC from the average scanned stack.

- Link: [Go 1.22.0 runtime/stack.go L1301-L1302, startingStackSize](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/stack.go#L1301-L1302)
- Quote (lines 1301-1302): `// startingStackSize is updated every GC by tracking the average size of / // stacks scanned during the GC.`
- Type: 1. Status: sourced.


---

## Chapter 2: Java Stack

### Claim 15. Stack extends Vector with five operations.

- Link: [OpenJDK jdk-21+35 Stack.java L29-L35, class description](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Stack.java#L29-L35)
- Quote (lines 29-35): `* The {@code Stack} class represents a last-in-first-out / * (LIFO) stack of objects. It extends class {@code Vector} with five / * operations that allow a vector to be treated as a stack. The usual / * {@code push} and {@code pop} operations are provided, as well as a / * method to {@code peek} at the top item on the stack, a method to test / * for whether the stack is {@code empty}, and a method to {@code search} / * the stack for an item and discover how far it is from the top.`
- Type: 1. Status: sourced.

### Claim 16. Public class Stack<E> extends Vector<E>.

- Link: [OpenJDK jdk-21+35 Stack.java L50, declaration](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Stack.java#L50)
- Quote (lines 50-50): `public class Stack<E> extends Vector<E> {`
- Type: 1. Status: sourced.

### Claim 17. Push is addElement.

- Link: [OpenJDK jdk-21+35 Stack.java L67-L71, push](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Stack.java#L67-L71)
- Quote (lines 67-71): `public E push(E item) { / addElement(item); / return item; / }`
- Type: 1. Status: sourced.

### Claim 18. Pop is peek then removeElementAt(len - 1).

- Link: [OpenJDK jdk-21+35 Stack.java L81-L89, pop](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Stack.java#L81-L89)
- Quote (lines 81-89): `public synchronized E pop() { / E       obj; / int     len = size(); / obj = peek(); / removeElementAt(len - 1); / return obj; / }`
- Type: 1. Status: sourced.

### Claim 19. Peek throws EmptyStackException when empty.

- Link: [OpenJDK jdk-21+35 Stack.java L99-L105, peek](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Stack.java#L99-L105)
- Quote (lines 99-105): `public synchronized E peek() { / int     len = size(); / if (len == 0) / throw new EmptyStackException(); / return elementAt(len - 1); / }`
- Type: 1. Status: sourced.

### Claim 20. Search is a 1-based distance from the top, -1 if absent.

- Link: [OpenJDK jdk-21+35 Stack.java L117-L138, search](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Stack.java#L117-L138)
- Quote (lines 117-138): `/** / * Returns the 1-based position where an object is on this stack. / * If the object {@code o} occurs as an item in this stack, this / * method returns the distance from the top of the stack of the / * occurrence nearest the top of the stack; the topmost item on the / * stack is considered to be at distance {@code 1}. The {@code equals} / * method is used to compare {@code o} to the / * items in this stack. / * / * @param   o   the desired object. / * @return  the 1-based position from the top of the stack where / *          the object is located; the return value {@code -1} / *          indicates that the object is not on the stack. / */ / public synchronized int search(Object o) { / in ...`
- Type: 1. Status: sourced.

### Claim 21. A default Vector has 10 slots and capacity increment zero.

- Link: [OpenJDK jdk-21+35 Vector.java L163-L169, Vector()](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Vector.java#L163-L169)
- Quote (lines 163-169): `* Constructs an empty vector so that its internal data array / * has size {@code 10} and its standard capacity increment is / * zero. / */ / public Vector() { / this(10); / }`
- Type: 1. Status: sourced.

### Claim 22. Grow copies with Arrays.copyOf.

- Link: [OpenJDK jdk-21+35 Vector.java L256-L263, grow](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Vector.java#L256-L263)
- Quote (lines 256-263): `private Object[] grow(int minCapacity) { / int oldCapacity = elementData.length; / int newCapacity = ArraysSupport.newLength(oldCapacity, / minCapacity - oldCapacity, /* minimum growth */ / capacityIncrement > 0 ? capacityIncrement : oldCapacity / /* preferred growth */); / return elementData = Arrays.copyOf(elementData, newCapacity); / }`
- Type: 1. Status: sourced.

### Claim 23. With increment zero the new capacity is twice the old.

- Link: [OpenJDK jdk-21+35 Vector.java L232-L236, ensureCapacity doc](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Vector.java#L232-L236)
- Quote (lines 232-236): `* larger one.  The size of the new data array will be the old size plus / * {@code capacityIncrement}, unless the value of / * {@code capacityIncrement} is less than or equal to zero, in which case / * the new capacity will be twice the old capacity; but if this new size / * is still smaller than {@code minCapacity}, then the new capacity will`
- Type: 1. Status: sourced.

### Claim 24. Removing the last element moves nothing and never shrinks the array.

- Link: [OpenJDK jdk-21+35 Vector.java L547-L562, removeElementAt](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Vector.java#L547-L562)
- Quote (lines 547-562): `public synchronized void removeElementAt(int index) { / if (index >= elementCount) { / throw new ArrayIndexOutOfBoundsException(index + " >= " + / elementCount); / } / else if (index < 0) { / throw new ArrayIndexOutOfBoundsException(index); / } / int j = elementCount - index - 1; / if (j > 0) { / System.arraycopy(elementData, index + 1, elementData, index, j); / } / modCount++; / elementCount--; / elementData[elementCount] = null; /* to let gc do its work */ / }`
- Type: 1. Status: sourced.

### Claim 25. The freed slot is set to null to let gc work.

- Link: [OpenJDK jdk-21+35 Vector.java L561, null the slot](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Vector.java#L561)
- Quote (lines 561-561): `elementData[elementCount] = null; /* to let gc do its work */`
- Type: 1. Status: sourced.

### Claim 26. InsertElementAt is a public Vector method, so a Stack has it.

- Link: [OpenJDK jdk-21+35 Vector.java L587, insertElementAt](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Vector.java#L587)
- Quote (lines 587-587): `public synchronized void insertElementAt(E obj, int index) {`
- Type: 1. Status: sourced.

### Claim 27. AddElement is synchronized.

- Link: [OpenJDK jdk-21+35 Vector.java L615, addElement](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Vector.java#L615)
- Quote (lines 615-615): `public synchronized void addElement(E obj) {`
- Type: 1. Status: sourced.

### Claim 28. Pop, peek and search are synchronized.

- Link: [OpenJDK jdk-21+35 Stack.java L81, synchronized pop (also L99 peek, L131 search)](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Stack.java#L81)
- Quote (lines 81-81): `public synchronized E pop() {`
- Type: 1. Status: sourced.

### Claim 29. The Javadoc says to prefer Deque, with ArrayDeque as the example.

- Link: [OpenJDK jdk-21+35 Stack.java L39-L43, prefer Deque](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Stack.java#L39-L43)
- Quote (lines 39-43): `* <p>A more complete and consistent set of LIFO stack operations is / * provided by the {@link Deque} interface and its implementations, which / * should be used in preference to this class.  For example: / * <pre>   {@code / *   Deque<Integer> stack = new ArrayDeque<Integer>();}</pre>`
- Type: 1. Status: sourced.


---

## Chapter 3: CPython list.sort pending runs

### Claim 30. Merging is always done on two consecutive runs.

- Link: [CPython v3.13.0 Objects/listsort.txt L338-L339, consecutive runs](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listsort.txt#L338-L339)
- Quote (lines 338-339): `So merging is always done on two consecutive runs at a time, and in-place, / although this may require some temp memory (more on that later).`
- Type: 2. Status: sourced.

### Claim 31. A run length goes to found_new_run to merge runs on a stack of pending runs.

- Link: [CPython v3.13.0 Objects/listsort.txt L341-L342, pending stack](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listsort.txt#L341-L342)
- Quote (lines 341-342): `When a run is identified, its length is passed to found_new_run() to / potentially merge runs on a stack of pending runs.  We would like to delay`
- Type: 2. Status: sourced.

### Claim 32. The stack is int n and an array pending[MAX_MERGE_PENDING].

- Link: [CPython v3.13.0 Objects/listobject.c L1688-L1689, pending array](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listobject.c#L1688-L1689)
- Quote (lines 1688-1689): `int n; / struct s_slice pending[MAX_MERGE_PENDING];`
- Type: 1. Status: sourced.

### Claim 33. At most floor(log2(n)) + 1 entries.

- Link: [CPython v3.13.0 Objects/listobject.c L1629-L1634, MAX_MERGE_PENDING](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listobject.c#L1629-L1634)
- Quote (lines 1629-1634): `/* The maximum number of entries in a MergeState's pending-runs stack. / * For a list with n elements, this needs at most floor(log2(n)) + 1 entries / * even if we didn't force runs to a minimal length.  So the number of bits / * in a Py_ssize_t is plenty large enough for all cases. / */ / #define MAX_MERGE_PENDING (SIZEOF_SIZE_T * 8)`
- Type: 1. Status: sourced.

### Claim 34. Merge late to find patterns, early for the memory hierarchy, and the stack has a fixed size.

- Link: [CPython v3.13.0 Objects/listsort.txt L342-L347, delay trade-off](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listsort.txt#L342-L347)
- Quote (lines 342-347): `potentially merge runs on a stack of pending runs.  We would like to delay / merging as long as possible in order to exploit patterns that may come up / later, but we like even more to do merging as soon as possible to exploit / that the run just found is still high in the memory hierarchy.  We also can't / delay merging "too long" because it consumes memory to remember the runs that / are still unmerged, and the stack has a fixed size.`
- Type: 2. Status: sourced.

### Claim 35. The first rule was Fibonacci-based and its invariants were not preserved.

- Link: [CPython v3.13.0 Objects/listsort.txt L349-L355, original rule](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listsort.txt#L349-L355)
- Quote (lines 349-355): `The original version of this code used the first thing I made up that didn't / obviously suck ;-) It was loosely based on invariants involving the Fibonacci / sequence. / It worked OK, but it was hard to reason about, and was subtle enough that the / intended invariants weren't actually preserved.  Researchers discovered that / when trying to complete a computer-generated correctness proof.  That was`
- Type: 2. Status: sourced.

### Claim 36. The code uses powersort from Munro and Wild.

- Link: [CPython v3.13.0 Objects/listsort.txt L363-L367, powersort](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listsort.txt#L363-L367)
- Quote (lines 363-367): `The code now uses the "powersort" merge strategy from: / "Nearly-Optimal Mergesorts: Fast, Practical Sorting Methods / That Optimally Adapt to Existing Runs" / J. Ian Munro and Sebastian Wild`
- Type: 2. Status: sourced.

### Claim 37. Power is the depth of the node in an ideal binary merge tree, root is 1.

- Link: [CPython v3.13.0 Objects/listsort.txt L378-L380, power](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listsort.txt#L378-L380)
- Quote (lines 378-380): `The "power" of the first run is a small integer, the depth of the node / connecting the two runs in an ideal binary merge tree, where power 1 is the / root node, and the power increases by 1 for each level deeper in the tree.`
- Type: 2. Status: sourced.

### Claim 38. Powerloop computes the power from s1, n1, n2 and n.

- Link: [CPython v3.13.0 Objects/listobject.c L2553-L2589, powerloop](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listobject.c#L2553-L2589)
- Quote (lines 2553-2589): `/* Two adjacent runs begin at index s1. The first run has length n1, and / * the second run (starting at index s1+n1) has length n2. The list has total / * length n. / * Compute the "power" of the first run. See listsort.txt for details. / */ / static int / powerloop(Py_ssize_t s1, Py_ssize_t n1, Py_ssize_t n2, Py_ssize_t n) / { / int result = 0; / assert(s1 >= 0); / assert(n1 > 0 && n2 > 0); / assert(s1 + n1 + n2 <= n); / /* midpoints a and b: / * a = s1 + n1/2 / * b = s1 + n1 + n2/2 = a + (n1 + n2)/2 / * / * Those may not be integers, though, because of the "/2". So we work with / * 2*a and 2*b instead, which are necessarily integers. It makes no / * difference to the outcome, since the bi ...`
- Type: 1. Status: sourced.

### Claim 39. Merge while the second-from-top power is greater than the new power.

- Link: [CPython v3.13.0 Objects/listobject.c L2606-L2624, found_new_run](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listobject.c#L2606-L2624)
- Quote (lines 2606-2624): `found_new_run(MergeState *ms, Py_ssize_t n2) / { / assert(ms); / if (ms->n) { / assert(ms->n > 0); / struct s_slice *p = ms->pending; / Py_ssize_t s1 = p[ms->n - 1].base.keys - ms->basekeys; /* start index */ / Py_ssize_t n1 = p[ms->n - 1].len; / int power = powerloop(s1, n1, n2, ms->listlen); / while (ms->n > 1 && p[ms->n - 2].power > power) { / if (merge_at(ms, ms->n - 2) < 0) / return -1; / } / assert(ms->n < 2 || p[ms->n - 2].power < power); / p[ms->n - 1].power = power; / } / return 0; / }`
- Type: 1. Status: sourced.

### Claim 40. The new run is pushed after found_new_run returns.

- Link: [CPython v3.13.0 Objects/listobject.c L3056-L3059, push](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listobject.c#L3056-L3059)
- Quote (lines 3056-3059): `assert(ms.n < MAX_MERGE_PENDING); / ms.pending[ms.n].base = lo; / ms.pending[ms.n].len = n; / ++ms.n;`
- Type: 1. Status: sourced.

### Claim 41. Powers on the run stack are strictly decreasing from the top.

- Link: [CPython v3.13.0 Objects/listsort.txt L426-L427, invariant](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listsort.txt#L426-L427)
- Quote (lines 426-427): `A key invariant is that powers on the run stack are strictly decreasing / (starting from the run at the top of the stack).`
- Type: 2. Status: sourced.

### Claim 42. At the end, merge until one run remains.

- Link: [CPython v3.13.0 Objects/listobject.c L2631-L2644, merge_force_collapse](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/listobject.c#L2631-L2644)
- Quote (lines 2631-2644): `merge_force_collapse(MergeState *ms) / { / struct s_slice *p = ms->pending; / assert(ms); / while (ms->n > 1) { / Py_ssize_t n = ms->n - 2; / if (n > 0 && p[n-1].len < p[n+1].len) / --n; / if (merge_at(ms, n) < 0) / return -1; / } / return 0; / }`
- Type: 1. Status: sourced.


---

## Chapter 4: CPython tokenizer and bytecode

### Claim 43. Three arrays of MAXLEVEL entries and a level counter.

- Link: [CPython v3.13.0 Parser/lexer/state.h L90-L94, bracket stack](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Parser/lexer/state.h#L90-L94)
- Quote (lines 90-94): `int level;          /* () [] {} Parentheses nesting level */ / /* Used to allow free continuations inside them */ / char parenstack[MAXLEVEL]; / int parenlinenostack[MAXLEVEL]; / int parencolstack[MAXLEVEL];`
- Type: 1. Status: sourced.

### Claim 44. MAXLEVEL is 200.

- Link: [CPython v3.13.0 Parser/lexer/state.h L7, MAXLEVEL](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Parser/lexer/state.h#L7)
- Quote (lines 7-7): `#define MAXLEVEL 200        /* Max parentheses level */`
- Type: 1. Status: sourced.

### Claim 45. An opening bracket pushes, or errors with too many nested parentheses.

- Link: [CPython v3.13.0 Parser/lexer/lexer.c L1182-L1196, opening bracket](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Parser/lexer/lexer.c#L1182-L1196)
- Quote (lines 1182-1196): `switch (c) { / case '(': / case '[': / case '{': / if (tok->level >= MAXLEVEL) { / return MAKE_TOKEN(_PyTokenizer_syntaxerror(tok, "too many nested parentheses")); / } / tok->parenstack[tok->level] = c; / tok->parenlinenostack[tok->level] = tok->lineno; / tok->parencolstack[tok->level] = (int)(tok->start - tok->line_start); / tok->level++; / if (INSIDE_FSTRING(tok)) { / current_tok->curly_bracket_depth++; / } / break;`
- Type: 1. Status: sourced.

### Claim 46. A closing bracket pops and reports unmatched or mismatched with the opening line.

- Link: [CPython v3.13.0 Parser/lexer/lexer.c L1197-L1235, closing bracket](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Parser/lexer/lexer.c#L1197-L1235)
- Quote (lines 1197-1235): `case ')': / case ']': / case '}': / if (INSIDE_FSTRING(tok) && !current_tok->curly_bracket_depth && c == '}') { / return MAKE_TOKEN(_PyTokenizer_syntaxerror(tok, "f-string: single '}' is not allowed")); / } / if (!tok->tok_extra_tokens && !tok->level) { / return MAKE_TOKEN(_PyTokenizer_syntaxerror(tok, "unmatched '%c'", c)); / } / if (tok->level > 0) { / tok->level--; / int opening = tok->parenstack[tok->level]; / if (!tok->tok_extra_tokens && !((opening == '(' && c == ')') || / (opening == '[' && c == ']') || / (opening == '{' && c == '}'))) { / /* If the opening bracket belongs to an f-string's expression / part (e.g. f"{)}") and the closing bracket is an arbitrary / nested expression, the ...`
- Type: 1. Status: sourced.

### Claim 47. The unclosed-bracket error names the top of the stack: '%c' was never closed.

- Link: [CPython v3.13.0 Parser/pegen_errors.c L51-L58, unclosed](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Parser/pegen_errors.c#L51-L58)
- Quote (lines 51-58): `static inline void / raise_unclosed_parentheses_error(Parser *p) { / int error_lineno = p->tok->parenlinenostack[p->tok->level-1]; / int error_col = p->tok->parencolstack[p->tok->level-1]; / RAISE_ERROR_KNOWN_LOCATION(p, PyExc_SyntaxError, / error_lineno, error_col, error_lineno, -1, / "'%c' was never closed", / p->tok->parenstack[p->tok->level-1]);`
- Type: 1. Status: sourced.

### Claim 48. At EOF with level non-zero the unclosed error is raised.

- Link: [CPython v3.13.0 Parser/pegen_errors.c L76-L79, EOF with open brackets](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Parser/pegen_errors.c#L76-L79)
- Quote (lines 76-79): `case E_EOF: / if (p->tok->level) { / raise_unclosed_parentheses_error(p); / } else {`
- Type: 1. Status: sourced.

### Claim 49. The same at the parser level.

- Link: [CPython v3.13.0 Parser/pegen_errors.c L423-L426, EOF with open brackets](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Parser/pegen_errors.c#L423-L426)
- Quote (lines 423-426): `if (last_token->type == ERRORTOKEN && p->tok->done == E_EOF) { / if (p->tok->level) { / raise_unclosed_parentheses_error(p); / } else {`
- Type: 1. Status: sourced.

### Claim 50. LOAD_CONST pushes a constant onto the stack.

- Link: [CPython v3.13.0 Doc/library/dis.rst L1071-L1073, LOAD_CONST](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Doc/library/dis.rst#L1071-L1073)
- Quote (lines 1071-1073): `.. opcode:: LOAD_CONST (consti) / Pushes ''co_consts[consti]'' onto the stack.`
- Type: 2. Status: sourced.

### Claim 51. BINARY_OP pops rhs then lhs and pushes lhs op rhs.

- Link: [CPython v3.13.0 Doc/library/dis.rst L657-L664, BINARY_OP](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Doc/library/dis.rst#L657-L664)
- Quote (lines 657-664): `.. opcode:: BINARY_OP (op) / Implements the binary and in-place operators (depending on the value of / *op*):: / rhs = STACK.pop() / lhs = STACK.pop() / STACK.append(lhs op rhs)`
- Type: 2. Status: sourced.

### Claim 52. Co_stacksize is the required stack size of the code object.

- Link: [CPython v3.13.0 Doc/reference/datamodel.rst L1272-L1273, co_stacksize](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Doc/reference/datamodel.rst#L1272-L1273)
- Quote (lines 1272-1273): `* - .. attribute:: codeobject.co_stacksize / - The required stack size of the code object`
- Type: 2. Status: sourced.
