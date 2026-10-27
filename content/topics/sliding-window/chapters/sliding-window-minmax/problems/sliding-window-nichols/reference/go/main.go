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
	commands["approx"] = func(args []int) {
		k, limit := args[0], args[1]
		over := 0
		prev, cur := 0, 0 // total of the previous period, and of this one so far
		for i, v := range values {
			if i > 0 && i%k == 0 {
				prev, cur = cur, 0
			}
			cur += v
			elapsed := i%k + 1
			// estimate = prev * (k - elapsed) / k + cur, compared with limit after multiplying by k
			if prev*(k-elapsed)+cur*k > limit*k {
				over++
			}
		}
		fmt.Fprintln(out, over)
	}
}

func init() {
	commands["flight"] = func(args []int) {
		limit := args[0]
		lo, total, best := 0, 0, 0 // the window is values[lo..hi]
		for hi, v := range values {
			total += v // the right edge moves out
			for total > limit {
				total -= values[lo] // the left edge catches up
				lo++
			}
			best = max(best, hi-lo+1)
		}
		fmt.Fprintln(out, best)
	}
}

func init() {
	commands["shortest"] = func(args []int) {
		need := args[0]
		lo, total, best := 0, 0, 0
		for hi, v := range values {
			total += v
			// while the window is big enough, record it, then let the left edge shrink it
			for total >= need {
				if best == 0 || hi-lo+1 < best {
					best = hi - lo + 1
				}
				total -= values[lo]
				lo++
			}
		}
		fmt.Fprintln(out, best)
	}
}

func init() {
	commands["bans"] = func(args []int) {
		span, limit := args[0], args[1]
		counts := map[int]int{} // host -> failures among the last `span` items
		banned := map[int]bool{}
		order := []string{}
		for i, host := range values {
			counts[host]++ // enters the window
			if i >= span { // the item `span` places back leaves it
				old := values[i-span]
				counts[old]--
				if counts[old] == 0 {
					delete(counts, old)
				}
			}
			if counts[host] >= limit && !banned[host] {
				banned[host] = true
				order = append(order, strconv.Itoa(host))
			}
		}
		fmt.Fprintln(out, strings.Join(order, " "))
	}
}

func init() {
	commands["distinct"] = func(args []int) {
		last := map[int]int{} // value -> index of its latest occurrence
		lo, best := 0, 0      // the window is values[lo..i]
		for i, v := range values {
			if seen, ok := last[v]; ok && seen >= lo {
				lo = seen + 1 // the left edge jumps past the earlier copy
			}
			last[v] = i
			best = max(best, i-lo+1)
		}
		fmt.Fprintln(out, best)
	}
}

func init() {
	commands["windowmax"] = func(args []int) {
		k := min(args[0], len(values))
		result := []string{}
		// indices of the items that could still be a window's maximum, largest value first
		candidates := make([]int, 0, len(values))
		head := 0
		for i, v := range values {
			for len(candidates) > head && values[candidates[len(candidates)-1]] <= v {
				candidates = candidates[:len(candidates)-1] // v is newer and at least as big
			}
			candidates = append(candidates, i)
			if candidates[head] <= i-k {
				head++ // the front has left the window
			}
			if i >= k-1 {
				result = append(result, strconv.Itoa(values[candidates[head]]))
			}
		}
		fmt.Fprintln(out, strings.Join(result, " "))
	}
}

func init() {
	type sample struct{ t, v int }
	commands["nichols"] = func(args []int) {
		win := args[0]
		s := [3]sample{} // best, 2nd best, 3rd best
		result := make([]string, 0, len(values))
		for t, meas := range values {
			val := sample{t, meas}
			if meas >= s[0].v || t-s[2].t > win { // a new max, or nothing left in the window
				s = [3]sample{val, val, val}
			} else {
				if meas >= s[1].v {
					s[1], s[2] = val, val
				} else if meas >= s[2].v {
					s[2] = val
				}
				dt := t - s[0].t
				if dt > win { // the best has aged out: promote the others
					s = [3]sample{s[1], s[2], val}
					if t-s[0].t > win {
						s = [3]sample{s[1], s[2], val}
					}
				} else if s[1].t == s[0].t && dt > win/4 {
					s[1], s[2] = val, val
				} else if s[2].t == s[1].t && dt > win/2 {
					s[2] = val
				}
			}
			result = append(result, strconv.Itoa(s[0].v))
		}
		fmt.Fprintln(out, strings.Join(result, " "))
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
