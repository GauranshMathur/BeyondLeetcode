# Which drive did not answer

Picture an array of `n + 1` drives, numbered from 0, that are all asked to report in. The sequence holds the numbers of the `n` that did. Which one did not?

Add to the Build:

| Command | What it does | Prints |
|---|---|---|
| `missing` | The sequence has `n` words, all different, each from 0 to `n`, so exactly one number from 0 to `n` is not in it. Finds that number. The sequence does not change. | the missing number; `0` if the sequence is empty |

Words are in any order. The sequence is always as described when `missing` is used.

## Example

Input:

```
load 3 0 1
missing
```

Output:

```
2
```

The sequence has 3 words, so the numbers are 0 to 3. The words are 3, 0 and 1, and 2 is missing.
