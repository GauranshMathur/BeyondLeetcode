package main

import (
	"bufio"
	"container/heap"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
)

// intHeap is a min-heap of ints for container/heap.
type intHeap []int

func (h intHeap) Len() int           { return len(h) }
func (h intHeap) Less(a, b int) bool { return h[a] < h[b] }
func (h intHeap) Swap(a, b int)      { h[a], h[b] = h[b], h[a] }
func (h *intHeap) Push(x any)        { *h = append(*h, x.(int)) }
func (h *intHeap) Pop() any {
	old := *h
	x := old[len(old)-1]
	*h = old[:len(old)-1]
	return x
}

type job struct{ run, deadline int }

var (
	values   []int // the sequence the commands work on
	jobs     []job // (run time, deadline) pairs
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
	commands["huffman"] = func(args []int) {
		h := &intHeap{}
		for _, x := range values {
			if x > 0 {
				*h = append(*h, x)
			}
		}
		if h.Len() == 0 {
			fmt.Fprintln(out, 0)
			return
		}
		if h.Len() == 1 {
			// zlib forces a second code, so the one symbol still costs one bit each time.
			fmt.Fprintln(out, (*h)[0])
			return
		}
		heap.Init(h)
		total := 0
		for h.Len() > 1 {
			merged := heap.Pop(h).(int) + heap.Pop(h).(int)
			total += merged // every symbol below the new node gets one bit longer
			heap.Push(h, merged)
		}
		fmt.Fprintln(out, total)
	}
}

func init() {
	commands["jobs"] = func(args []int) {
		jobs = jobs[:0]
		for i := 0; i+1 < len(args); i += 2 {
			jobs = append(jobs, job{args[i], args[i+1]})
		}
	}
}

func init() {
	commands["edf"] = func(args []int) {
		order := append([]job{}, jobs...)
		// Earliest deadline first: run the jobs in order of deadline and track the largest tardiness.
		sort.SliceStable(order, func(a, b int) bool { return order[a].deadline < order[b].deadline })
		clock, worst := 0, 0
		for _, j := range order {
			clock += j.run
			worst = max(worst, clock-j.deadline)
		}
		fmt.Fprintln(out, worst)
	}
}

func parse(lazy bool) {
	n := len(values)
	i, tokens := 0, 0
	for i < n {
		length := values[i]
		if length < 3 {
			tokens++ // a literal
			i++
			continue
		}
		if lazy {
			// A longer match at the next position beats this one: this position becomes a literal.
			for i+1 < n && values[i+1] > length {
				tokens++
				i++
				length = values[i]
			}
		}
		tokens++ // a match
		i += length
	}
	fmt.Fprintln(out, tokens)
}

func init() {
	commands["greedy"] = func(args []int) { parse(false) }
	commands["lazy"] = func(args []int) { parse(true) }
}

func init() {
	commands["reach"] = func(args []int) {
		n := len(values)
		jumps, end, far := 0, 0, 0
		// end is the last position the jumps made so far can land on; far is the furthest
		// position that any position up to end could land on with one more jump.
		for i := 0; i < n; i++ {
			far = max(far, i+max(1, values[i]))
			if i == end {
				jumps++
				end = far
			}
		}
		fmt.Fprintln(out, jumps)
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
