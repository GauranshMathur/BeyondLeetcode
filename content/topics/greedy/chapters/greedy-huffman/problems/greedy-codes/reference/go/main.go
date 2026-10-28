package main

import (
	"bufio"
	"container/heap"
	"fmt"
	"os"
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

var (
	values   []int // the sequence the commands work on
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
			// One symbol that occurs still costs one bit each time (the Problem's rule).
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
