package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

var (
	words    []uint32 // the sequence the commands work on: unsigned 32-bit words
	commands = map[string]func(args []int){}
	out      = bufio.NewWriter(os.Stdout)
)

// join writes one line: the items separated by single spaces.
func join[T any](items []T) string {
	fields := make([]string, len(items))
	for i, item := range items {
		fields[i] = fmt.Sprint(item)
	}
	return strings.Join(fields, " ")
}

func init() {
	commands["load"] = func(args []int) {
		words = make([]uint32, len(args))
		for i, v := range args {
			words[i] = uint32(v)
		}
	}
	commands["show"] = func(args []int) {
		signed := make([]int32, len(words))
		for i, w := range words {
			signed[i] = int32(w)
		}
		fmt.Fprintln(out, join(signed))
	}
	commands["ushow"] = func(args []int) {
		fmt.Fprintln(out, join(words))
	}
	commands["signext"] = func(args []int) {
		shift := uint(32 - args[0])
		field := make([]int32, len(words))
		for i, w := range words {
			// Move the field's top bit to bit 31, then shift back with the sign copied down.
			field[i] = int32(w<<shift) >> shift
		}
		fmt.Fprintln(out, join(field))
	}
}

func init() {
	commands["wrapsum"] = func(args []int) {
		var total uint32
		for _, w := range words {
			a, b := total, w
			for b != 0 {
				// XOR adds without carries; AND, moved one place up, is the carries.
				a, b = a^b, (a&b)<<1
			}
			total = a
		}
		fmt.Fprintln(out, int32(total))
	}
}

func growTo(wordIndex int) {
	for len(words) <= wordIndex {
		words = append(words, 0)
	}
}

func init() {
	commands["set"] = func(args []int) {
		i := args[0]
		growTo(i >> 5)
		words[i>>5] |= 1 << (i & 31)
	}
	commands["clear"] = func(args []int) {
		i := args[0]
		if i>>5 < len(words) {
			words[i>>5] &^= 1 << (i & 31)
		}
	}
	commands["flip"] = func(args []int) {
		i := args[0]
		growTo(i >> 5)
		words[i>>5] ^= 1 << (i & 31)
	}
	commands["test"] = func(args []int) {
		i := args[0]
		if i>>5 < len(words) {
			fmt.Fprintln(out, (words[i>>5]>>(i&31))&1)
		} else {
			fmt.Fprintln(out, 0)
		}
	}
}

func weight32(w uint32) int {
	w -= (w >> 1) & 0x55555555
	w = (w & 0x33333333) + ((w >> 2) & 0x33333333)
	w = (w + (w >> 4)) & 0x0f0f0f0f
	return int((w * 0x01010101) >> 24)
}

func init() {
	commands["count"] = func(args []int) {
		n := args[0]
		full, rest := n>>5, n&31
		total := 0
		for i := 0; i < min(full, len(words)); i++ {
			total += weight32(words[i])
		}
		if rest > 0 && full < len(words) {
			total += weight32(words[full] & (1<<rest - 1))
		}
		fmt.Fprintln(out, total)
	}
}

func init() {
	commands["recover"] = func(args []int) {
		var parity uint32
		for _, w := range words {
			parity ^= w
		}
		fmt.Fprintln(out, parity)
	}
}

func init() {
	commands["missing"] = func(args []int) {
		answer := uint32(len(words))
		for i, w := range words {
			answer ^= uint32(i) ^ w
		}
		fmt.Fprintln(out, answer)
	}
}

func init() {
	commands["lowbit"] = func(args []int) {
		lowest := make([]uint32, len(words))
		for i, w := range words {
			lowest[i] = w & -w
		}
		fmt.Fprintln(out, join(lowest))
	}
	commands["pow2"] = func(args []int) {
		answers := make([]string, len(words))
		for i, w := range words {
			answers[i] = "no"
			if w != 0 && w&(w-1) == 0 {
				answers[i] = "yes"
			}
		}
		fmt.Fprintln(out, strings.Join(answers, " "))
	}
}

func init() {
	commands["countbits"] = func(args []int) {
		n := args[0]
		counts := make([]int, n+1)
		for i := 1; i <= n; i++ {
			counts[i] = counts[i&(i-1)] + 1 // clear the lowest set bit, add one
		}
		fmt.Fprintln(out, join(counts))
	}
}
func main() {
	defer out.Flush()
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 1<<20), 1<<26)
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) == 0 {
			continue
		}
		command, ok := commands[fields[0]]
		if !ok {
			continue
		}
		args := make([]int, len(fields)-1)
		for i, f := range fields[1:] {
			args[i], _ = strconv.Atoi(f)
		}
		command(args)
	}
}
