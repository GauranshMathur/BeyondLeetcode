package main

import (
	"bufio"
	"fmt"
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
		}
	}
}
