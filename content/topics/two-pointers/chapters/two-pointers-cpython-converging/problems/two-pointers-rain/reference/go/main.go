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
	commands["reverse"] = func(args []int) {
		// Two pointers start at the ends and swap, moving toward each other.
		lo, hi := 0, len(values)-1
		for lo < hi {
			values[lo], values[hi] = values[hi], values[lo]
			lo++
			hi--
		}
	}
}

func init() {
	commands["trim"] = func(args []int) {
		lo, hi := 0, len(values)
		for lo < hi && values[lo] == 0 {
			lo++
		}
		for hi > lo && values[hi-1] == 0 {
			hi--
		}
		fmt.Fprintln(out, len(values)-(hi-lo))
		values = values[lo:hi]
	}
}

func init() {
	commands["palindrome"] = func(args []int) {
		lo, hi := 0, len(values)-1
		for lo < hi {
			if values[lo] == 0 {
				lo++
			} else if values[hi] == 0 {
				hi--
			} else if values[lo] != values[hi] {
				fmt.Fprintln(out, "no")
				return
			} else {
				lo++
				hi--
			}
		}
		fmt.Fprintln(out, "yes")
	}
}

func init() {
	commands["pairsum"] = func(args []int) {
		target := args[0]
		lo, hi := 0, len(values)-1
		for lo < hi {
			total := values[lo] + values[hi]
			if total == target {
				fmt.Fprintln(out, lo+1, hi+1)
				return
			}
			if total < target {
				lo++
			} else {
				hi--
			}
		}
		fmt.Fprintln(out, "none")
	}
}

func init() {
	commands["rain"] = func(args []int) {
		lo, hi := 0, len(values)-1
		leftMax, rightMax, total := 0, 0, 0
		for lo < hi {
			if values[lo] <= values[hi] {
				leftMax = max(leftMax, values[lo])
				total += leftMax - values[lo]
				lo++
			} else {
				rightMax = max(rightMax, values[hi])
				total += rightMax - values[hi]
				hi--
			}
		}
		fmt.Fprintln(out, total)
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
