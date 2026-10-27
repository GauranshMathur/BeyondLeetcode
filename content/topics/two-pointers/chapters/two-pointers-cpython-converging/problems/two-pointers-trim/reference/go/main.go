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
