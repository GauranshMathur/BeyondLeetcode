Reduce after every multiplication, because the remainder of a product depends only on the remainders of its factors: (a x b) mod m equals ((a mod m) x (b mod m)) mod m. The loop is the same as in `pow64`:

```
result = 1 mod M
base = B mod M
while E is not 0:
    if E is odd: result = result * base mod M
    E = E / 2
    base = base * base mod M
```

Both numbers that are multiplied are below `M`, so a product is below `M` squared, which is below 2^62 and fits in a 64-bit signed integer. That is why the Problem caps `M` at 2^31 - 1. The Python and TypeScript Reference Code have no such limit, but the Tests keep to it so that all three Languages agree.

Two Tests are worth running by hand. With the prime `M` = 2,147,483,647, Fermat's little theorem says that `B` to the power `M - 1` is 1 for any `B` that `M` does not divide, and the Tests include `powmod 5 2147483646 2147483647`. With `M` = 1 everything is 0.

Cost: one pass for each bit of `E`, at most 60 here, each pass with at most two multiplications and two remainders. That is O(log E) multiplications in the worst case. Extra space is O(1).
