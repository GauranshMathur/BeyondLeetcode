package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

const (
	null    = 0
	poison1 = 256 // LIST_POISON1, 0x100
	poison2 = 290 // LIST_POISON2, 0x122
)

var (
	mem      = map[int]int{} // memory: address -> number. A cell nobody wrote reads as 0, which is NULL.
	commands = map[string]func(args []int){}
	w        = bufio.NewWriter(os.Stdout)
)

func rd(addr int) int { return mem[addr] }

func wr(addr, value int) { mem[addr] = value }

func out(parts ...any) { fmt.Fprintln(w, parts...) }

func outList(items []int) {
	if len(items) == 0 {
		out("-")
		return
	}
	fields := make([]string, len(items))
	for i, v := range items {
		fields[i] = strconv.Itoa(v)
	}
	out(strings.Join(fields, " "))
}

// A list_head is two cells: next at the address, prev at the address + 1.
func initHead(p int) {
	wr(p, p)
	wr(p+1, p)
}

func addBetween(node, prev, next int) {
	wr(next+1, node)
	wr(node, next)
	wr(node+1, prev)
	wr(prev, node)
}


func forward(head int) []int {
	var nodes []int
	for p := rd(head); p != head; p = rd(p) {
		nodes = append(nodes, p)
	}
	return nodes
}

func init() {
	commands["init"] = func(a []int) { initHead(a[0]) }
	commands["add"] = func(a []int) { addBetween(a[0], a[1], rd(a[1])) }
	commands["add_tail"] = func(a []int) { addBetween(a[0], rd(a[1]+1), a[1]) }
	commands["show"] = func(a []int) { outList(forward(a[0])) }
	commands["empty"] = func(a []int) {
		if rd(a[0]) == a[0] {
			out("yes")
		} else {
			out("no")
		}
	}
}

func delEntry(e int) {
	prev, next := rd(e+1), rd(e)
	wr(next+1, prev)
	wr(prev, next)
}


func init() {
	commands["del"] = func(a []int) {
		delEntry(a[0])
		wr(a[0], poison1)
		wr(a[0]+1, poison2)
	}
	commands["del_init"] = func(a []int) {
		delEntry(a[0])
		initHead(a[0])
	}
	commands["show_rev"] = func(a []int) {
		var nodes []int
		for p := rd(a[0] + 1); p != a[0]; p = rd(p + 1) {
			nodes = append(nodes, p)
		}
		outList(nodes)
	}
	commands["get"] = func(a []int) { out(rd(a[0])) }
}

func init() {
	commands["set"] = func(a []int) { wr(a[0], a[1]) }
	commands["entry"] = func(a []int) { out(a[0] - a[1]) }
	commands["values"] = func(a []int) {
		var values []int
		for _, p := range forward(a[0]) {
			values = append(values, rd(p-a[1]))
		}
		outList(values)
	}
}

// A singly linked list: the head is one cell holding the first node, a node's first cell
// holds the next node, and NULL ends the list.
func singly(head int) []int {
	var nodes []int
	for p := rd(head); p != null; p = rd(p) {
		nodes = append(nodes, p)
	}
	return nodes
}

func init() {
	commands["spush"] = func(a []int) {
		wr(a[1], rd(a[0]))
		wr(a[0], a[1])
	}
	commands["sshow"] = func(a []int) { outList(singly(a[0])) }
	commands["sdel"] = func(a []int) {
		head, node := a[0], a[1]
		cur := head // the cell that holds the pointer to the node being looked at
		hops := 0
		for {
			next := rd(cur)
			if next == null {
				out("absent")
				return
			}
			if next == node {
				break
			}
			cur = next
			hops++
		}
		wr(cur, rd(node))
		out(hops)
	}
}

func main() {
	defer w.Flush()
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
