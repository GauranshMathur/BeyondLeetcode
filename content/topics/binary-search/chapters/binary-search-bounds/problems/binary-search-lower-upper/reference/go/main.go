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

var items []int // the sorted array that `array` loaded

// search follows Java's contract: the index of key, or -(insertion point) - 1 when it is absent.
func search(key int) int {
	low, high := 0, len(items)-1 // key, if present, lies in items[low..high]
	for low <= high {
		m := mid(low, high)
		if items[m] < key {
			low = m + 1
		} else if items[m] > key {
			high = m - 1
		} else {
			return m
		}
	}
	return -(low + 1)
}

// lower is the first index whose item is >= key (len(items) if none).
func lower(key int) int {
	low, high := 0, len(items) // the answer lies in [low, high]
	for low < high {
		m := mid(low, high)
		if items[m] < key {
			low = m + 1
		} else {
			high = m
		}
	}
	return low
}

// upper is the first index whose item is > key (len(items) if none).
func upper(key int) int {
	low, high := 0, len(items)
	for low < high {
		m := mid(low, high)
		if items[m] <= key {
			low = m + 1
		} else {
			high = m
		}
	}
	return low
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
		case "array":
			items = items[:0]
			for i := 1; i < len(parts); i++ {
				items = append(items, arg(i))
			}
		case "search":
			fmt.Fprintln(out, search(arg(1)))
		case "lower":
			fmt.Fprintln(out, lower(arg(1)))
		case "upper":
			fmt.Fprintln(out, upper(arg(1)))
		case "count":
			fmt.Fprintln(out, upper(arg(1))-lower(arg(1)))
		}
	}
}
