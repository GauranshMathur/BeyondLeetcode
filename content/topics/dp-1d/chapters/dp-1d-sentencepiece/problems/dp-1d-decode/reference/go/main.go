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
	commands["wrap"] = func(args []string) {
		width := num(args[0])
		n := len(values)
		best := make([]int, n+1) // best[j]: cheapest cost of the first j words, -1 if impossible
		for j := 1; j <= n; j++ {
			best[j] = -1
		}
		for j := 1; j <= n; j++ {
			used := -1 // the line holds words i-1 .. j-1, with a space between neighbours
			for i := j; i > 0; i-- {
				used += values[i-1] + 1
				if used > width {
					break
				}
				if best[i-1] < 0 {
					continue
				}
				cost := best[i-1]
				if j < n {
					slack := width - used
					cost += slack * slack * slack
				}
				if best[j] < 0 || cost < best[j] {
					best[j] = cost
				}
			}
		}
		fmt.Fprintln(out, best[n])
	}
}

func init() {
	commands["pick"] = func(args []string) {
		before, best := 0, 0 // best total over the items up to two back, and up to one back
		for _, v := range values {
			before, best = best, max(best, before+v)
		}
		fmt.Fprintln(out, best)
	}
}

func init() {
	commands["spread"] = func(args []string) {
		k := num(args[0])
		ring := make([]int, k) // ring[j % k]: best total over the first j items, for the last k values of j
		best := 0
		for i := 1; i <= len(values); i++ {
			best = max(best, ring[i%k]+values[i-1]) // ring[i % k] still holds the total k items back
			ring[i%k] = best
		}
		fmt.Fprintln(out, best)
	}
}

func init() {
	commands["fewest"] = func(args []string) {
		amount := num(args[0])
		table := make([]int, amount+1) // table[m]: fewest items that sum to m, -1 if none do
		for m := 1; m <= amount; m++ {
			table[m] = -1
			for _, item := range values {
				if item <= m && table[m-item] >= 0 && (table[m] < 0 || table[m-item]+1 < table[m]) {
					table[m] = table[m-item] + 1
				}
			}
		}
		fmt.Fprintln(out, table[amount])
	}
}

func init() {
	commands["decode"] = func(args []string) {
		before, best := 0, 1 // splits of the first i-1 digits and of the first i digits, for i = 0
		for i, d := range values {
			total := 0
			if d != 0 {
				total = best // d alone as a token
			}
			if i > 0 && values[i-1]*10+d >= 10 && values[i-1]*10+d <= 26 {
				total += before // the last two digits as one token
			}
			before, best = best, total%mod
		}
		fmt.Fprintln(out, best)
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
