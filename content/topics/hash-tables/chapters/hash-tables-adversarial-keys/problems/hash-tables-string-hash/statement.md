Let the Java-style table take string keys, and add the hash of a string.

A **key** token in a Java-style table is now either an integer, as before, or a **string**. A string starts with an ASCII letter and has only ASCII letters and digits, up to 200 characters. Everything else is an integer. Letter case matters, and a string is never equal to an integer. CPython-style tables still hold integers only.

The **hash** of a string `s` of `n` characters is `s[0]*31^(n-1) + s[1]*31^(n-2) + ... + s[n-1]`, with the characters as their ASCII codes, using 32-bit integer arithmetic: add and multiply in 32 bits, dropping the overflow. This is the formula from the Chapter. The hash of an integer key is still the integer.

| Command | What it does | Prints |
|---|---|---|
| `hashcode S` | Reads the hash of the string `S`. | the hash as a **signed** 32-bit integer, between -2,147,483,648 and 2,147,483,647 |

A hash can be negative, but the spread and the bin are computed on the same 32 bits read as an **unsigned** number: `spread = h ^ (h >> 16)` with the shift filling with zeros, and the bin is `spread & (N - 1)` as before. `bin`, `put`, `get`, `probes` and `dump` accept string keys in a Java-style table. `dump` prints a string key as it was given.

The tests do not mix string keys into a CPython-style table.

## Example

Input:

```
hashcode Aa
hashcode BB
hashcode a
hashcode hello
hashcode polygenelubricants
```

Output:

```
2112
2112
97
99162322
-2147483648
```

`Aa` is `65 * 31 + 97 = 2112`, and so is `BB` (`66 * 31 + 66`). The hash of `polygenelubricants` overflows to the smallest 32-bit integer. In the second test, `apple` and `cherry` end up in the same bin, bin 1, next to the integer key 17.

## Another example

Input:

```
impl java
put apple 1
put banana 2
put 17 3
put cherry 4
dump
bin apple
bin cherry
get banana
get 17
get fig
probes cherry
```

Output:

```
1
0
1
1
0: banana
1: apple 17 cherry
1
1
2
3
error
3
```
