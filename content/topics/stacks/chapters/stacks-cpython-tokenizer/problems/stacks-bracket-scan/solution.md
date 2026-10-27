One pass, one stack. Keep the line number as you go and push `(bracket, line)` for every opening bracket. For a closing bracket, an empty stack is the "unmatched" case, and otherwise you pop and compare.

Pop before you compare. CPython takes the entry off the stack and then checks it, so the entry is gone whichever way the check goes; it does not matter here because the scan stops at the first error, but it is why the message can name the popped bracket's line.

The order of the checks matters in one place. The depth check runs on an opening bracket before the push, so 200 open brackets are fine and the 201st is the error. A source with 200 `(` and then 200 `)` is `ok`.

An unclosed bracket can only be found at the end, and it is the top of the stack: the innermost bracket still open, not the first one that was opened. `[(` reports `'(' was never closed`.

Complexity. O(n) time in the **worst case** for n characters: each character is looked at once, and each push and pop is O(1). The stack never holds more than 200 entries, so the extra space is O(1). Without the limit the stack would hold up to n entries.
