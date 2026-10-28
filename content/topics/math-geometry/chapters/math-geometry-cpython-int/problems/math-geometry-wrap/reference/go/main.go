package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

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
		}
	}
}
