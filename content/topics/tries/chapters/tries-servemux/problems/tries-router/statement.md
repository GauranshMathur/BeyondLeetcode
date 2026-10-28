Go's `ServeMux` is a trie whose keys are the segments of a path. Add a router that matches paths to patterns, and that backs up when a literal segment leads nowhere. The source for each claim is in [Go ServeMux: a tree of path segments](/chapters/tries-servemux).

A **path** starts with `/` and has segments separated by `/`: `/a/b/c` has the segments `a`, `b`, `c`. The path `/` has no segments. A segment is 1 to 10 lowercase letters or digits. A **pattern** is written like a path, except that a segment may be a wildcard `{name}` instead (`name` is 1 to 10 lowercase letters). A wildcard matches exactly one segment, never zero and never two.

New commands:

| Command | What it does | Prints |
|---|---|---|
| `handle PATTERN VALUE` | Registers `PATTERN` with the word `VALUE`. If a pattern of the same **shape** is already registered, nothing changes. | `conflict` in that case, otherwise nothing |
| `serve PATH` | Finds the pattern for `PATH` by the rule below. | the pattern's `VALUE`, then a space and `name=segment` for each wildcard of the pattern in order, all separated by single spaces; or `404` if no pattern matches |

Two patterns have the same shape when they have the same number of segments, the same literal at every position that is not a wildcard, and wildcards at the same positions. The wildcard names do not matter: `/users/{id}` and `/users/{name}` have the same shape.

**The rule.** A pattern matches a path if it has the same number of segments and every literal segment is equal to the path's segment there. If several patterns match, the one that has a literal where another has a wildcard at the first position where they differ wins. Try it as a search: at each segment, first follow the literal child, and only if that does not lead to a match, go back and follow the wildcard child.

Go's `ServeMux` refuses a pair such as `/a/{x}` and `/{y}/b`, because neither is more specific. This Problem registers both and lets the rule above choose. The route table of Problem 3 and the keys of earlier Problems are separate from this router. There are at most 2,000 commands.

## Example

Input:

```
handle /a/b/z first
handle /a/{x}/c second
serve /a/b/c
serve /a/b/z
serve /a/q/c
serve /a/b
```

Output:

```
second x=b
first
second x=q
404
```

For `/a/b/c` the literal `b` is tried first and leads to `/a/b/z`, which ends in `z`, not `c`. The search goes back and takes the wildcard, which matches `b` and then `c`. `/a/b` is too short for either pattern.
