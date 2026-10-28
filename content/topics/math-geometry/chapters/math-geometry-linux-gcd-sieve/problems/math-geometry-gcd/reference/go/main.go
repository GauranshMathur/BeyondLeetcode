package main

import (
	"bufio"
	"fmt"
	"math/bits"
	"os"
	"strconv"
	"strings"
)

var matrixCommands = map[string]bool{"at": true, "shape": true, "show": true, "block": true, "transpose": true, "mirror": true, "rotate": true, "spiral": true}

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

// The matrix: one block of items, and a view of it (shape, offset and one stride per axis).
var (
	loaded    bool
	block     []int
	rows      int
	cols      int
	offset    int // index in the block of the view's item (0, 0)
	rowStride int // how far to move in the block for one step down
	colStride int // ... and for one step right
)

func load(r, c int, values []int) {
	loaded = true
	block = values
	rows, cols = r, c
	offset, rowStride, colStride = 0, c, 1
}

func at(i, j int) int {
	return block[offset+i*rowStride+j*colStride]
}

// transpose swaps the axes of the view. No item moves.
func transpose() {
	rows, cols = cols, rows
	rowStride, colStride = colStride, rowStride
}

// mirror reverses each row of the view: start at its last column and walk backwards. No item moves.
func mirror() {
	offset += (cols - 1) * colStride
	colStride = -colStride
}

func join(values []int) string {
	parts := make([]string, len(values))
	for i, v := range values {
		parts[i] = strconv.Itoa(v)
	}
	return strings.Join(parts, " ")
}

// spiral lists the view's items clockwise from the top-left corner, walking in towards the middle.
func spiral() []int {
	var result []int
	top, bottom, left, right := 0, rows-1, 0, cols-1
	for top <= bottom && left <= right {
		for j := left; j <= right; j++ {
			result = append(result, at(top, j))
		}
		for i := top + 1; i <= bottom; i++ {
			result = append(result, at(i, right))
		}
		if top < bottom {
			for j := right - 1; j >= left; j-- {
				result = append(result, at(bottom, j))
			}
		}
		if left < right {
			for i := bottom - 1; i > top; i-- {
				result = append(result, at(i, left))
			}
		}
		top, bottom, left, right = top+1, bottom-1, left+1, right-1
	}
	return result
}

// gcd is the binary GCD, as in Linux's lib/math/gcd.c: shifts and subtractions, no division.
func gcd(a, b uint64) uint64 {
	r := a | b
	if a == 0 || b == 0 {
		return r
	}
	b >>= uint(bits.TrailingZeros64(b))
	if b == 1 {
		return r & -r
	}
	for {
		a >>= uint(bits.TrailingZeros64(a))
		if a == 1 {
			return r & -r
		}
		if a == b {
			return a << uint(bits.TrailingZeros64(r))
		}
		if a < b {
			a, b = b, a
		}
		a -= b
	}
}

func main() {
	out := bufio.NewWriter(os.Stdout)
	defer out.Flush()
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 1<<20), 1<<26) // a line is never cut short
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) == 0 {
			continue
		}
		if matrixCommands[fields[0]] && !loaded {
			fmt.Fprintln(out, "error")
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
		case "matrix":
			r, _ := strconv.Atoi(fields[1])
			c, _ := strconv.Atoi(fields[2])
			values := make([]int, 0, r*c)
			for _, f := range fields[3 : 3+r*c] {
				v, _ := strconv.Atoi(f)
				values = append(values, v)
			}
			load(r, c, values)
		case "at":
			i, _ := strconv.Atoi(fields[1])
			j, _ := strconv.Atoi(fields[2])
			if i >= 0 && i < rows && j >= 0 && j < cols {
				fmt.Fprintln(out, at(i, j))
			} else {
				fmt.Fprintln(out, "error")
			}
		case "shape":
			fmt.Fprintln(out, rows, cols)
		case "show":
			for i := 0; i < rows; i++ {
				row := make([]string, cols)
				for j := range row {
					row[j] = strconv.Itoa(at(i, j))
				}
				fmt.Fprintln(out, strings.Join(row, " "))
			}
		case "block":
			fmt.Fprintln(out, join(block))
		case "transpose":
			transpose()
		case "mirror":
			mirror()
		case "rotate":
			// A clockwise quarter turn is a transpose, then a mirror (what NumPy's rot90 composes).
			transpose()
			mirror()
		case "spiral":
			fmt.Fprintln(out, join(spiral()))
		case "gcd":
			a, _ := strconv.ParseUint(fields[1], 10, 64)
			b, _ := strconv.ParseUint(fields[2], 10, 64)
			fmt.Fprintln(out, gcd(a, b))
		}
	}
}
