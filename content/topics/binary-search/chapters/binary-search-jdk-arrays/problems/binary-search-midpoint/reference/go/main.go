package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

// naiveMid is Java's (low + high) / 2 in 32-bit signed arithmetic: the sum wraps,
// the division truncates toward zero.
func naiveMid(low, high int) int {
	total := int32(low + high)
	return int(total / 2)
}

// mid is the exact average, rounded down. Reading the sum as unsigned 32 bits
// cannot go negative, which is what Java's `>>> 1` does.
func mid(low, high int) int {
	return int(uint32(low+high) >> 1)
}

func main() {
	out := bufio.NewWriter(os.Stdout)
	defer out.Flush()
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 1<<20), 1<<24)
	for scanner.Scan() {
		parts := strings.Fields(scanner.Text())
		if len(parts) == 0 {
			continue
		}
		arg := func(i int) int {
			n, _ := strconv.Atoi(parts[i])
			return n
		}
		switch parts[0] {
		case "naive":
			fmt.Fprintln(out, naiveMid(arg(1), arg(2)))
		case "mid":
			fmt.Fprintln(out, mid(arg(1), arg(2)))
		}
	}
}
