Redis reads the channels of a slot by prefix. A search box wants something else from the same prefix: only the best few keys. Use the value stored with each key as its score, and answer for a prefix with the keys that score highest. The source for each claim is in [Redis Cluster: listing by prefix](/chapters/tries-redis-slots).

New command:

| Command | What it does | Prints |
|---|---|---|
| `top PREFIX K` | Among the stored keys that start with `PREFIX`, finds the `K` with the highest value. A higher value comes first, and two keys with the same value go in ascending order, as in `list`. If fewer than `K` keys start with `PREFIX`, all of them are used. | the keys, separated by single spaces, on one line, or `none` if there are none (this includes `K` equal to 0) |

`PREFIX` is 1 to 20 characters, letters and digits (it is never empty here). `K` is an integer from 0 to 100. A key's score is the value from its last `add`.

There are at most 2,000 commands.

## Example

Input:

```
add car 5
add cat 9
add cab 5
add cow 9
add dog 1
top ca 2
top c 10
top d 1
top z 3
```

Output:

```
cat cab
cat cow cab car
dog
none
```

Under `ca` the scores are `car` 5, `cat` 9 and `cab` 5. The best is `cat`, and `cab` beats `car` because they tie and `cab` comes first in ascending order. `top c 10` asks for more keys than exist, so all four are printed.
