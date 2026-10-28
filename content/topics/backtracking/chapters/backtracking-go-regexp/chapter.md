# Go: never enter the same state twice

Backtracking can repeat itself. Two different paths through the choices can arrive at the same situation, and if that situation led nowhere the first time, it leads nowhere the second time. Remembering that and cutting the search short there is **pruning**, and it can change the cost from exponential to linear. This Chapter reads how the `regexp` package of Go 1.22.0 does it, in one engine of that package, the one that backtracks. In the Problems you add the same memory to the matcher from the last Chapter and count what it saves.

## Go promises linear time

The package documentation makes a promise most regex libraries do not: "The regexp implementation provided by this package is guaranteed to run in time linear in the size of the input." ([src/regexp/regexp.go, lines 13 to 14](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/regexp/regexp.go#L13-L14)) It also says which match it finds: "it chooses the one that a backtracking search would have found first. This so-called leftmost-first matching is the same semantics that Perl, Python, and other implementations use, although this package implements it without the expense of backtracking." ([lines 129 to 132](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/regexp/regexp.go#L129-L132)) So the answer is the one the last Chapter's search would give, but Go does not always search the way that Chapter did.

## A backtracker for small ones

The package has more than one engine. One of them backtracks, and its file names the others and says when it is used: "backtrack is a fast replacement for the NFA code on small regexps when onepass cannot be used." ([src/regexp/backtrack.go, lines 12 to 13](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/regexp/backtrack.go#L12-L13)) The limits are constants: "maxBacktrackProg = 500" and "maxBacktrackVector = 256 * 1024", the second with the comment "bit vector size <= max (bits)". ([lines 32 to 33](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/regexp/backtrack.go#L32-L33)) The header comment gives the idea in three sentences: "backtrack is a regular expression search with submatch tracking for small regular expressions and texts. It allocates a bit vector with (length of input) * (length of prog) bits, to make sure it never explores the same (character position, instruction) state multiple times. This limits the search to run in time linear in the length of the test." ([lines 5 to 10](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/regexp/backtrack.go#L5-L10))

## Choices on a stack

This backtracker keeps its choices as data on a stack of jobs, with no recursive calls in the search loop (a reading of the file): "A job is an entry on the backtracker's job stack. It holds the instruction pc and the position in the input." ([lines 22 to 23](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/regexp/backtrack.go#L22-L23)) For an alternation it does not push both branches at once. The comment explains: "Instead, re-push inst with arg==true as a reminder to push inst.Arg out later." ([lines 177 to 179](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/regexp/backtrack.go#L177-L179)) The job on the stack is a reminder to come back and try the second branch, which is the choose and the undo of the last Chapter turned into data. State that a try overwrites is put back by the same means. A capture saves what it is about to replace: "Capture pos to register, but save old value" ([line 249](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/regexp/backtrack.go#L249)), and when the branch is finished, "Finished inst.Out; restore the old value." ([line 244](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/regexp/backtrack.go#L244))

## The visited set

The cut is one function:

```go
// shouldVisit reports whether the combination of (pc, pos) has not
// been visited yet.
func (b *bitState) shouldVisit(pc uint32, pos int) bool {
	n := uint(int(pc)*(b.end+1) + pos)
	if b.visited[n/visitedBits]&(1<<(n&(visitedBits-1))) != 0 {
		return false
	}
	b.visited[n/visitedBits] |= 1 << (n & (visitedBits - 1))
	return true
}
```

([lines 116 to 125](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/regexp/backtrack.go#L116-L125)) A state is a pair, the instruction `pc` and the input position `pos`. The function reports whether the pair has not been visited yet, and marks it as visited as it answers. The bits sit in one array, so the lookup is a shift and a mask. Counting is arithmetic: there are at most (number of instructions) times (positions) pairs, and each is entered at most once, so the search enters at most that many states, whatever the choices. The header says the same in its own words: linear in the length of the text.

Why is it safe to skip a state that is entered again? That is this Chapter's own reasoning, not a claim about Go: in a search that stops at its first success, a state that was entered before and is not on the stack any more has already failed. Going into it again can only fail again.

## What it costs

Without the set, a pattern of n groups with two alternatives each can have 2^n paths in the **worst case**. With it, the states are the pairs (step, position), at most (S + 1) x (n + 1) of them for S steps and a text of length n. Each state tries at most k alternatives (k is the most options in a step), and checking one against the text costs O(m), where m is the longest alternative. So the search is O(S x n x k x m) in the **worst case**, plus the set operations, which are O(1) in the **expected** case for a hash set (the Hash tables Topic explains why). The price is memory: one bit per pair in Go, one entry per visited pair in the Problems.

## What the Problems build

`cost` runs the search from the last Chapter twice on the same pattern and text. It counts how many states the plain search enters, and how many the search with a visited set enters. The count of states is the thing the visited set changes. The answer to `match` does not change.
