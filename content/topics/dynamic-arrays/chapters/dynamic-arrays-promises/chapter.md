# Rust and Java: what is promised

You have now built three growth rules, and none of them is "the" rule. This Chapter looks at what Rust's `Vec` and Java's `ArrayList` put in writing, what they leave out on purpose, and the controls they give to a caller who knows more than the growth rule does.

## The promise is the cost, not the factor

Rust's documentation for `Vec` (Rust 1.80.0) says: "Vec does not guarantee any particular growth strategy when reallocating when full, nor when reserve is called." It goes on: "Whatever strategy is used will of course guarantee O(1) amortized push." ([Vec, section "Guarantees"](https://doc.rust-lang.org/1.80.0/std/vec/struct.Vec.html#guarantees))

Java's `ArrayList` says nearly the same thing (JDK 21): "The details of the growth policy are not specified beyond the fact that adding an element has constant amortized time cost." ([ArrayList.java, lines 52 to 54](https://github.com/openjdk/jdk/blob/jdk-21%2B35/src/java.base/share/classes/java/util/ArrayList.java#L52-L58))

Both promise the amortised cost of adding an item. Neither promises a number. Rust's documentation of `push` even gives the reason in one sentence: when the block is full the items move to a larger one, and "This expensive operation is offset by the capacity O(1) insertions it allows." ([Vec::push, "Time complexity"](https://doc.rust-lang.org/1.80.0/std/vec/struct.Vec.html#method.push))

## What they do today

The number is in the source code, where it can change between releases.

Rust 1.80.0 doubles:

```rust
// This guarantees exponential growth. The doubling cannot overflow
// because `cap <= isize::MAX` and the type of `cap` is `usize`.
let cap = cmp::max(self.cap.0 * 2, required_cap);
let cap = cmp::max(Self::MIN_NON_ZERO_CAP, cap);
```

([library/alloc/src/raw_vec.rs, lines 474 to 482](https://github.com/rust-lang/rust/blob/1.80.0/library/alloc/src/raw_vec.rs#L474-L482))

It also skips the smallest sizes. The first block has 8 slots for one-byte items, 4 for items up to 1 KiB, and 1 for anything larger; the comment begins "Tiny Vecs are dumb." ([raw_vec.rs, lines 133 to 144](https://github.com/rust-lang/rust/blob/1.80.0/library/alloc/src/raw_vec.rs#L133-L144))

JDK 21 grows by half. `grow` asks for a new length with `oldCapacity >> 1` as the "preferred growth". ([ArrayList.java, lines 231 to 237](https://github.com/openjdk/jdk/blob/jdk-21%2B35/src/java.base/share/classes/java/util/ArrayList.java#L231-L237))

Side by side, at the versions this Topic has read:

| System | Rule when full |
|---|---|
| CPython 3.13.0 `list` | needed size + one eighth + 6, rounded down to a multiple of 4 |
| Go 1.22.0 slice | double below 256 slots, then a quarter plus 192 |
| Rust 1.80.0 `Vec` | double |
| JDK 21 `ArrayList` | add half |

Four systems, four numbers, one idea: grow by a share of the current size.

## Shrinking is a choice too

CPython's list gives memory back once it is under half full, as the first Chapter showed. Rust decided the opposite and put it in writing: "Vec will never automatically shrink itself, even if completely empty." The stated reason: "Emptying a Vec and then filling it back up to the same len should incur no calls to the allocator." ([Vec, section "Guarantees"](https://doc.rust-lang.org/1.80.0/std/vec/struct.Vec.html#guarantees))

JDK 21's `ArrayList` does not shrink on removal either. Removing an item shifts the later ones down and clears the last slot (`es[size = newSize] = null;`); the array itself stays. ([ArrayList.java, lines 719 to 725](https://github.com/openjdk/jdk/blob/jdk-21%2B35/src/java.base/share/classes/java/util/ArrayList.java#L719-L725))

## Controls for the caller

A growth rule has to guess. A caller sometimes knows.

**Before filling.** If you know how many items are coming, ask for the room once. Rust's documentation recommends it: "it is recommended to use Vec::with_capacity whenever possible to specify how big the vector is expected to get." ([Vec, section "Capacity and reallocation"](https://doc.rust-lang.org/1.80.0/std/vec/struct.Vec.html#capacity-and-reallocation)) Java has `ensureCapacity`: "An application can increase the capacity of an ArrayList instance before adding a large number of elements using the ensureCapacity operation. This may reduce the amount of incremental reallocation." ([ArrayList.java, lines 56 to 58](https://github.com/openjdk/jdk/blob/jdk-21%2B35/src/java.base/share/classes/java/util/ArrayList.java#L52-L58))

**After filling.** When a list has stopped growing, the spare slots are waste. Java's `trimToSize` copies the items into an array of exactly the right size: "An application can use this operation to minimize the storage of an ArrayList instance." ([ArrayList.java, lines 194 to 206](https://github.com/openjdk/jdk/blob/jdk-21%2B35/src/java.base/share/classes/java/util/ArrayList.java#L194-L206)) Rust has `shrink_to_fit`, and is careful not to promise an exact fit: "The resulting vector might still have some excess capacity". ([Vec::shrink_to_fit](https://doc.rust-lang.org/1.80.0/std/vec/struct.Vec.html#method.shrink_to_fit))

In the last Problem you add both controls to the Build and see what they do to the copies counter.
