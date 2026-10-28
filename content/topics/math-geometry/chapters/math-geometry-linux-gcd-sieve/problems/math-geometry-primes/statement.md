# Next prime from a sieve

Rebuild the kernel's table of primes, so that the Build can answer "which is the next prime?" and report how big the table is.

| Command | What it does | Prints |
|---|---|---|
| `nextprime X` | Finds the smallest prime greater than `X`, growing the table first if the rule below says so. | the prime |
| `sieve` | Reads the table's state. | its size `sz` and its `last` prime, separated by one space |

The table has a **size** `sz` and a largest prime `last`: the table says, for each whole number below `sz`, whether it is prime, and `last` is the largest prime below `sz`. At the start `sz` is 64 and `last` is 61.

For `nextprime X`: while `X` is at least `last`, build a new table. Its size is `2 * X` rounded up to the next multiple of 64 (or `2 * X` itself if it already is one), found with a sieve of Eratosthenes over the numbers below that size, and `last` becomes the largest prime below the new size. Then answer from the table: the smallest prime greater than `X`. The rule is written for this Problem; it follows the Chapter's account of the kernel's `next_prime_number`.

`X` is a whole number from 0 to 1,000,000. The answer is always inside the table, because the rule leaves the table with `last` greater than `X`.

## Example

Input:

```
sieve
nextprime 0
nextprime 2
nextprime 61
sieve
```

Output:

```
64 61
2
3
67
128 127
```

`nextprime 61` is at least `last`, so the table grows to size `2 * 61 = 122`, rounded up to 128. The largest prime below 128 is 127. The next prime after 61 is 67.
