# Who gets banned

fail2ban bans a host that fails `maxretry` times within the last `findtime` seconds. This Problem replays that rule on a log, exactly, without the estimate fail2ban makes. The rule below is written for this Problem; the Chapter says how fail2ban differs.

Here the sequence is a log: item `i` is the host (a number, any integer) that failed a login in second `i`. There is one failure per second.

Add:

| Command | What it does | Prints |
|---|---|---|
| `bans F M` | Replays the log with a window of the last `F` seconds and a limit of `M` failures. | the hosts that get banned, in the order they are banned, separated by single spaces; an empty line if none is banned |

`F` and `M` are at least 1. At second `i` the window is seconds `i - F + 1` to `i`, without any second before 0. A host is **banned** at the first second where, counting second `i`, it has failed `M` or more times inside the window. A banned host is printed once, however often it fails afterwards. The sequence does not change.

## Example

Input:

```
load 7 3 7 7 3 3 9 3 7 9 3
bans 4 3
```

Output:

```
7 3
```

At second 3 the window is `7 3 7 7`, where host 7 has failed three times, so 7 is banned. Host 3 fails at seconds 1, 4, 5, 7 and 10, but at second 5 the window is `7 7 3 3` with two failures, and at second 7 the window is `3 3 9 3` with three. So 3 is banned at second 7, after 7.
