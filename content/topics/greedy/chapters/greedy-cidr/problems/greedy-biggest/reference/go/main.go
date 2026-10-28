package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

var (
	commands = map[string]func(args []int){}
	out      = bufio.NewWriter(os.Stdout)
)

func init() {
	commands["cidr"] = func(args []int) {
		first, last := args[0], args[1]
		count := 0
		for first <= last {
			// The biggest block that starts at first: 2^k numbers, first a multiple of 2^k, ending by last.
			size := 1
			for first%(size*2) == 0 && first+size*2-1 <= last {
				size *= 2
			}
			first += size
			count++
		}
		fmt.Fprintln(out, count)
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
