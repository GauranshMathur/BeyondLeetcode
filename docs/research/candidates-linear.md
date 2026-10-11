# Candidate Topics: linear structures

Research for BeyondLeetcode, slice "linear structures". Four candidate Topics: dynamic arrays, stacks, queues/ring buffers/deques, linked lists.

Method. Every source below was fetched and read in this session (raw files at the pinned tag via `curl`, docs pages via `curl`, the Disruptor PDF text-extracted locally with `pypdf`). Line numbers were read off the fetched file, not recalled. All code links are permalinks to a release tag. "Verified by opening" is "yes" for every row unless stated. Source types: 1 = source code, 2 = official docs for that version, 3 = paper/design doc, 4 = engineer talk/post on own site.

Tags used: CPython `v3.13.0`, Go `go1.22.0` (and `go1.17` for the old rule), Rust `1.80.0`, OpenJDK `jdk-21+35`, V8 `12.4.254.21`, Linux `v6.6`, Redis `7.2.0`, memcached `1.6.21`, LMAX Disruptor `4.0.0`, Qt `v6.5.0`.

---

## 1. Dynamic arrays

### Real systems

| System | Decision it made | Primary source (link) | Exact quote / line reference | Type | Opened |
|---|---|---|---|---|---|
| CPython `list` | Over-allocate by about 1/8 plus a constant, rounded to a multiple of 4. Shrink only when the length falls below half the capacity. | [listobject.c L99-L124](https://github.com/python/cpython/blob/v3.13.0/Objects/listobject.c#L99-L124) (`list_resize`) | L119: `new_allocated = ((size_t)newsize + (newsize >> 3) + 6) & ~(size_t)3;` L115: "The growth pattern is:  0, 4, 8, 16, 24, 32, 40, 52, 64, 76, ..." L109-L112: "The over-allocation is mild, but is enough to give linear-time amortized behavior" | 1 | yes |
| CPython `list` (doc) | A list is a contiguous array of references, not a linked list. | [FAQ: How are lists implemented in CPython?](https://docs.python.org/3.13/faq/design.html) | "CPython's lists are really variable-length arrays, not Lisp-style linked lists." | 2 | yes |
| Go slices (current) | Double while capacity < 256, then grow by `(cap + 3*256) / 4` per step, so the factor slides from 2x towards 1.25x. The result is then rounded up to an allocator size class. | [runtime/slice.go L266-L299](https://github.com/golang/go/blob/go1.22.0/src/runtime/slice.go#L266-L299) (`nextslicecap`) | L274 `const threshold = 256`; L282 `newcap += (newcap + 3*threshold) >> 2`; L279-L281 "Transition from growing 2x for small slices to growing 1.25x for large slices." Size-class rounding: call sites at L191-L218; `roundupsize` itself is in `msize_allocheaders.go` L16-L36 | 1 | yes |
| Go slices (before 1.18) | Double below 1024, then grow by 1.25x. This had a sudden jump at the threshold. | [go1.17 slice.go L181-L198](https://github.com/golang/go/blob/go1.17/src/runtime/slice.go#L181-L198) | L186 `if old.cap < 1024 {`; L192 `newcap += newcap / 4` | 1 | yes |
| Go 1.18 change | The change is announced in the release notes, but with no numbers. | [Go 1.18 release notes](https://go.dev/doc/go1.18) | "The new formula is less prone to sudden transitions in allocation behavior." | 2 | yes |
| Go spec | The language does not specify the growth rule, only that `append` allocates "sufficiently large". | [Go spec, Appending to and copying slices](https://go.dev/ref/spec#Appending_and_copying_slices) | "append allocates a new, sufficiently large underlying array" | 2 | yes (unversioned page) |
| Rust `Vec`/`RawVec` | Double (`max(cap*2, required)`), with a minimum non-zero capacity of 8 for 1-byte elements, 4 for elements up to 1 KiB, else 1. | [raw_vec.rs L133-L144](https://github.com/rust-lang/rust/blob/1.80.0/library/alloc/src/raw_vec.rs#L133-L144) and [L464-L482](https://github.com/rust-lang/rust/blob/1.80.0/library/alloc/src/raw_vec.rs#L464-L482) (`grow_amortized`) | L479: `let cap = cmp::max(self.cap.0 * 2, required_cap);` L477: "This guarantees exponential growth." L133: "Tiny Vecs are dumb." | 1 | yes |
| Rust `Vec` (doc) | The factor is deliberately not part of the contract. Only amortised O(1) push is. | [Vec docs, 1.80.0](https://doc.rust-lang.org/1.80.0/std/vec/struct.Vec.html) | "Vec does not guarantee any particular growth strategy when reallocating when full" ... "will of course guarantee O(1) amortized push." | 2 | yes |
| Java `ArrayList` | Grow by 1.5x (`oldCapacity >> 1` as the preferred growth), or by the minimum needed if that is larger. Default first capacity 10. | [ArrayList.java L231-L237](https://github.com/openjdk/jdk/blob/jdk-21+35/src/java.base/share/classes/java/util/ArrayList.java#L231-L237); [ArraysSupport.java L735-L747](https://github.com/openjdk/jdk/blob/jdk-21+35/src/java.base/share/classes/jdk/internal/util/ArraysSupport.java#L735-L747) | L236 `oldCapacity >> 1           /* preferred growth */`; L118 `DEFAULT_CAPACITY = 10`. Javadoc L52-L54: "The details of the growth policy are not specified beyond the fact that adding an element has constant amortized time cost." | 1 | yes |
| V8 JS arrays | New backing-store capacity = old + old/2 + 16 (1.5x plus a constant). | [js-objects.h L599-L605](https://github.com/v8/v8/blob/12.4.254.21/src/objects/js-objects.h#L599-L605) (`NewElementsCapacity`) | L603 "(old_capacity + 50%) + kMinAddedElementsCapacity"; L599 `kMinAddedElementsCapacity = 16` | 1 | yes. [NEEDS SOURCE] that `Array.prototype.push` reaches this function on every growth path; I opened the function, not the call chain. |
| V8 elements kinds | V8 tracks an "elements kind" per array and transitions only from specific to more general. | [Elements kinds in V8](https://v8.dev/blog/elements-kinds) (v8.dev, M. Bynens) | "elements kind transitions only go in one direction: from specific (e.g. PACKED_SMI_ELEMENTS) to more general" | 4 | yes |

Summary of over-allocation, as read from the sources above:

| System | Growth | Why (as stated in source) |
|---|---|---|
| CPython | about 1.125x + 6, to a multiple of 4 | "mild" over-allocation, still gives "linear-time amortized behavior" (L109-L112) |
| Go | 2x under 256, tends to 1.25x above | "smooth-ish transition" (L279-L281); 1.18 notes say the old formula had "sudden transitions" |
| Rust | 2x, minimum 4 | "guarantees exponential growth" (L477) |
| Java | 1.5x | not stated; the javadoc only promises constant amortised cost |
| V8 | 1.5x + 16 | not stated in the file |

### Why the decision is interesting

Every implementation here chose a multiplicative factor, because growing by a fixed amount would make n appends cost O(n^2) in total; the Rust source says "exponential growth" and the CPython comment says "linear-time amortized behavior" (both cited above). The factors differ (about 1.125x in CPython, 1.5x in Java and V8, 2x in Rust, 2x sliding to 1.25x in Go), which makes a clean compare-and-contrast: the learner can see that the contract is "amortised O(1) append" (amortised, not worst case; Rust docs and the Java javadoc both say it) and the factor is a free engineering choice. The Go change between 1.17 and 1.18 is a rare documented example of a real system fixing a discontinuity in its growth rule, and both versions are readable in source. CPython also shows the other half, shrinking: it keeps the buffer until the length drops under half (L99-L103), a hysteresis that stops a push/pop loop at the boundary from reallocating each time.

### Build sketch

Build: `Vec`, a growable array of integers on a raw fixed-size backing store the learner manages (no language-native list). It reads commands from stdin and prints results and, on request, capacity.

Core Problems (stdin commands, stdout results):
1. Fixed-capacity array: `PUSH x`, `GET i`, `LEN`, `CAP`; print `FULL` when pushing past capacity 4.
2. Grow when full by doubling; print `CAP` after each push for a series of pushes.
3. `POP`, `SET i x`, and bounds errors (`ERR index`) for GET/SET.
4. Pluggable policy: switch to CPython's formula `(n + (n>>3) + 6) & ~3`; the test checks the capacity trajectory against the 0, 4, 8, 16, 24, 32, 40, 52, 64, 76 sequence quoted in the source.
5. Go's rule (double under 256, then `(cap + 768) >> 2` steps), capacity trajectory for 1000 pushes. The statement must say "ignore allocator size classes" (see Risks).
6. Shrink on pop with a half-capacity threshold (CPython rule); output the number of reallocations for a push-then-pop script.
7. Amortised cost: count total element copies for N pushes under each policy and print them, so the learner sees the constant factor behind "amortised O(1)".

Extra Problems: (a) `INSERT i x` / `REMOVE i` that shift elements and count the moves; (b) `RESERVE n` and `SHRINK_TO_FIT`.

### Prerequisites
None.

### Source strength
Strong. Five independent code sources at pinned tags, each with a formula that can be quoted line by line, plus official docs for Rust, Java and Go that say the factor is unspecified, which supports a good "contract versus implementation" lesson.

### Risks
- Go's real capacities are rounded up to allocator size classes (slice.go L191-L213), so a pure-formula Build will not match what a learner sees from `cap()` in real Go. The Build and the statement must say so.
- Java's `ArrayList` and Rust's `Vec` docs deliberately do not promise a factor, so the chapter must say "this release does X, the contract is only amortised O(1)" and name the version.
- V8's growth is cited from one inline function; the full path (and the elements-kind store types) is a deeper rabbit hole. Treat V8 as optional.
- Learners in Python/TS can't hold a raw fixed-size array natively. The Build needs a tiny "fixed array" primitive (a pre-sized list) supplied by the harness.
- The tests must check capacity trajectories, which pins one policy per problem; the harness must state the policy exactly.

---

## 2. Stacks

### Real systems

| System | Decision it made | Primary source (link) | Exact quote / line reference | Type | Opened |
|---|---|---|---|---|---|
| CPython bytecode interpreter | Expressions run on a per-frame value stack. Instructions are declared by their stack effect, and the stack lives in the same array as the locals (`localsplus`). | [Python/bytecodes.c L450-L455](https://github.com/python/cpython/blob/v3.13.0/Python/bytecodes.c#L450-L455) and [Include/internal/pycore_frame.h L66-L75](https://github.com/python/cpython/blob/v3.13.0/Include/internal/pycore_frame.h#L66-L75) | bytecodes.c L450: `pure op(_BINARY_OP_ADD_INT, (left, right -- res))`; frame.h L70 `int stacktop;  /* Offset of TOS from localsplus  */`, L73-L74 "Locals and stack" / `PyObject *localsplus[1];` | 1 | yes |
| CPython compiler | The maximum stack depth of each code object is computed ahead of time by walking the control-flow graph, so the frame can be sized once. | [Python/flowgraph.c L758-L797](https://github.com/python/cpython/blob/v3.13.0/Python/flowgraph.c#L758-L797) (`calculate_stackdepth`) | L758 `calculate_stackdepth(cfg_builder *g)`; L771 `int maxdepth = 0;`; L797 `if (new_depth > maxdepth) {` | 1 | yes. [NEEDS SOURCE] for the claim that this value becomes `co_stacksize` and then `co_framesize`; I read `calculate_stackdepth` and `_PyFrame_NumSlotsForCodeObject` (frame.h L109-L115) but did not open the code-object assembly step that links them. |
| CPython `dis` docs | Documented as a stack machine, with the stack described as a Python list. | [dis, Python 3.13](https://docs.python.org/3.13/library/dis.html) | "we will refer to the interpreter stack as STACK and describe operations on it as if it was a Python list." | 2 | yes |
| JVM | Each frame has an operand stack whose maximum depth is fixed at compile time. | [JVMS SE 21, section 2.6.2](https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-2.html#jvms-2.6.2) | "The maximum depth of the operand stack of a frame is determined at compile-time"; "the iadd instruction adds two int values together." | 2 | yes |
| Qt `QUndoStack` (editor undo) | Undo is a stack of commands with an index. Pushing a new command deletes everything above the index (the redo tail), and merges with the top command when ids match. | [qundostack.cpp L567-L594](https://github.com/qt/qtbase/blob/v6.5.0/src/gui/util/qundostack.cpp#L567-L594) | L583-L584: `while (d->index < d->command_list.size()) delete d->command_list.takeLast();` L594 `if (try_merge && cur->mergeWith(cmd)) {` | 1 | yes |
| Qt `QUndoStack` (doc) | The stack has an undo limit that drops from the bottom. | [QUndoStack docs (Qt 6, unversioned page)](https://doc.qt.io/qt-6/qundostack.html) | "commands are deleted from the bottom of the stack" (undoLimit property) | 2 | yes (page is not pinned to a Qt minor version) |
| Go goroutine stacks | The call stack of each goroutine is a contiguous block that is copied to a block twice the size on overflow, and halved by the GC when mostly unused. Minimum 2048 bytes. | [runtime/stack.go L1074-L1075 and L1193-L1194](https://github.com/golang/go/blob/go1.22.0/src/runtime/stack.go#L1074-L1075) (`newstack`, `shrinkstack`) | L1075 `newsize := oldsize * 2`; L1194 `newsize := oldsize / 2`; L75 `stackMin = 2048` | 1 | yes |

### Why the decision is interesting

A stack looks too simple to need a real system, but the three uses above each pick a different answer to "how big can it get": the JVM and CPython fix the depth at compile time so the frame can be pre-sized (JVMS 2.6.2; CPython `calculate_stackdepth`), Go lets the call stack grow by doubling and shrink by halving (stack.go L1075, L1194), and Qt lets the undo stack grow without limit unless a limit is set, in which case the oldest entries leave from the bottom. The Qt push rule (delete the redo tail) is the exact behaviour every learner has felt in an editor, and it is a four-line loop in the source. Stack push/pop is O(1) in all of these; the Go growth step is the amortised-cost case from the dynamic array Topic.

### Build sketch

Build: a small stack-machine VM. Reads a program from stdin and runs it.

Core Problems:
1. Stack with `PUSH n`, `POP`, `PEEK`, `SIZE`; print the top or `EMPTY`.
2. Evaluate a reverse-Polish expression (`3 4 + 2 *`); the program is `PUSH`/`ADD`/`MUL`/`SUB` instructions as in `bytecodes.c` stack-effect style.
3. Compute the maximum stack depth of a straight-line program (CPython's `maxdepth`, JVM `max_stack`); output a single integer.
4. Add `JUMP_IF_ZERO`/branches and compute maximum depth over a control-flow graph; reject programs whose branch targets disagree on depth (the "inconsistent stackdepth" error in flowgraph.c L743 is the source of this rule).
5. Undo/redo: `DO cmd`, `UNDO`, `REDO`; a new `DO` after `UNDO` discards the redo tail (qundostack.cpp L583-L584). Output the document text after each command.
6. Command merging: consecutive `DO type c` of the same id merge into one undo step (the `mergeWith` rule).
7. Undo limit: when more than `K` commands exist, drop the oldest (needs removal from the bottom; the learner will want a deque or index offset).

Extra Problems: (a) valid-bracket matching with a stack; (b) simulate Go's stack growth: given a sequence of call/return frame sizes, print the stack size after each step under double-on-overflow, halve-when-under-quarter rules (the shrink rule in `shrinkstack` is more detailed than this; the problem statement must define its own rule).

### Prerequisites
Soft: dynamic arrays (stack is an array with a top index). Problem 7 benefits from queues/deques. A learner can still start here without them.

### Source strength
Medium. CPython, JVM, Qt and Go are all citable, but the stack data structure itself is trivial in each; the interesting part is the surrounding design and one claim (stack depth feeding into the frame size) still needs a linking step.

### Risks
- Weak "data structure decision": the structure is an array plus an index. The Topic reads better as a "what do real systems use a stack for" Topic than as a deep one.
- The Qt doc page is unversioned; the code citation is the one to lean on.
- Undo stacks in other editors (Vim, Emacs) use trees or lists; I did not open those sources, so this Topic cites only Qt for editors. [NEEDS SOURCE] for any claim about Vim or Emacs.
- Problem 4 (depth over a CFG) is the hardest to state precisely and may need a Core Problem split.

---

## 3. Queues, ring buffers and deques

### Real systems

| System | Decision it made | Primary source (link) | Exact quote / line reference | Type | Opened |
|---|---|---|---|---|---|
| Go channels | A buffered channel is a fixed-size circular queue: a buffer, a count and two indices that wrap to 0. | [runtime/chan.go L33-L52](https://github.com/golang/go/blob/go1.22.0/src/runtime/chan.go#L33-L52) (`hchan`), [L216-L230](https://github.com/golang/go/blob/go1.22.0/src/runtime/chan.go#L216-L230) (send), [L537-L553](https://github.com/golang/go/blob/go1.22.0/src/runtime/chan.go#L537-L553) (receive) | L35 `dataqsiz uint           // size of the circular queue`; L223-L226 `c.sendx++; if c.sendx == c.dataqsiz { c.sendx = 0 }`; L547-L550 same for `recvx` | 1 | yes |
| Linux `kfifo` | Capacity is rounded up to a power of 2 so that `in` and `out` can be free-running counters that are allowed to wrap, with `& mask` taking the slot. No lock for one reader and one writer. | [lib/kfifo.c L17-L31](https://github.com/torvalds/linux/blob/v6.6/lib/kfifo.c#L17-L31); [include/linux/kfifo.h L29-L37, L44-L50](https://github.com/torvalds/linux/blob/v6.6/include/linux/kfifo.h#L29-L37) | kfifo.c L28-L29 "round up to the next power of 2, since our 'let the indices wrap' technique works only in this case."; L21 `return (fifo->mask + 1) - (fifo->in - fifo->out);`; kfifo.h L30-L31 "There is no locking required until only one reader and one writer is using the fifo" | 1 | yes |
| LMAX Disruptor (paper) | Replace a linked-list or bounded queue with a pre-allocated ring buffer, power-of-2 sized with a bit mask in place of `%`. Producers track consumer sequences to avoid lapping them. | [Disruptor technical paper v1.0 (PDF)](https://lmax-exchange.github.io/disruptor/files/Disruptor-1.0.pdf), section 4.2, p. 5; section 4.3, p. 6 | "linked-list backed queues are a not a good approach." "This cost can be greatly reduced by making the ring size a power of 2." "consumer sequences allow the producers to track consumers to prevent the ring from wrapping." | 3 | yes (text extracted locally; page numbers from extraction) |
| LMAX Disruptor (code) | Constructor refuses non-power-of-2 sizes and masks the sequence to get the slot. | [RingBuffer.java L54-L61, L74](https://github.com/LMAX-Exchange/disruptor/blob/4.0.0/src/main/java/com/lmax/disruptor/RingBuffer.java#L54-L61) | L56 `"bufferSize must be a power of 2"`; L59 `this.indexMask = bufferSize - 1;`; L74 `entries[BUFFER_PAD + (int) (sequence & indexMask)]` | 1 | yes |
| Java `ArrayDeque` | A resizable circular array with head and tail indices; grows by doubling when small (under 64) and by 50% after; on growth unwraps the wrapped segment. | [ArrayDeque.java L139-L159](https://github.com/openjdk/jdk/blob/jdk-21+35/src/java.base/share/classes/java/util/ArrayDeque.java#L139-L159) | L143 "Double capacity if small; else grow by 50%"; L144 `int jump = (oldCapacity < 64) ? (oldCapacity + 2) : (oldCapacity >> 1);`; L47-L49 "likely to be faster than Stack when used as a stack, and faster than LinkedList when used as a queue." | 1 | yes |
| CPython `collections.deque` | A doubly-linked list of fixed-length blocks of 64 slots, not a single array and not one node per item. Never calls `realloc()`. | [Modules/_collectionsmodule.c L70-L98](https://github.com/python/cpython/blob/v3.13.0/Modules/_collectionsmodule.c#L70-L98), [L128-L132](https://github.com/python/cpython/blob/v3.13.0/Modules/_collectionsmodule.c#L128-L132) | L77 `#define BLOCKLEN 64`; L81-L86 "stored in a doubly-linked list of fixed length blocks. This assures that appends or pops never move any other data elements ... avoids use of realloc()"; L88-L91 "200% memory overhead" for one datum per link | 1 | yes |
| CPython deque (doc) | Documented as O(1) at both ends; the same page says list incurs O(n) memory movement for the equivalent operations. | [collections docs, 3.13](https://docs.python.org/3.13/library/collections.html#collections.deque) | "Deques support thread-safe, memory efficient appends and pops from either side of the deque with approximately the same O(1) performance in either direction." | 2 | yes |
| CPython deque `maxlen` | A deque can have a size limit (`maxlen`, -1 means unbounded) and trims on append. | [_collectionsmodule.c L141, L323-L335](https://github.com/python/cpython/blob/v3.13.0/Modules/_collectionsmodule.c#L323-L335) | L141 `Py_ssize_t maxlen;          /* maxlen is -1 for unbounded deques */` | 1 | yes (only the struct field and macro; I did not read the full trim path) |

### Why the decision is interesting

All of these are the same problem (a FIFO that doesn't move its elements), solved with three different layouts: a fixed ring (Go channels, kfifo, Disruptor), a growable ring (Java `ArrayDeque`), and a linked list of blocks (CPython `deque`). The power-of-2 mask trick shows up twice with explicit reasoning (kfifo: "works only in this case"; Disruptor: remainder is costly on most processors, a mask is cheap), and kfifo adds the subtler piece: indices are never reduced, only masked when used, so full and empty are distinguished by `in - out` even after wraparound. CPython's comment argues in numbers for blocks over per-item nodes ("200% memory overhead") and for blocks over `realloc()` ("more predictable performance"). Every enqueue/dequeue here is O(1) worst case, except Java `ArrayDeque.grow` and the amortised array resize, which are O(n) on that one call and amortised O(1) overall.

### Build sketch

Build: `Queue`, a FIFO and deque on top of a ring buffer, driven by stdin commands.

Core Problems:
1. Bounded FIFO with `head` and `count`: `ENQ x`, `DEQ`, `SIZE`; print `FULL` / `EMPTY` (the shape of `hchan`: `qcount`, `dataqsiz`).
2. Wraparound with `sendx` / `recvx` indices that reset to 0 (chan.go L223-L226); a script that wraps the buffer several times must still print values in order.
3. kfifo style: capacity rounded up to a power of 2, free-running `in`/`out` counters masked on use; emulate 32-bit unsigned wrap and test a script that pushes the counter past 2^32. Print `CAP` and `LEN = in - out`.
4. Growable ring (`ArrayDeque`): double when full and unwrap the two segments into the new array; print the internal array layout after each grow.
5. Deque: `PUSH_FRONT`, `PUSH_BACK`, `POP_FRONT`, `POP_BACK` on the ring.
6. Block-linked deque: same operations on blocks of size B (B given on the first line of stdin, 64 in CPython); print the number of blocks in use after each operation.
7. Overwrite mode: bounded ring that drops the oldest on enqueue when full (CPython `maxlen`); print the contents.

Extra Problems: (a) single-threaded Disruptor model: a producer sequence, two consumer sequences, and `CLAIM` fails if it would lap the slowest consumer ("prevent the ring from wrapping"); (b) sliding-window maximum with a deque.

### Prerequisites
Dynamic arrays (for problem 4). Problems 1-3 stand alone. Problem 6 benefits from linked lists but doesn't need them.

### Source strength
Strong. Six code sources with explicit comments about the decision (including numbers: 64, 200%, power-of-2) and one primary paper.

### Risks
- The concurrency story is the real reason Go, kfifo and the Disruptor exist, and it can't be tested by stdin to stdout. The Build has to stay single-threaded and the chapter has to say the concurrency half is left out.
- The Disruptor paper is dated 2011 and describes v1.0; the code link is a 4.0.0 tag. The paper's claims are about ideas, not that file. Say so.
- The `kfifo` quote about locking is about one reader/one writer; a careless summary would say "lock-free" without that condition.
- Java `ArrayDeque`'s growth rule (L144) is a detail of one JDK release; cite the tag.
- Problem 3 needs a language-independent 32-bit wrap; in Python this must be done by hand with `& 0xFFFFFFFF`.

---

## 4. Linked lists

### Real systems

| System | Decision it made | Primary source (link) | Exact quote / line reference | Type | Opened |
|---|---|---|---|---|---|
| Linux `list_head` | Intrusive circular doubly linked list. The node lives inside the object, and `container_of` recovers the object from the node, so one node type serves every struct. | [include/linux/types.h L190-L192](https://github.com/torvalds/linux/blob/v6.6/include/linux/types.h#L190-L192), [include/linux/list.h L14, L146-L157, L193-L197, L600-L601](https://github.com/torvalds/linux/blob/v6.6/include/linux/list.h#L146-L157), [container_of.h L18-L23](https://github.com/torvalds/linux/blob/v6.6/include/linux/container_of.h#L18-L23) | types.h L190-L192 `struct list_head { struct list_head *next, *prev; };`; list.h L14 "Circular doubly linked list implementation."; L600-L601 `#define list_entry(ptr, type, member) container_of(ptr, type, member)`; L193-L196 `__list_del`: `next->prev = prev; WRITE_ONCE(prev->next, next);` | 1 | yes |
| Linux dentry and inode LRU | The kernel's caches thread the same `list_head` through the cached objects as an LRU list. | [include/linux/dcache.h L101](https://github.com/torvalds/linux/blob/v6.6/include/linux/dcache.h#L101), [include/linux/fs.h L704](https://github.com/torvalds/linux/blob/v6.6/include/linux/fs.h#L704) | dcache.h L101 `struct list_head d_lru;		/* LRU list */`; fs.h L704 `struct list_head	i_lru;		/* inode LRU list */` | 1 | yes (declarations only, I did not trace the eviction code) |
| memcached | Item is its own list node (`prev`/`next` in the item), one doubly linked LRU per slab class, with head and tail pointers. `link` pushes at the head in O(1); `unlink` splices out in O(1). Items start in HOT, with WARM/COLD/TEMP segments. | [memcached.h L577-L580](https://github.com/memcached/memcached/blob/1.6.21/memcached.h#L577-L580), [items.c L420-L433](https://github.com/memcached/memcached/blob/1.6.21/items.c#L420-L433), [L460-L478](https://github.com/memcached/memcached/blob/1.6.21/items.c#L460-L478), [L321-L330](https://github.com/memcached/memcached/blob/1.6.21/items.c#L321-L330) | memcached.h L579-L580 `struct _stritem *next; struct _stritem *prev;`; items.c L420 `static void do_item_link_q(item *it) { /* item is the new head */`; L321 "Items are initially loaded into the HOT_LRU." | 1 | yes |
| Redis eviction | **Counter-example.** Redis 7.2 does not keep a linked list for LRU. It stores a 24-bit access clock in each object and evicts the best of a small random sample, in constant memory. | [src/evict.c L90-L110](https://github.com/redis/redis/blob/7.2.0/src/evict.c#L90-L110), [src/server.h L892-L902](https://github.com/redis/redis/blob/7.2.0/src/server.h#L892-L902) | evict.c L104-L106: "Redis uses an approximation of the LRU algorithm that runs in constant memory. Every time there is a key to expire, we sample N keys"; server.h L892 `#define LRU_BITS 24`, L902 `unsigned lru:LRU_BITS;` | 1 | yes |
| Redis eviction (doc) | Same, in the official docs. | [Key eviction (redis.io, current docs; not pinned to 7.2)](https://redis.io/docs/latest/develop/reference/eviction/) | "uses an approximation of the least recently used keys rather than calculating them exactly. It samples a small number of keys at random" | 2 | yes |
| Redis list type | The List type is a doubly linked list of compact `listpack` blocks (an "unrolled" list), with a node size cap (`list-max-listpack-size`, default -2 = 8 KB). | [src/quicklist.h L98-L115](https://github.com/redis/redis/blob/7.2.0/src/quicklist.h#L98-L115), [quicklist.c L1](https://github.com/redis/redis/blob/7.2.0/src/quicklist.c#L1), [redis.conf L1930-L1942](https://github.com/redis/redis/blob/7.2.0/redis.conf#L1930-L1942) | quicklist.c L1 "quicklist.c - A doubly linked list of listpacks"; quicklist.h L109-L110 `count` = entries, `len` = nodes; redis.conf L1942 `list-max-listpack-size -2` | 1 | yes |
| Redis list (doc) | Docs say lists are linked lists, push at either end in constant time, and index access is proportional to the index. | [Redis Lists (redis.io, current docs, not pinned to 7.2)](https://redis.io/docs/latest/develop/data-types/lists/) | "Redis lists are implemented via Linked Lists." "constant time" push at head or tail; indexed access "not so fast ... proportional to the index" | 2 | yes |
| Go `container/list` | A doubly linked list with a sentinel root so the list is a ring; elements hold `Value any`. | [src/container/list/list.go L14-L50](https://github.com/golang/go/blob/go1.22.0/src/container/list/list.go#L14-L50), [L180-L186](https://github.com/golang/go/blob/go1.22.0/src/container/list/list.go#L180-L186) | L17-L20 "a list l is implemented as a ring, such that &l.root is both the next element of the last list element ... and the previous element of the first"; L180 `func (l *List) MoveToFront(e *Element) {` | 1 | yes |

### Why the decision is interesting

Linked lists survive in real systems for one reason: O(1) insert and remove when you already hold a pointer to the node (worst case, not amortised), which is what an LRU needs for "move this item to the front" (memcached `do_item_link_q` / `do_item_unlink_q`, Go's `MoveToFront`). Linux takes this further with an intrusive list so there is no allocation per link and one list implementation serves every struct (list.h L600-L601). Redis is the useful contrast: it asks for a list on the List type but stores blocks of entries per node (quicklist), and for LRU it avoids a list altogether and samples, trading exactness for constant memory (evict.c L104-L106). So the honest message is that a plain one-item-per-node list is rarely what a real system ships.

### Build sketch

Honest verdict first: **linked lists are a weak standalone Topic and a strong part of another one.** The structure is easy and every learner has seen it; the systems evidence is that the real uses are (a) intrusive lists inside a C kernel (hard to teach in Python/TS/Go because `container_of` has no analogue), (b) the doubly linked list inside an LRU cache, and (c) hybrids (quicklist, deque blocks). I recommend folding them into an "LRU cache" Topic (hash map plus doubly linked list) or into the queue/deque Topic (problem 6 above is already an unrolled list).

If a standalone Topic is wanted, Build: `List`, a doubly linked list with a sentinel node, operating on node handles.

Core Problems:
1. Singly linked list: `PUSH_FRONT`, `PUSH_BACK`, `PRINT`.
2. Doubly linked list with a sentinel (Go `container/list` shape), `REMOVE handle`, `PRINT` and `PRINT_REVERSE`.
3. `MOVE_TO_FRONT handle`, with every handle valid after it.
4. Intrusive variant: nodes stored in a table keyed by object id, with `prev`/`next` as ids, so the same node type threads two lists at once (the dcache/inode LRU idea).
5. LRU on top: a `GET`/`PUT` cache with capacity K (memcached link-at-head, evict-at-tail), output hit/miss and evictions.
6. Unrolled list (quicklist): nodes hold up to B entries; `PUSH_BACK` fills the tail node or starts a new one; print the node count.

Extra Problems: (a) reverse a list in place; (b) a Redis-style sampled LRU (sample N, evict oldest) and compare hit rates with exact LRU on a given trace.

### Prerequisites
None for problems 1-3. Problem 5 needs hash maps.

### Source strength
Medium. The code sources are strong and exact, but the decisions are about a use case (LRU) rather than the structure, and the one system most people name for LRU (Redis) does not use a list.

### Risks
- Intrusive lists are not expressible in Python/TS/Go the way they are in C; the Build can only approximate with ids.
- The Redis docs pages cited are "latest", not pinned to 7.2; use the pinned source files as the primary citation.
- dcache.h and fs.h confirm only that the LRU `list_head` fields exist. [NEEDS SOURCE] for how the Linux kernel's dentry or inode LRU is actually ordered and evicted (I did not open `fs/dcache.c`, `fs/inode.c` or `mm/list_lru.c`).
- memcached's HOT/WARM/COLD/TEMP behaviour (promotion rules) was seen only as names and the initial placement. [NEEDS SOURCE] for how items move between segments.
- "Linked lists beat arrays for insertion" is a myth about cache behaviour; I have no primary source in this slice for that claim, so it must not be asserted. [NEEDS SOURCE]

---

## Ranking as first-Topic material

A first Topic needs no prerequisites, strong sources and a satisfying Build.

1. **Dynamic arrays.** No prerequisites. Strongest sources (five systems, exact formulas at pinned tags). The Build has deterministic, formula-checked outputs and produces a clear "amortised cost" payoff. Only caveat: Go's size-class rounding.
2. **Queues / ring buffers / deques.** Strong sources and a satisfying Build (wraparound, mask, grow, blocks). Slightly harder to start with because problem 4 wants the array resize, and the concurrency half is untestable. Good second Topic, or first if the array resize is deferred.
3. **Stacks.** No hard prerequisites, but the data structure is thin; works best as a short Topic that follows arrays, with undo/redo as the memorable Build.
4. **Linked lists.** Weak as a standalone Topic. Fold into an LRU cache Topic or into the deque Topic.

---

## All [NEEDS SOURCE] markers

1. V8: that `Array.prototype.push` reaches `JSObject::NewElementsCapacity` on every growth path (function itself verified).
2. CPython: that `calculate_stackdepth` output becomes `co_stacksize` and then `co_framesize` (both ends opened, the assembly step between them not).
3. Stacks: any claim about Vim or Emacs undo (not opened).
4. Linked lists: how the Linux dentry/inode LRU is ordered and evicted (only the field declarations were opened).
5. Linked lists: memcached HOT/WARM/COLD promotion rules (only names and initial placement were opened).
6. Linked lists: any claim that linked lists lose to arrays on cache behaviour (no primary source gathered).

Count: 6.

---

## Links opened

Code (all raw/blob at pinned tags, read in full or by line range):
- https://github.com/python/cpython/blob/v3.13.0/Objects/listobject.c
- https://github.com/python/cpython/blob/v3.13.0/Modules/_collectionsmodule.c
- https://github.com/python/cpython/blob/v3.13.0/Python/bytecodes.c
- https://github.com/python/cpython/blob/v3.13.0/Python/flowgraph.c
- https://github.com/python/cpython/blob/v3.13.0/Include/internal/pycore_frame.h
- https://github.com/golang/go/blob/go1.22.0/src/runtime/slice.go
- https://github.com/golang/go/blob/go1.17/src/runtime/slice.go
- https://github.com/golang/go/blob/go1.22.0/src/runtime/chan.go
- https://github.com/golang/go/blob/go1.22.0/src/runtime/stack.go
- https://github.com/golang/go/blob/go1.22.0/src/container/list/list.go
- https://github.com/rust-lang/rust/blob/1.80.0/library/alloc/src/raw_vec.rs
- https://github.com/openjdk/jdk/blob/jdk-21+35/src/java.base/share/classes/java/util/ArrayList.java
- https://github.com/openjdk/jdk/blob/jdk-21+35/src/java.base/share/classes/java/util/ArrayDeque.java
- https://github.com/openjdk/jdk/blob/jdk-21+35/src/java.base/share/classes/jdk/internal/util/ArraysSupport.java
- https://github.com/v8/v8/blob/12.4.254.21/src/objects/js-objects.h
- https://github.com/torvalds/linux/blob/v6.6/include/linux/list.h
- https://github.com/torvalds/linux/blob/v6.6/include/linux/types.h
- https://github.com/torvalds/linux/blob/v6.6/include/linux/container_of.h
- https://github.com/torvalds/linux/blob/v6.6/include/linux/kfifo.h
- https://github.com/torvalds/linux/blob/v6.6/lib/kfifo.c
- https://github.com/torvalds/linux/blob/v6.6/include/linux/dcache.h
- https://github.com/torvalds/linux/blob/v6.6/include/linux/fs.h
- https://github.com/redis/redis/blob/7.2.0/src/evict.c
- https://github.com/redis/redis/blob/7.2.0/src/server.h
- https://github.com/redis/redis/blob/7.2.0/src/quicklist.h
- https://github.com/redis/redis/blob/7.2.0/src/quicklist.c
- https://github.com/redis/redis/blob/7.2.0/redis.conf
- https://github.com/memcached/memcached/blob/1.6.21/memcached.h
- https://github.com/memcached/memcached/blob/1.6.21/items.c
- https://github.com/LMAX-Exchange/disruptor/blob/4.0.0/src/main/java/com/lmax/disruptor/RingBuffer.java
- https://github.com/qt/qtbase/blob/v6.5.0/src/gui/util/qundostack.cpp

Docs, papers and posts:
- https://docs.python.org/3.13/faq/design.html
- https://docs.python.org/3.13/library/collections.html
- https://docs.python.org/3.13/library/dis.html
- https://go.dev/doc/go1.18
- https://go.dev/ref/spec
- https://go.dev/blog/slices-intro (opened as a lead; not cited)
- https://doc.rust-lang.org/1.80.0/std/vec/struct.Vec.html
- https://v8.dev/blog/elements-kinds
- https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-2.html
- https://doc.qt.io/qt-6/qundostack.html
- https://redis.io/docs/latest/develop/reference/eviction/
- https://redis.io/docs/latest/develop/data-types/lists/
- https://lmax-exchange.github.io/disruptor/files/Disruptor-1.0.pdf

Fetched but not relied on: https://lmax-exchange.github.io/disruptor/disruptor.html (user guide, not read in detail).

Notes on method: the Disruptor PDF could not be read by the WebFetch summariser (binary streams), so I extracted its text locally and quoted from that. Source files were fetched with `curl` from raw.githubusercontent.com at the tag rather than through WebFetch, so that line numbers come from the actual file.
