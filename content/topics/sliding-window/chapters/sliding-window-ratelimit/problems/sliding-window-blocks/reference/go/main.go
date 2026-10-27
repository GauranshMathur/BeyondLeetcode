package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

var (
	values   []int // the sequence the commands work on
	commands = map[string]func(args []int){}
	out      = bufio.NewWriter(os.Stdout)
)

func init() {
	commands["load"] = func(args []int) {
		values = append([]int{}, args...)
	}
	commands["show"] = func(args []int) {
		fields := make([]string, len(values))
		for i, v := range values {
			fields[i] = strconv.Itoa(v)
		}
		fmt.Fprintln(out, strings.Join(fields, " "))
	}
}

func init() {
	commands["peak"] = func(args []int) {
		n := len(values)
		if n == 0 {
			fmt.Fprintln(out, 0)
			return
		}
		k := min(args[0], n)
		// Slide a window of k items: add the item that enters, subtract the one that leaves.
		window := 0
		for i := 0; i < k; i++ {
			window += values[i]
		}
		best := window
		for i := k; i < n; i++ {
			window += values[i] - values[i-k]
			best = max(best, window)
		}
		fmt.Fprintln(out, best)
	}
}

func init() {
	commands["blocks"] = func(args []int) {
		k := args[0]
		if len(values) == 0 {
			fmt.Fprintln(out, 0)
			return
		}
		best, first := 0, true
		for start := 0; start < len(values); start += k {
			total := 0
			for i := start; i < min(start+k, len(values)); i++ {
				total += values[i]
			}
			if first || total > best {
				best, first = total, false
			}
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
