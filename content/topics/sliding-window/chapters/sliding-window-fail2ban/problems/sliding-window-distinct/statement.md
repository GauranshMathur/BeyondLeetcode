# The longest stretch with no repeat

In a window where no host appears twice, fail2ban would count at most 1 for every host. This Problem asks for the longest such stretch of the log. The window now grows and shrinks by itself, as in the TCP Chapter, but what decides when it shrinks is a map of what it holds.

Add:

| Command | What it does | Prints |
|---|---|---|
| `distinct` | Looks at every **run**: one or more consecutive items. A run is **distinct** if no value appears in it more than once. | the greatest number of items in a distinct run; `0` if the sequence is empty |

Items may be any integers. The sequence does not change.

## Example

Input:

```
load 4 8 8 1 4 2 8 3
distinct
```

Output:

```
5
```

The run `1 4 2 8 3` is distinct and has five items. `4 8` is distinct but the next item, another 8, repeats it. `8 1 4 2` has four items, and adding the next item, another 8, breaks it. No run of six items is distinct.
