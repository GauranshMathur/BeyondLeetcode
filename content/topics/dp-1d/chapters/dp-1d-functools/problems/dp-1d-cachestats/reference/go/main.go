package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

const mod = 1_000_000_007

var (
	values   []int // the sequence the commands work on
	commands = map[string]func(args []string){}
	out      = bufio.NewWriter(os.Stdout)
)

func num(s string) int {
	v, _ := strconv.Atoi(s)
	return v
}

func init() {
	commands["load"] = func(args []string) {
		values = make([]int, len(args))
		for i, a := range args {
			values[i] = num(a)
		}
	}
	commands["show"] = func(args []string) {
		fields := make([]string, len(values))
		for i, v := range values {
			fields[i] = strconv.Itoa(v)
		}
		fmt.Fprintln(out, strings.Join(fields, " "))
	}
}

func init() {
	commands["ways"] = func(args []string) {
		n := num(args[0])
		table := make([]int, n+1) // table[m]: ways to climb m steps, modulo mod
		table[0] = 1
		for m := 1; m <= n; m++ {
			total := 0
			for _, step := range values {
				if step <= m {
					total += table[m-step]
				}
			}
			table[m] = total % mod
		}
		fmt.Fprintln(out, table[n])
	}
}

func init() {
	commands["cache"] = func(args []string) {
		n := num(args[0])
		// Replay the calls of a memoised ways(n). The first call with each value misses, the rest hit.
		reached := make([]bool, n+1) // reached[m]: ways(m) is called at least once
		reached[n] = true
		calls := 1 // the call ways(n) itself
		misses := 0
		for m := n; m >= 0; m-- {
			if !reached[m] {
				continue
			}
			misses++ // its first call computes it
			if m > 0 {
				for _, step := range values {
					if step <= m {
						calls++ // computing ways(m) calls ways(m - step)
						reached[m-step] = true
					}
				}
			}
		}
		fmt.Fprintln(out, calls-misses, misses)
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
		if command, ok := commands[fields[0]]; ok {
			command(fields[1:])
		}
	}
}
