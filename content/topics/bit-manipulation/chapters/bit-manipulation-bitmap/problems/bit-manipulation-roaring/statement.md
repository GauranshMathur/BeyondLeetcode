An **Extra Problem**: it branches off after `weight` and does not affect completing the Topic.

# Which container

Roaring splits a bitmap into containers of 65,536 consecutive numbers and stores each one as an array of its numbers if it has at most 4096 of them, and as a bitmap if it has more. This Problem asks which container each block would get.

Add to the Build:

| Command | What it does | Prints |
|---|---|---|
| `roaring` | Cuts the flags into blocks of 65,536: block 0 is flags 0 to 65535, block 1 is flags 65536 to 131071, and so on. For each block that has at least one flag on, in order of block number, writes `key:cardinality:kind`, where `key` is the block number, `cardinality` is how many of its flags are on, and `kind` is `array` if the cardinality is at most 4096 and `bitset` if it is more. Blocks with no flag on are left out. | the entries, separated by single spaces; an empty line if no flag is on |

Roaring also has a third kind, `run`, for long stretches of consecutive numbers. This Problem does not use it. A block is 2048 words, and a sequence that ends inside a block is read as if the missing words were 0.

## Example

Input:

```
set 5
set 65536
set 65537
roaring
```

Output:

```
0:1:array 1:2:array
```

Flag 5 is in block 0. Flags 65536 and 65537 are the first two of block 1.
