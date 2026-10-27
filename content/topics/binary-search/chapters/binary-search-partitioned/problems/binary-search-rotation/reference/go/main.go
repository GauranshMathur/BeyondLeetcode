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

// bisect runs over commits 1..commits; commit `commits` is known bad.
// It returns the first bad commit and the number of tests it ran.
func bisect(commits, firstBad int) (int, int) {
	low, high, tests := 1, commits, 0 // the first bad commit lies in [low, high]
	for low < high {
		m := mid(low, high)
		tests++
		if m >= firstBad { // the test of commit m says "bad"
			high = m
		} else {
			low = m + 1
		}
	}
	return low, tests
}

func hoursNeeded(rate int) int {
	hours := 0
	for _, pile := range items {
		hours += (pile + rate - 1) / rate
	}
	return hours
}

// slowestRate is the smallest rate in [1, max(items)] with hoursNeeded(rate) <= hours.
func slowestRate(hours int) int {
	low, high := 1, 0
	for _, pile := range items {
		high = max(high, pile)
	}
	for low < high {
		m := mid(low, high)
		if hoursNeeded(m) <= hours {
			high = m
		} else {
			low = m + 1
		}
	}
	return low
}

// rotation is the index of the smallest item of a rotated, strictly ascending array; -1 if it is empty.
func rotation() int {
	if len(items) == 0 {
		return -1
	}
	low, high := 1, len(items) // first index in [low, high] whose item is below items[0]
	for low < high {
		m := mid(low, high)
		if items[m] >= items[0] {
			low = m + 1
		} else {
			high = m
		}
	}
	if low == len(items) {
		return 0
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
		case "bisect":
			found, tests := bisect(arg(1), arg(2))
			fmt.Fprintln(out, found, tests)
		case "rate":
			fmt.Fprintln(out, slowestRate(arg(1)))
		case "rotation":
			fmt.Fprintln(out, rotation())
		}
	}
}
