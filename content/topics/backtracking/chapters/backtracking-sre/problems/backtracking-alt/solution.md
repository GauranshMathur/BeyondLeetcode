First split the pattern into steps. A run of letters outside a group is one step with a single option, the run itself. A group is one step whose options are its alternatives, and it is the only kind of step that shows up in the answer.

Then search with a function `go(step, pos)`, which answers whether steps `step` onward match the text from `pos` to its end:

1. if `step` is past the last step, answer whether `pos` is the end of the text;
2. for each option of the step in order, if the text at `pos` starts with the option: if the step is a group, add the option's index to `chosen` (**choose**); call `go(step + 1, pos + length of the option)` (**explore**); if it answered yes, answer yes at once; otherwise, if the step is a group, remove the last index from `chosen` (**undo**);
3. when no option is left, answer no.

Print `yes` and `chosen` if `go(0, 0)` said yes, and `no` otherwise.

**Why it is right.** The options are tried in the order written, and the first call that answers yes returns at once, so the answer is the first complete way in left-to-right order. The undo keeps `chosen` equal to the path from the first step to the current one, so when `go` answers yes `chosen` holds exactly the alternatives of that way. A prefix match is rejected by step 1.

**Cost.** With n groups of at most k alternatives each there are at most k^n paths, so the search is exponential in the **worst case**, and each path compares at most as many letters as the pattern has. Space is O(S) for S steps, the depth of the recursion, plus the `chosen` list. The Chapter after this one shows how to cut the exponential.

The Reference Code keeps `parse` as its own function, because the next Problem searches the same steps.
