# Go: a growth rule that changed

Go's slices grow with `append`, like a Python list. The interesting part is that Go's rule for how much to grow was rewritten in Go 1.18, and the person who rewrote it explained why. This Chapter reads both rules.

## A slice is three numbers

Inside the Go runtime a slice is this struct:

```go
type slice struct {
	array unsafe.Pointer
	len   int
	cap   int
}
```

([src/runtime/slice.go, lines 15 to 19, Go 1.22.0](https://github.com/golang/go/blob/go1.22.0/src/runtime/slice.go#L15-L19))

The Go team's own article describes it the same way: "It consists of a pointer to the array, the length of the segment, and its capacity". ([Go Slices: usage and internals](https://go.dev/blog/slices-intro), section "Slice internals")

A pointer to a block, a length and a capacity: the same three things your Build keeps.

## Append on a full slice

The language specification says what `append` must do when there is no room: it "allocates a new, sufficiently large underlying array that fits both the existing slice elements and the additional values." ([The Go Programming Language Specification, Go 1.22.0, "Appending to and copying slices"](https://github.com/golang/go/blob/go1.22.0/doc/go_spec.html#L7272-L7277))

"Sufficiently large" is all the specification promises. How large is decided in the runtime, by a function called `growslice`. Its comment reads: "A new backing store is allocated with space for at least newLen elements. Existing entries [0, oldLen) are copied over to the new backing store." ([src/runtime/slice.go, lines 143 to 144](https://github.com/golang/go/blob/go1.22.0/src/runtime/slice.go#L142-L145))

## The rule in Go 1.22

`growslice` asks `nextslicecap` for the new capacity:

```go
const threshold = 256
if oldCap < threshold {
	return doublecap
}
for {
	// Transition from growing 2x for small slices
	// to growing 1.25x for large slices. This formula
	// gives a smooth-ish transition between the two.
	newcap += (newcap + 3*threshold) >> 2
	...
```

([src/runtime/slice.go, lines 266 to 299](https://github.com/golang/go/blob/go1.22.0/src/runtime/slice.go#L266-L299))

Below 256 slots the capacity doubles. From 256 up, each step adds a quarter of the capacity plus 192 (`3 * 256 / 4`). The fixed 192 matters a lot when the slice is small and hardly at all when it is large, so the growth factor slides from 2 down towards 1.25. Appending one item at a time, the capacities after 256 are 512, 832, 1232, 1732.

## The rule before Go 1.18

In Go 1.17 the same code read:

```go
if old.cap < 1024 {
	newcap = doublecap
} else {
	for 0 < newcap && newcap < cap {
		newcap += newcap / 4
	}
```

([src/runtime/slice.go, lines 181 to 198, Go 1.17](https://github.com/golang/go/blob/go1.17/src/runtime/slice.go#L181-L198))

Double below 1024 slots, then add a quarter. The capacities after 256 are 512, 1024, 1280, 1600. The factor is 2 for the step up to 1024 and 1.25 for the very next one.

## Why it was changed

The commit that replaced the rule says: "Instead of growing 2x for < 1024 elements and 1.25x for >= 1024 elements, use a somewhat smoother formula for the growth factor." It also says the change "makes the growth monotonic (larger initial capacities make larger final capacities, which was not true before)". ([commit 2dda92f, "runtime: make slice growth formula a bit smoother", Keith Randall](https://github.com/golang/go/commit/2dda92ff6f9f07eeb110ecbf0fc2d7a0ddd27f9d))

"Not monotonic" is easy to see with the old rule. A slice with capacity 1000 doubles to 2000. A slice with capacity 1024, which started out bigger, grows by a quarter to 1280 and ends up smaller.

The Go 1.18 release notes sum it up in one line: "The new formula is less prone to sudden transitions in allocation behavior." ([Go 1.18 Release Notes](https://go.dev/doc/go1.18), section "Runtime")

Both rules still multiply the capacity, so `append` costs O(1) amortised under either, by the argument from the first Chapter. The change is about how smoothly memory use rises, not about that bound.

## Your numbers will not match real Go

`nextslicecap` is not the last word. `growslice` then rounds the memory it asks for up to a size the allocator hands out, with a call to `roundupsize`, and works the capacity back out from that. ([src/runtime/slice.go, lines 178 to 199](https://github.com/golang/go/blob/go1.22.0/src/runtime/slice.go#L176-L200)) The commit message quoted above notes the same thing: "the real growth factor, both before and now, is somewhat larger because we round up to the next size class."

So `cap()` in a real Go program can print a larger number than the formula gives. The Build implements the formula alone.
