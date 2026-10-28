# Math and geometry: sources

Research for the Topic `math-geometry` (card C122, issue #263). Every claim about a real system that the four Chapters make is listed below with its source. The Problems follow the same sources: the rules in each statement are the rules in the code or text quoted here, except where a statement says it is written for the Problem.

Pinned versions. Code links in the Chapters use the commit SHA, never a branch or a tag.

| Project | Tag | Commit |
|---|---|---|
| CPython | `v3.13.0` | `60403a5409ff2c3f3b07dd2ca91a7a3e096839c7` (annotated tag object `3f27099d916c7b885e3daf1fabedcc119462014d`) |
| Linux | `v6.6` | `ffc253263a1375a65fa6c9f62a893e9767fbebfa` (annotated tag object `5260836abb7056beed3f3f0d0e4262c11f36f0d0`) |
| NumPy | `v2.1.0` | `2f7fe64b8b6d7591dd208942f1cc74473d5db4cb` (annotated tag object `4d929bceec7a27be9fcaa0388fc9e496d329b496`) |
| Go | `go1.22.0` | `a10e42f219abb9c5bc4e7d86d9464700a42c7d57` (a lightweight tag: the tag is the commit) |
| Python documentation | 3.13 | `https://docs.python.org/3.13/library/stdtypes.html`, `.../sys.html` and `.../functions.html`. These are versioned by series, not by commit: the page can change in a later 3.13 patch release. |

The CPython and Linux pins are the ones already used in `hash-tables-sources` and `sliding-window-sources.md`. The Go specification is read from its source file, `doc/go_spec.html` in the Go repository at the pinned commit, not from go.dev, which shows the newest version.

Method. Every source file was fetched by the agent with `curl` from `raw.githubusercontent.com/<org>/<repo>/<sha>/<path>`, the Python documentation pages from `docs.python.org/3.13/`, and line numbers were read off the fetched files with `grep -n` and `sed -n`. Every quoted string in the Chapters was then checked by a script against the lines its link cites: the words appear, in that order, inside the range (whitespace normalised, comment markers dropped; HTML tags dropped and entities decoded for the Go specification and the Python documentation, and the reST emphasis markers around `N` dropped for the NumPy page). For the Python documentation pages the check is against the whole page, since there are no line numbers. Markup notes: the Go specification's text contains `<i>`, `<a>` and `<code>` tags and the `sys.int_info` page a `<code>` tag, all dropped from the quotes; one Go sentence (`computed modulo 2<sup>n</sup>`) puts the exponent in markup, so the Chapters paraphrase that part and quote only the plain words after it. The NumPy page quote drops the `*N*` emphasis markers. Source types: 1 = source code, 2 = official documentation, 3 = standard or original paper, 4 = a post by the system's own engineers. All entries below are type 1 or 2: the Go specification is the language's own documentation.


---

## Chapter 1: CPython: integers with no ceiling (`math-geometry-cpython-int`)

Systems: CPython 3.13.0 and Go 1.22.0.

| System | Decision | Permalink | Exact quote | Lines | Source type |
|---|---|---|---|---|---|
| Go | a signed integer is two's complement, n bits wide | [Go 1.22.0 specification, Numeric types, lines 873 to 876](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/doc/go_spec.html#L873-L876) | `The value of an n-bit integer is n bits wide and represented using two's complement arithmetic.` | lines 873 to 876 | 2 documentation |
| Go | the range of int32 | [Go 1.22.0 specification, Numeric types, line 861](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/doc/go_spec.html#L861) | `the set of all signed 32-bit integers (-2147483648 to 2147483647)` | line 861 | 2 documentation |
| Go | unsigned arithmetic wraps | [Go 1.22.0 specification, Integer overflow, lines 5003 to 5004](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/doc/go_spec.html#L5003-L5004) | `Loosely speaking, these unsigned integer operations discard high bits upon overflow, and programs may rely on "wrap around".` | lines 5003 to 5004 | 2 documentation |
| Go | signed overflow wraps and never panics | [Go 1.22.0 specification, Integer overflow, lines 5010 to 5012](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/doc/go_spec.html#L5010-L5012) | `exists and is deterministically defined by the signed integer representation, the operation, and its operands`; `Overflow does not cause a run-time panic.` | lines 5010 to 5012 | 2 documentation |
| CPython | an int has no ceiling | [Python 3.13, Built-in types, Numeric Types](https://docs.python.org/3.13/library/stdtypes.html#numeric-types-int-float-complex) | `Integers have unlimited precision.` | versioned page, no line numbers | 2 documentation |
| CPython | an int is stored as digits of a fixed number of bits | [Python 3.13, sys.int_info.bits_per_digit](https://docs.python.org/3.13/library/sys.html#sys.int_info.bits_per_digit) | `Python integers are stored internally in base 2**int_info.bits_per_digit.` | versioned page, no line numbers | 2 documentation |
| CPython | digit size | [Include/cpython/longintrepr.h, lines 66 to 67 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Include/cpython/longintrepr.h#L66-L67) | `Long integers are made up of a number of 30- or 15-bit digits, depending on the platform.` | lines 66 to 67 | 1 source code |
| CPython | digit type and shift | [Include/cpython/longintrepr.h, lines 43 to 47 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Include/cpython/longintrepr.h#L43-L47) | `typedef uint32_t digit;`; `#define PyLong_SHIFT 30` | lines 43 to 47 | 1 source code |
| CPython | how digits make a value | [Include/cpython/longintrepr.h, lines 70 to 71 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Include/cpython/longintrepr.h#L70-L71) | `The absolute value of a number is equal to SUM(for i=0 through ndigits-1) ob_digit[i] * 2**(PyLong_SHIFT*i)` | lines 70 to 71 | 1 source code |
| CPython | why 30 bits in a 32-bit digit | [Include/cpython/longintrepr.h, lines 17 to 19 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Include/cpython/longintrepr.h#L17-L19) | `Type 'digit' should be able to hold 2*PyLong_BASE-1, and type 'twodigits' should be an unsigned integer type able to hold all integers up to PyLong_BASE*PyLong_BASE-1.` | lines 17 to 19 | 1 source code |
| CPython | schoolbook multiplication | [Objects/longobject.c, lines 3826 to 3828 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/longobject.c#L3826-L3828) | `Grade school multiplication, ignoring the signs.` | lines 3826 to 3828 | 1 source code |
| CPython | the carry loop | [Objects/longobject.c, lines 3914 to 3916 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/longobject.c#L3914-L3916) | `carry += *pz + *pb++ * f;`; `*pz++ = (digit)(carry & PyLong_MASK);`; `carry >>= PyLong_SHIFT;` | lines 3914 to 3916 | 1 source code |
| CPython | the Karatsuba cutoff | [Objects/longobject.c, lines 69 to 73 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/longobject.c#L69-L73) | `For int multiplication, use the O(N**2) school algorithm unless both operands contain more than KARATSUBA_CUTOFF digits (this being an internal Python int digit, in base BASE).`; `#define KARATSUBA_CUTOFF 70` | lines 69 to 73 | 1 source code |
| CPython | what takes over past the cutoff | [Objects/longobject.c, lines 3964 to 3965 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/longobject.c#L3964-L3965) | `Karatsuba multiplication.` | lines 3964 to 3965 | 1 source code |

---

## Chapter 2: Linux: raising to a power in a loop of squares (`math-geometry-linux-int-pow`)

Systems: Linux v6.6 and CPython 3.13.0.

| System | Decision | Permalink | Exact quote | Lines | Source type |
|---|---|---|---|---|---|
| Linux | the file's header | [lib/math/int_pow.c, lines 3 to 5 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/int_pow.c#L3-L5) | `An integer based power function`; `Derived from drivers/video/backlight/pwm_bl.c` | lines 3 to 5 | 1 source code |
| Linux | what int_pow computes | [lib/math/int_pow.c, line 17 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/int_pow.c#L17) | `Computes: pow(base, exp), i.e. @base raised to the @exp power` | line 17 | 1 source code |
| Linux | the loop | [lib/math/int_pow.c, lines 19 to 31 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/int_pow.c#L19-L31) | `u64 int_pow(u64 base, unsigned int exp)`; `u64 result = 1;`; `while (exp) {`; `if (exp & 1)`; `result *= base;`; `exp >>= 1;`; `base *= base;`; `return result;` | lines 19 to 31 | 1 source code |
| Go | uint64 arithmetic is modulo 2^64 | [Go 1.22.0 specification, Integer overflow, lines 4999 to 5002](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/doc/go_spec.html#L4999-L5002) | `where n is the bit width of the unsigned integer's type` | lines 4999 to 5002 | 2 documentation |
| CPython | three-argument pow | [Python 3.13, Built-in Functions, pow](https://docs.python.org/3.13/library/functions.html#pow) | `Return base to the power exp; if mod is present, return base to the power exp, modulo mod (computed more efficiently than pow(base, exp) % mod).` | versioned page, no line numbers | 2 documentation |
| CPython | the method | [Objects/longobject.c, line 5051 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/longobject.c#L5051) | `Left-to-right binary exponentiation (HAC Algorithm 14.79)` | line 5051 | 1 source code |
| CPython | the loop | [Objects/longobject.c, lines 5069 to 5072 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/longobject.c#L5069-L5072) | `MULT(z, z, z);`; `if (bi & bit) {`; `MULT(z, a, z);` | lines 5069 to 5072 | 1 source code |
| CPython | reduce after every multiplication | [Objects/longobject.c, lines 5017 to 5018 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/longobject.c#L5017-L5018) | `Multiply two values, then reduce the result: result = X*Y % c. If c is NULL, skip the mod.` | lines 5017 to 5018 | 1 source code |
| CPython | no wasted last square | [Objects/longobject.c, line 5058 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/longobject.c#L5058) | `Py_SETREF(z, (PyLongObject*)Py_NewRef(a));` | line 5058 | 1 source code |
| CPython | the k-ary window method | [Objects/longobject.c, line 78 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/longobject.c#L78) | `(no more than) EXP_WINDOW_SIZE bits at a time` | line 78 | 1 source code |
| CPython | where the window method starts | [Objects/longobject.c, line 103 (CPython 3.13.0)](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Objects/longobject.c#L103) | `#define HUGE_EXP_CUTOFF 60` | line 103 | 1 source code |

---

## Chapter 3: NumPy: one block, many views (`math-geometry-numpy-strides`)

Systems: NumPy 2.1.0.

| System | Decision | Permalink | Exact quote | Lines | Source type |
|---|---|---|---|---|---|
| NumPy | one block, many layouts | [doc/source/reference/arrays.ndarray.rst, lines 109 to 111 (NumPy 2.1.0)](https://github.com/numpy/numpy/blob/2f7fe64b8b6d7591dd208942f1cc74473d5db4cb/doc/source/reference/arrays.ndarray.rst#L109-L111) | `A segment of memory is inherently 1-dimensional, and there are many different schemes for arranging the items of an N-dimensional array in a 1-dimensional block.` | lines 109 to 111 | 2 documentation |
| NumPy | the definition of strides | [numpy/_core/_add_newdocs.py, line 2877 (NumPy 2.1.0)](https://github.com/numpy/numpy/blob/2f7fe64b8b6d7591dd208942f1cc74473d5db4cb/numpy/_core/_add_newdocs.py#L2877) | `Tuple of bytes to step in each dimension when traversing an array.` | line 2877 | 1 source code |
| NumPy | the offset formula | [numpy/_core/_add_newdocs.py, lines 2879 to 2882 (NumPy 2.1.0)](https://github.com/numpy/numpy/blob/2f7fe64b8b6d7591dd208942f1cc74473d5db4cb/numpy/_core/_add_newdocs.py#L2879-L2882) | `offset = sum(np.array(i) * a.strides)` | lines 2879 to 2882 | 1 source code |
| NumPy | transpose is a view | [numpy/_core/fromnumeric.py, line 664 (NumPy 2.1.0)](https://github.com/numpy/numpy/blob/2f7fe64b8b6d7591dd208942f1cc74473d5db4cb/numpy/_core/fromnumeric.py#L664) | `A view is returned whenever possible.` | line 664 | 1 source code |
| NumPy | how flip is written | [numpy/lib/_function_base_impl.py, lines 341 to 343 (NumPy 2.1.0)](https://github.com/numpy/numpy/blob/2f7fe64b8b6d7591dd208942f1cc74473d5db4cb/numpy/lib/_function_base_impl.py#L341-L343) | `indexer[ax] = np.s_[::-1]`; `return m[indexer]` | lines 341 to 343 | 1 source code |
| NumPy | flip's cost | [numpy/lib/_function_base_impl.py, lines 277 to 278 (NumPy 2.1.0)](https://github.com/numpy/numpy/blob/2f7fe64b8b6d7591dd208942f1cc74473d5db4cb/numpy/lib/_function_base_impl.py#L277-L278) | `Since a view is returned, this operation is done in constant time.` | lines 277 to 278 | 1 source code |
| NumPy | what rot90 does | [numpy/lib/_function_base_impl.py, line 156 (NumPy 2.1.0)](https://github.com/numpy/numpy/blob/2f7fe64b8b6d7591dd208942f1cc74473d5db4cb/numpy/lib/_function_base_impl.py#L156) | `Rotate an array by 90 degrees in the plane specified by axes.` | line 156 | 1 source code |
| NumPy | rot90's direction | [numpy/lib/_function_base_impl.py, lines 159 to 160 (NumPy 2.1.0)](https://github.com/numpy/numpy/blob/2f7fe64b8b6d7591dd208942f1cc74473d5db4cb/numpy/lib/_function_base_impl.py#L159-L160) | `the rotation will be counterclockwise.` | lines 159 to 160 | 1 source code |
| NumPy | rot90 is two views | [numpy/lib/_function_base_impl.py, lines 239 to 243 (NumPy 2.1.0)](https://github.com/numpy/numpy/blob/2f7fe64b8b6d7591dd208942f1cc74473d5db4cb/numpy/lib/_function_base_impl.py#L239-L243) | `if k == 1:`; `return transpose(flip(m, axes[1]), axes_list)`; `else:`; `# k == 3`; `return flip(transpose(m, axes_list), axes[1])` | lines 239 to 243 | 1 source code |
| NumPy | the price of a view | [doc/source/reference/arrays.ndarray.rst, lines 182 to 184 (NumPy 2.1.0)](https://github.com/numpy/numpy/blob/2f7fe64b8b6d7591dd208942f1cc74473d5db4cb/doc/source/reference/arrays.ndarray.rst#L182-L184) | `When an irregularly strided array is passed in to such algorithms, a copy is automatically made.` | lines 182 to 184 | 2 documentation |

---

## Chapter 4: Linux: a gcd made of shifts, and a sieve that grows (`math-geometry-linux-gcd-sieve`)

Systems: Linux v6.6.

| System | Decision | Permalink | Exact quote | Lines | Source type |
|---|---|---|---|---|---|
| Linux | the method | [lib/math/gcd.c, lines 7 to 8 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/gcd.c#L7-L8) | `This implements the binary GCD algorithm. (Often attributed to Stein, but as Knuth has noted, appears in a first-century Chinese math text.)` | lines 7 to 8 | 1 source code |
| Linux | why | [lib/math/gcd.c, lines 10 to 11 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/gcd.c#L10-L11) | `This is faster than the division-based algorithm even on x86, which has decent hardware division.` | lines 10 to 11 | 1 source code |
| Linux | the code | [lib/math/gcd.c, lines 23 to 45 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/gcd.c#L23-L45) | `unsigned long gcd(unsigned long a, unsigned long b)`; `unsigned long r = a \| b;`; `if (!a \|\| !b)`; `return r;`; `b >>= __ffs(b);`; `if (b == 1)`; `return r & -r;`; `for (;;) {`; `a >>= __ffs(a);`; `if (a == 1)`; `if (a == b)`; `return a << __ffs(r);`; `if (a < b)`; `swap(a, b);`; `a -= b;` | lines 23 to 45 | 1 source code |
| Linux | why `gcd` checks for 0 first | [include/asm-generic/bitops/__ffs.h, lines 8 to 11 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/include/asm-generic/bitops/__ffs.h#L8-L11) | `__ffs - find first bit in word.`; `Undefined if no bit exists, so code should check against 0 first.` | lines 8 to 11 | 1 source code |
| Linux | the table | [lib/math/prime_numbers.c, lines 11 to 15 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/prime_numbers.c#L11-L15) | `unsigned long last, sz;`; `unsigned long primes[];` | lines 11 to 15 | 1 source code |
| Linux | the start | [lib/math/prime_numbers.c, lines 19 to 20 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/prime_numbers.c#L19-L20) | `.last = 61`; `.sz = 64` | lines 19 to 20 | 1 source code |
| Linux | how | [lib/math/prime_numbers.c, lines 140 to 143 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/prime_numbers.c#L140-L143) | `Where memory permits, track the primes using the Sieve of Eratosthenes. The sieve is to remove all multiples of known primes from the set, what remains in the set is therefore prime.` | lines 140 to 143 | 1 source code |
| Linux | the crossing out | [lib/math/prime_numbers.c, lines 97 to 104 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/prime_numbers.c#L97-L104) | `m += x;` | lines 97 to 104 | 1 source code |
| Linux | when the table grows | [lib/math/prime_numbers.c, lines 194 to 202 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/prime_numbers.c#L194-L202) | `while (x >= p->last)` | lines 194 to 202 | 1 source code |
| Linux | why 2x | [lib/math/prime_numbers.c, lines 117 to 118 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/prime_numbers.c#L117-L118) | `Equivalently, if n > 1, then there is always at least one prime p such that n < p < 2n.` | lines 117 to 118 | 1 source code |
| Linux | the size | [lib/math/prime_numbers.c, lines 123 to 127 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/prime_numbers.c#L123-L127) | `sz = 2 * x;`; `sz = round_up(sz, BITS_PER_LONG);` | lines 123 to 127 | 1 source code |
| Linux | the lookup | [lib/math/prime_numbers.c, line 203 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/prime_numbers.c#L203) | `x = find_next_bit(p->primes, p->last, x + 1);` | line 203 | 1 source code |
| Linux | the rebuild reuses the old table | [lib/math/prime_numbers.c, lines 144 to 147 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/prime_numbers.c#L144-L147) | `bitmap_copy(new->primes, p->primes, p->sz);` | lines 144 to 147 | 1 source code |
| Linux | memory | [lib/math/prime_numbers.c, lines 128 to 131 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/prime_numbers.c#L128-L131) | `if (!new)`; `return false;` | lines 128 to 131 | 1 source code |
| Linux | the fallback | [lib/math/prime_numbers.c, lines 197 to 198 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/prime_numbers.c#L197-L198) | `if (!expand_to_next_prime(x))`; `return slow_next_prime_number(x);` | lines 197 to 198 | 1 source code |
| Linux | the fallback's cost | [lib/math/prime_numbers.c, lines 71 to 77 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/prime_numbers.c#L71-L77) | `unsigned long y = int_sqrt(x);`; `if ((x % y) == 0)`; `y--` | lines 71 to 77 | 1 source code |
| Linux | the Extra Problem's code | [lib/math/lcm.c, lines 8 to 13 (Linux v6.6)](https://github.com/torvalds/linux/blob/ffc253263a1375a65fa6c9f62a893e9767fbebfa/lib/math/lcm.c#L8-L13) | (no quote: the line range is the code read) | lines 8 to 13 | 1 source code |

---

## Observed, not cited

- **The oracle.** The expected output of every Test comes from a second implementation that uses other techniques than the Reference Code: Python's built-in `pow` and `math.gcd` and `math.lcm`, `ctypes.c_int32` for the 32-bit wrap, a matrix model that keeps a list of block positions for the view and uses `zip` for the turns, a peeling loop for the spiral, and trial division for the primes. The Reference Code in Python (3.14 on the host), TypeScript (Bun) and Go (the Sandbox Go image) was run on every Test in its Submit scope before the content check.
- **The table rule for `nextprime`.** The Problem's rule (rebuild while `X >= last`, to `2 * X` rounded up to a multiple of 64) was simulated for every `X` from 61 (the first value that rebuilds from the starting table) to 1,000,000, each time building the table the rule gives and finding its largest prime: that prime was always above `X` and always above half the table's size. The second fact is what makes the next rebuild ask for more bits than the table has, so the table never shrinks, and the first is why the lookup always finds a prime. This is a measurement on this Problem's range, not a claim about the kernel for all inputs.
- **The Extra Problem `muls`.** Its counting rules are written for the Problem, from the loops quoted in Chapter 2. They are not a measurement of CPython: CPython special-cases small exponents (exponent 1 multiplies by 1 once), and the Chapter says "from exponent 2 up" where it compares the two counts.

## Leads that changed

- Chapter 1's lead was "fixed-width integers versus arbitrary precision in runtimes". The Chapter reads Go (fixed width, wraps) and CPython (arbitrary precision, 30-bit digits).
- Chapter 2's outline entry, "Modular arithmetic and fast exponentiation", had no system named. A search for a real implementation found the Linux kernel's `lib/math/int_pow.c` (exponentiation by squaring in 13 lines) and CPython's `long_pow` and the documentation of the three-argument `pow`.
- Chapter 3's outline entry, "Matrix manipulation in place", had no system named. NumPy's strides are the real decision about how a matrix is held and turned, but NumPy's `rot90` returns a view and does not move items, so the Chapter does not claim NumPy rotates in place. The in-place Problems are the two Extra Problems, written for the Build.
- Chapter 4's outline entry, "Number-theory helpers: gcd, primes, sieve", is two files of the Linux kernel's `lib/math` folder, `gcd.c` and `prime_numbers.c`, plus `lcm.c` for the Extra Problem. No outline entry was folded into another Chapter.

## Candidate Problems

- Multiply Strings: Core Problem `math-geometry-bigmul`.
- Pow(x, n): Core Problems `math-geometry-pow64` and `math-geometry-powmod`, for whole-number bases and exponents. A negative or fractional exponent is not in the Build: no system in the Chapter's reading frames it.
- Rotate Image: Core Problem `math-geometry-strides` (the `rotate` command, a view) and Extra Problem `math-geometry-spin` (the same turn done in the block, with no second block).
- Spiral Matrix: Core Problem `math-geometry-spiral`.
- Set Matrix Zeroes: Extra Problem `math-geometry-zero`.
- Happy Number: **not in this Topic.** It is a loop over the digits of a number that has to detect a cycle, and none of the four systems above frames it; it does not extend the Build either.

## Cut for lack of a source

No `[NEEDS SOURCE]` marker ships. These sentences were cut or rewritten while writing, because no primary source was found:

- That a C `u64` multiplication wraps modulo 2^64. The C standard's text could not be read in this session, so Chapter 2 says the Build fixes that rule and cites the Go specification for Go's `uint64`.
- Statements about JavaScript: that its numbers are doubles, or what `Math.imul` returns. The statements and Hints name `BigInt` only as a tool, and the TypeScript Reference Code's `| 0` and `Math.imul` are not explained as claims.
- That each integer operation is one machine instruction, and any statement of how large prime gaps get.
- That NumPy's `transpose` swaps two strides. The Chapter gives it as the Chapter's reading of the offset formula, and cites NumPy only for the outcome ("A view is returned whenever possible").
