Build the tree that Redis's rax starts from: a trie that holds a set of keys, one character per level, with an integer value for each key.

The program reads commands from standard input, one per line, and prints what each command says it prints. A line with no command is empty and is ignored. A key is 1 to 20 characters, each a lowercase letter or a digit. A value is an integer from 0 to 1,000,000,000. There are at most 2,000 commands.

| Command | What it does | Prints |
|---|---|---|
| `add KEY VALUE` | Stores `VALUE` under `KEY`. If `KEY` is already stored, its value is replaced. | nothing |
| `get KEY` | Reads the value stored under `KEY`. | the value, or `none` if `KEY` is not stored |
| `del KEY` | Removes `KEY`. | `1` if `KEY` was stored, `0` if it was not |
| `size` | Counts the stored keys. | the count |
| `nodes` | Counts the nodes of the tree, the root included. | the count |

The tree has one node for the empty string, the root, and one node for every other prefix of a stored key. It has no other nodes. A prefix of a key is not a key unless it was added: after `add ab 1`, the command `get a` prints `none`.

`del` cuts every node that no longer leads to a stored key, so `nodes` counts the root and the prefixes of the keys that are still stored. Removing a key that is a prefix of another stored key keeps its node, because the longer key still goes through it.

## Example

Input:

```
add foo 1
add foobar 2
add footer 3
nodes
get foo
get fo
del foo
get foo
get foobar
nodes
```

Output:

```
10
1
none
1
none
2
10
```

The three keys make 10 nodes: the root, then `f`, `fo`, `foo`, `foot`, `foote`, `footer`, `foob`, `fooba` and `foobar`. `fo` is a prefix, not a key. After `del foo` the node `foo` stays, because `foot` and `foob` hang below it.
