Redis Cluster keeps its shard channels in a trie under a two-byte slot prefix, and finds the channels of one slot by seeking to the prefix and reading forward. Add the same question to the Build: which stored keys start with this prefix? The source for each claim is in [Redis Cluster: listing by prefix](/chapters/tries-redis-slots).

New commands:

| Command | What it does | Prints |
|---|---|---|
| `list PREFIX` | Finds every stored key that starts with `PREFIX`, `PREFIX` itself included if it is a key. | the keys in ascending order, separated by single spaces, on one line, or `none` if there are no such keys |
| `count PREFIX` | Counts the same keys. | the count |

`PREFIX` is 1 to 20 characters, letters and digits. It can also be left out, with the command alone on its line (`list` or `count`): the prefix is then the empty string and every stored key matches.

**The order.** Keys are compared character by character, with the digits before the letters (`0` to `9`, then `a` to `z`). If one key is a prefix of the other, the shorter one comes first: `ab` comes before `abc`.

These commands read the keys stored by `add` and `del` from the earlier Problems. There are at most 2,000 commands.

## Example

Input:

```
add 07sport 1
add 07news 1
add 12news 1
add 07 1
list 07
count 07
count 99
list 99
```

Output:

```
07 07news 07sport
3
0
none
```

The key `07` starts with the prefix `07`, so it is listed, and it comes before the longer keys. `12news` does not start with it.
