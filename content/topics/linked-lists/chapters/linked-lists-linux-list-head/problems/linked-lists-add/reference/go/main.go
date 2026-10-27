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
