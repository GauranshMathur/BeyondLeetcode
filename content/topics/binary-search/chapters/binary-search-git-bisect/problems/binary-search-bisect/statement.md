Add a search where there is no array: only a test you can run. Keep every earlier command working.

`git bisect` looks for the first commit of a history that has a bug. Picture a straight history of commits numbered 1 to `N`, oldest first, where commit `N` is known to be bad. The bug appeared in commit `B`: every commit from `B` on is bad and every commit before `B` is good. You do not know `B`. All you can do is test one commit at a time and learn whether it is bad.

| Command | What it does | Prints |
|---|---|---|
| `bisect N B` | Runs the search below on a history of `N` commits whose first bad commit is `B`, with `1 <= B <= N` and `1 <= N <= 2,147,483,647`. | `F T`: the first bad commit the search finds and how many tests it ran, on one line separated by a space |

The search keeps a range `low..high` with the first bad commit somewhere in it, starting at `low = 1` and `high = N`. Commit `N` is already known to be bad, so it is never tested. While `low < high`:

1. Let `m` be the average of `low` and `high`, rounded down.
2. Run one test on commit `m`. It says bad when `m >= B`.
3. If it says bad, set `high = m`. Otherwise set `low = m + 1`.

When `low == high` that commit is `F`, and `T` is the number of tests that were run. The program does not know `B` while it searches: only the test sees it.

## Example

Input:

```
bisect 10 7
```

Output:

```
7 4
```

The range starts at 1..10. Testing 5 says good, so the range is 6..10. Testing 8 says bad: 6..8. Testing 7 says bad: 6..7. Testing 6 says good: 7..7. That is four tests and the answer 7.
