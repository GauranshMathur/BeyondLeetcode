The string hash is a loop over the characters, `h = h * 31 + c`, kept in 32 bits. The formula in the statement is that loop written out. Keep `h` as an unsigned 32-bit number everywhere, and the spread and the bin come out right for negative hashes without special cases. Only `hashcode` converts it to a signed number for printing.

Integer keys use their value, as before, so the chains in one table can mix integers and strings. Two keys are the same only if both are integers and equal, or both are strings and equal.

Hashing a string costs O(n) in its length; Java caches the value in the string, which this Build does not.
