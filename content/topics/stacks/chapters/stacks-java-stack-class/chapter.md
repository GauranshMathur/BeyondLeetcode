# Java: a Stack that is a Vector

The call stack of the last Chapter belongs to the runtime. Most programs also need stacks of their own: an undo history, a path being explored, a pile of work. This Chapter reads one decision about how to provide that: the `java.util.Stack` class in OpenJDK, tag `jdk-21+35`. In the Problems you build its operations on the growable array behind it, and then add the one thing it lacks.

## A stack as five more methods on a vector

The Javadoc says what the class is: "It extends class `Vector` with five operations that allow a vector to be treated as a stack. The usual `push` and `pop` operations are provided, as well as a method to `peek` at the top item on the stack, a method to test for whether the stack is `empty`, and a method to `search` the stack for an item and discover how far it is from the top." ([Stack.java, lines 29 to 35](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Stack.java#L29-L35)) The declaration is `public class Stack<E> extends Vector<E>` ([line 50](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Stack.java#L50)).

`Vector` is the growable array that `Stack` is built on. Each stack operation is a line or two on top of it:

- `push(item)` is `addElement(item)` ([lines 67 to 71](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Stack.java#L67-L71)).
- `pop()` calls `peek()` and then `removeElementAt(len - 1)` ([lines 81 to 89](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Stack.java#L81-L89)). `peek()` throws `EmptyStackException` when the stack is empty ([lines 99 to 105](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Stack.java#L99-L105)).
- `search(o)` is `lastIndexOf(o)` turned into a distance from the top: "the topmost item on the stack is considered to be at distance `1`", and `-1` means the object is not there ([lines 117 to 138](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Stack.java#L117-L138)).

So a stack costs no new structure: the top is the end of the array. Your Build will return `error` where Java throws.

## What push and pop cost

`Vector()` makes an array of 10 slots: "Constructs an empty vector so that its internal data array has size `10` and its standard capacity increment is zero." ([Vector.java, lines 163 to 169](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Vector.java#L163-L169)) When the array is full, `grow` replaces it with `Arrays.copyOf(elementData, newCapacity)` ([lines 256 to 263](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Vector.java#L256-L263)). With a capacity increment of zero the rule is in the Javadoc of `ensureCapacity`: "the new capacity will be twice the old capacity" ([lines 232 to 236](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Vector.java#L232-L236)).

That is the doubling of the Dynamic arrays Topic with a different start. A full stack of 10 copies 10 items to become 20, then 20 to become 40. So `push` is O(n) in the **worst case**, for the push that fills the array, and O(1) **amortised**.

`pop` is O(1) in the **worst case**. `removeElementAt` only moves items that sit above the removed one, and for the last item there are none: `int j = elementCount - index - 1; if (j > 0) { System.arraycopy(...) }` ([lines 547 to 562](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Vector.java#L547-L562)). It also clears the slot, "to let gc do its work" ([line 561](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Vector.java#L561)), but it never makes the array smaller. A stack that once held a million items keeps room for a million. The Build counts the copies and the capacity to show this.

`search` has to look through the array, so it is O(n) in the **worst case**. The other operations do not.

## The decision, and the doc that regrets it

Making `Stack` a subclass of `Vector` has two consequences that are visible in the code. Every `Vector` method is also a `Stack` method, so a caller can reach into the middle of a stack, for instance [`insertElementAt`](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Vector.java#L587), which breaks last-in, first-out. And these methods are `synchronized` (`pop`, `peek` and `search` are declared so in [Stack.java, lines 81, 99 and 131](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Stack.java#L81); `addElement` is so in [Vector.java, line 615](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Vector.java#L615)), so each call takes a lock.

The class's own Javadoc points elsewhere: "A more complete and consistent set of LIFO stack operations is provided by the `Deque` interface and its implementations, which should be used in preference to this class." ([Stack.java, lines 39 to 43](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Stack.java#L39-L43)) The same text gives `Deque<Integer> stack = new ArrayDeque<Integer>();` as the replacement.

## What is not there

None of the five operations returns the smallest item. A stack that must answer "what is the minimum?" cannot get it from `peek`, and `search` needs a value to look for. The second Problem adds that operation. The idea is to keep a second stack beside the first, one entry per item, holding the smallest value at or below that item. Both stacks change together, so both operations stay O(1) in the **worst case** (apart from the growth copies), and the extra stack costs O(n) memory.
