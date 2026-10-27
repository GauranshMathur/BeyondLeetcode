# A stretch that covers a list of hosts

An **Extra Problem**: it branches off after `distinct` and does not affect completing the Topic.

You have a list of hosts that are suspected of working together, and you want the shortest stretch of the log in which every one of them failed. If a host is listed twice, it must have failed at least twice in the stretch. The window grows until it has everything it needs, then shrinks as far as it can while still having it. What it needs is kept in two maps.

Add:

| Command | What it does | Prints |
|---|---|---|
| `cover h1 h2 ...` | Looks at every **run**: one or more consecutive items. A run **covers** the list if every host appears in the run at least as many times as it appears in the list. | the smallest number of items in a run that covers the list; `0` if no run does |

The list has at least one host. Hosts may be any integers and may repeat in the list. The sequence does not change.

## Example

Input:

```
load 5 1 5 2 9 2 1 5 2
cover 1 2 5
```

Output:

```
3
```

The list needs one 1, one 2 and one 5. The run `2 1 5` (items 5 to 7) has all three, and so does `1 5 2` (items 6 to 8). No run of two items can hold three different hosts, so the answer is 3.
