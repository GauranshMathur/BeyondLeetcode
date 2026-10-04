The Build for this Topic is a growable list of integers. You start from an empty file.

Keep the items in a **block**: a run of slots whose size you choose when you make it and never change afterwards. In Python, make a block with `[0] * size`; in TypeScript, `new Array<number>(size).fill(0)`; in Go, `make([]int, size)`. Do not use `append`, `push` or Go's `append` on the block: growing is the thing you are building.

Keep two numbers: the **length** (slots in use) and the **capacity** (the size of the block). Start with a block of capacity 0.

Your program reads commands from standard input, one per line, until the input ends. Skip empty lines.

| Command | What it does | Prints |
|---|---|---|
| `append X` | Adds the integer `X` at the end. If the block is full, first make a block twice the size (size 1 if the capacity is 0) and copy the items across. | nothing |
| `get I` | Reads the item at index `I`, counting from 0. | the item, or `error` if `I` is below 0 or not below the length |
| `len` | Reads the length. | the length |

Every value of `X` fits between -1,000,000,000 and 1,000,000,000.

## Example

Input:

```
append 7
append 9
len
get 0
get 5
```

Output:

```
2
7
error
```
