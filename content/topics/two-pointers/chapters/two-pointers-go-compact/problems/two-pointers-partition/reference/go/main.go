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
	commands["triples"] = func(args []int) {
		count := 0
		n := len(values)
		for first := 0; first < n-2; first++ {
			if first > 0 && values[first] == values[first-1] {
				continue
			}
			lo, hi := first+1, n-1
			for lo < hi {
				total := values[first] + values[lo] + values[hi]
				if total < 0 {
					lo++
				} else if total > 0 {
					hi--
				} else {
					count++
					lo++
					hi--
					for lo < hi && values[lo] == values[lo-1] {
						lo++
					}
				}
			}
		}
		fmt.Fprintln(out, count)
	}
}

func init() {
	commands["merge"] = func(args []int) {
		split := args[0]
		newer, older := values[:split], values[split:]
		merged := make([]int, 0, len(values))
		sources := make([]string, 0, len(values))
		i, j := 0, 0
		for i < len(newer) || j < len(older) {
			if j == len(older) || (i < len(newer) && newer[i] <= older[j]) {
				if j < len(older) && newer[i] == older[j] {
					j++ // the older entry is hidden by the newer one
				}
				merged = append(merged, newer[i])
				sources = append(sources, "N")
				i++
			} else {
				merged = append(merged, older[j])
				sources = append(sources, "O")
				j++
			}
		}
		values = merged
		fmt.Fprintln(out, strings.Join(sources, " "))
	}
}

func init() {
	commands["compact"] = func(args []int) {
		if len(values) == 0 {
			fmt.Fprintln(out, 0)
			return
		}
		write := 1
		for read := 1; read < len(values); read++ {
			if values[read] != values[read-1] {
				values[write] = values[read]
				write++
			}
		}
		values = values[:write]
		fmt.Fprintln(out, write)
	}
}

func init() {
	commands["partition"] = func(args []int) {
		pivot := args[0]
		i, j := 0, len(values)-1
		for {
			for i <= j && values[i] < pivot {
				i++
			}
			for i <= j && values[j] >= pivot {
				j--
			}
			if i > j {
				break
			}
			values[i], values[j] = values[j], values[i]
			i++
			j--
		}
		fmt.Fprintln(out, i)
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
