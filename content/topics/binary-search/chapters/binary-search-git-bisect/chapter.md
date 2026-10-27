# git bisect: searching for the answer

The last two Chapters searched a list that already existed in memory. Sometimes there is no list, only a question you can ask, and each answer is expensive. This Chapter reads Git 2.45.0's `git bisect`, which searches a project's history for the commit that broke something, and the decision it makes about where to look next.

## There is no array

The manual page says it plainly: "This command uses a binary search algorithm to find which commit in your project's history introduced a bug." You give it a "bad" commit that has the bug and a "good" one from before it, and `git bisect` "picks a commit between those two endpoints and asks you whether the selected commit is 'good' or 'bad'. It continues narrowing down the range until it finds the exact commit that introduced the change." ([Documentation/git-bisect.txt, lines 32 to 39, v2.45.0](https://github.com/git/git/blob/786a3e4b8d754d2b14b1208b98eeb0a554ef19a8/Documentation/git-bisect.txt#L32-L39))

Nothing here is sorted, and no array is built. The "item" at a position is a commit, the "comparison" is you running a test, and the test can take minutes. The manual adds that it "can be used to find the commit that changed *any* property of your project; e.g., the commit that fixed a bug, or the commit that caused a benchmark's performance to improve". ([lines 41 to 46](https://github.com/git/git/blob/786a3e4b8d754d2b14b1208b98eeb0a554ef19a8/Documentation/git-bisect.txt#L41-L46)) So what you search is the **answer to a yes/no test**, which flips from one result to the other at exactly one place, the same shape as Go's `sort.Search` in the last Chapter. Go's own doc example does this with no data at all: `sort.Search(100, func(i int) bool { ... })` asks a person "Is your number <= i?" and returns the answer. ([src/sort/search.go, lines 46 to 57, Go 1.22.0](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/sort/search.go#L46-L57))

A longer article in Git's documentation tree describes the target the same way: a "first bad commit", with the aside that "there could be more than one" in a history. ([Documentation/git-bisect-lk2009.txt, lines 40 to 47, v2.45.0](https://github.com/git/git/blob/786a3e4b8d754d2b14b1208b98eeb0a554ef19a8/Documentation/git-bisect-lk2009.txt#L40-L47)) A binary search is only guaranteed to find one place where the test flips; your Build promises the clean case, where every commit from the first bad one onward is bad.

## The decision: pick the commit nearest the middle of what is left

On a straight line of commits the middle is easy. Git's history is not a line: merges give a commit two parents, so "halfway" means halfway in how many commits are still in play. The code that chooses is `best_bisection`:

```c
distance = weight(p);
if (nr - distance < distance)
	distance = nr - distance;
if (distance > best_distance) {
	best = p;
	best_distance = distance;
}
```

([bisect.c, lines 196 to 202, v2.45.0](https://github.com/git/git/blob/786a3e4b8d754d2b14b1208b98eeb0a554ef19a8/bisect.c#L196-L202))

Here `weight(p)` is "the number of interesting commits it can reach, including itself", and `nr` is the number of commits being considered. ([bisect.c, lines 265 to 267](https://github.com/git/git/blob/786a3e4b8d754d2b14b1208b98eeb0a554ef19a8/bisect.c#L265-L267)) In my reading, testing commit `p` splits the candidates into `weight` on one side and `nr - weight` on the other. The smaller of the two is what you are guaranteed to rule out whatever the test says, and Git takes the commit where that smaller number is largest. That is the "closest to half" rule, written as a maximum of a minimum. On a line of `nr` commits it picks a commit in the middle.

Git also does not always weigh every candidate. Once it has counted a commit that is close enough to halfway, it returns that commit at once ([bisect.c, lines 340 to 343](https://github.com/git/git/blob/786a3e4b8d754d2b14b1208b98eeb0a554ef19a8/bisect.c#L340-L343)), and the helper that decides, `approx_halfway`, says: "For large number of commits we are not so strict, it's good enough if it's within ~0.1% of the halfway point, e.g. 5000 is exactly halfway of 10000, but we consider the values [4996, 5004] as halfway as well." ([bisect.c, lines 127 to 132](https://github.com/git/git/blob/786a3e4b8d754d2b14b1208b98eeb0a554ef19a8/bisect.c#L127-L132)) A pick a few commits off the middle costs almost nothing, because the next test halves what remains anyway.

## Cost

Your Build uses the simplest version: commits numbered 1 to `N`, commit `N` known to be bad, and the middle taken as `(low + high) / 2` rounded down. The first bad commit is somewhere in `low..high`. Testing the middle commit `m` either finds it bad, so the answer is in `low..m`, or good, so the answer is in `m+1..high`. With `s` candidates the bigger side has `s / 2` rounded up, so a bisect of `N` commits needs at most `ceil(log2 N)` tests in the **worst case**. For a million commits that is 20 tests instead of up to a million. That count is for your Build's straight line, not a claim about Git's choice on a history full of merges.

## The same shape, with numbers

Once the "array" is only a test, you can search anything that has a test with one flip. Your second Problem is not from Git's code: a worker must drain several piles and may pick any whole rate, and the question "does rate `r` finish in time?" is true from some rate upward. Raising the rate never makes it take longer, and that one fact is all binary search needs. You will search the rate itself, between 1 and the biggest pile, and make one pass over the piles per test. The **worst-case** cost is about `n x log2(max pile)` for `n` piles.

The usual way to get this wrong is to check the boundary one step off: ask whether the rate before the answer works, or return the last rate that fails. Write down, before you code, what the test means at `low` and at `high`.
