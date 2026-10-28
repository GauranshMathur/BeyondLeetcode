package main

import (
	"bufio"
	"fmt"
	"math/bits"
	"os"
	"strconv"
	"strings"
)

// bigMul is grade-school multiplication of two decimal strings, one digit per slice slot.
func bigMul(a, b string) string {
	x := digits(a) // least significant digit first
	y := digits(b)
	z := make([]int, len(x)+len(y))
	for i, f := range x {
		carry := 0
		for j, d := range y {
			carry += z[i+j] + d*f
			z[i+j] = carry % 10
			carry /= 10
		}
		z[i+len(y)] += carry
	}
	for len(z) > 1 && z[len(z)-1] == 0 {
		z = z[:len(z)-1]
	}
	var sb strings.Builder
	for i := len(z) - 1; i >= 0; i-- {
		sb.WriteByte(byte('0' + z[i]))
	}
	return sb.String()
}

func digits(s string) []int {
	d := make([]int, len(s))
	for i := range s {
		d[len(s)-1-i] = int(s[i] - '0')
	}
	return d
}

// pow64 is base**exp modulo 2**64, by squaring: one pass per bit of exp.
// uint64 arithmetic in Go is modulo 2**64 already.
func pow64(base uint64, exp uint64) uint64 {
	result := uint64(1)
	for exp > 0 {
		if exp&1 == 1 {
			result *= base
		}
		exp >>= 1
		base *= base
	}
	return result
}

// powMod is base**exp modulo mod, by squaring, reducing after every multiplication.
// mod is below 2**31, so a product of two reduced numbers fits an int64.
func powMod(base, exp, mod int64) int64 {
	result := 1 % mod
	base %= mod
	for exp > 0 {
		if exp&1 == 1 {
			result = result * base % mod
		}
		exp >>= 1
		base = base * base % mod
	}
	return result
}

// rightToLeftMuls counts the multiplications of the loop in Linux's int_pow:
// one square per bit, one multiply per set bit.
func rightToLeftMuls(exp uint64) int {
	n := 0
	for exp > 0 {
		n++ // base *= base, even on the last pass
		if exp&1 == 1 {
			n++ // result *= base
		}
		exp >>= 1
	}
	return n
}

// leftToRightMuls counts the multiplications of a left-to-right pass: start at the top bit,
// then square, and multiply on a set bit.
func leftToRightMuls(exp uint64) int {
	if exp == 0 {
		return 0
	}
	n := 0
	for i := bits.Len64(exp) - 2; i >= 0; i-- { // every bit after the leading 1
		n++
		if exp>>uint(i)&1 == 1 {
			n++
		}
	}
	return n
}

func main() {
	out := bufio.NewWriter(os.Stdout)
	defer out.Flush()
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) == 0 {
			continue
		}
		switch fields[0] {
		case "add32":
			a, _ := strconv.ParseInt(fields[1], 10, 32)
			b, _ := strconv.ParseInt(fields[2], 10, 32)
			fmt.Fprintln(out, int32(a)+int32(b)) // int32 arithmetic wraps around
		case "mul32":
			a, _ := strconv.ParseInt(fields[1], 10, 32)
			b, _ := strconv.ParseInt(fields[2], 10, 32)
			fmt.Fprintln(out, int32(a)*int32(b))
		case "mul":
			fmt.Fprintln(out, bigMul(fields[1], fields[2]))
		case "pow64":
			base, _ := strconv.ParseUint(fields[1], 10, 64)
			exp, _ := strconv.ParseUint(fields[2], 10, 64)
			fmt.Fprintln(out, pow64(base, exp))
		case "powmod":
			base, _ := strconv.ParseInt(fields[1], 10, 64)
			exp, _ := strconv.ParseInt(fields[2], 10, 64)
			mod, _ := strconv.ParseInt(fields[3], 10, 64)
			fmt.Fprintln(out, powMod(base, exp, mod))
		case "muls":
			e, _ := strconv.ParseUint(fields[1], 10, 64)
			fmt.Fprintln(out, rightToLeftMuls(e), leftToRightMuls(e))
		}
	}
}
