# Greatest common divisor

Port the kernel's `gcd`, which uses shifts and subtractions and no division.

| Command | What it does | Prints |
|---|---|---|
| `gcd A B` | Finds the greatest common divisor of `A` and `B`. | the greatest common divisor |

`A` and `B` are whole numbers from 0 to 1,000,000,000,000,000,000 (10^18). The greatest common divisor of any number and 0 is that number, and of 0 and 0 it is 0.

The Tests include numbers for which taking away the smaller number one at a time would never finish. The loop in the Chapter does at most about 128 passes for any numbers of this size.

## Example

Input:

```
gcd 12 18
gcd 17 5
gcd 0 9
gcd 0 0
```

Output:

```
6
1
9
0
```
