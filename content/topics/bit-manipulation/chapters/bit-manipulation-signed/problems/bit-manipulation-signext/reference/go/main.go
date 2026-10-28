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
