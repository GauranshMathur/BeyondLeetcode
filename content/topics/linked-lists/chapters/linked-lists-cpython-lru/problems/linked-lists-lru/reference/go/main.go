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
	switch {
	case prev == null:
		out("corrupt add: prev-null")
	case next == null:
		out("corrupt add: next-null")
	case rd(next+1) != prev:
		out("corrupt add: next.prev")
	case rd(prev) != next:
		out("corrupt add: prev.next")
	case node == prev || node == next:
		out("corrupt add: double-add")
	default:
		wr(next+1, node)
		wr(node, next)
		wr(node+1, prev)
		wr(prev, node)
	}
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
	switch {
	case next == null:
		out("corrupt del: next-null")
	case prev == null:
		out("corrupt del: prev-null")
	case next == poison1:
		out("corrupt del: poison1")
	case prev == poison2:
		out("corrupt del: poison2")
	case rd(prev) != e:
		out("corrupt del: prev.next")
	case rd(next+1) != e:
		out("corrupt del: next.prev")
	default:
		wr(next+1, prev)
		wr(prev, next)
	}
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

// An hlist: the head is one cell (first). A node is two cells: next, and pprev, the address of
// the cell that points at this node (the head's cell, or the previous node's first cell).
func init() {
	commands["hadd"] = func(a []int) {
		node, head := a[0], a[1]
		first := rd(head)
		wr(node, first)
		if first != null {
			wr(first+1, node)
		}
		wr(head, node)
		wr(node+1, head)
	}
	commands["hadd_before"] = func(a []int) {
		node, next := a[0], a[1]
		wr(node+1, rd(next+1))
		wr(node, next)
		wr(next+1, node)
		wr(rd(node+1), node)
	}
	commands["hadd_behind"] = func(a []int) {
		node, prev := a[0], a[1]
		wr(node, rd(prev))
		wr(prev, node)
		wr(node+1, prev)
		if rd(node) != null {
			wr(rd(node)+1, node)
		}
	}
	commands["hdel"] = func(a []int) {
		node := a[0]
		next, pprev := rd(node), rd(node+1)
		wr(pprev, next)
		if next != null {
			wr(next+1, pprev)
		}
		wr(node, poison1)
		wr(node+1, poison2)
	}
	commands["hshow"] = commands["sshow"]
}

func splice(list, prev, next int) {
	first, last := rd(list), rd(list+1)
	wr(first+1, prev)
	wr(prev, first)
	wr(last, next)
	wr(next+1, last)
}

func init() {
	commands["splice"] = func(a []int) {
		list, head := a[0], a[1]
		if rd(list) != list {
			splice(list, head, rd(head))
			initHead(list)
		}
	}
	commands["splice_tail"] = func(a []int) {
		list, head := a[0], a[1]
		if rd(list) != list {
			splice(list, rd(head+1), head)
			initHead(list)
		}
	}
}

func init() {
	commands["sreverse"] = func(a []int) {
		head := a[0]
		prev := null
		cur := rd(head)
		for cur != null {
			next := rd(cur)
			wr(cur, prev)
			prev = cur
			cur = next
		}
		wr(head, prev)
	}
}

// A singly linked node is two cells: next, then its sort key at the address + 1.
const scratch = -1 // a cell that is never a node, used as the dummy front of a merge

func mergeNodes(a, b int) int {
	tail := scratch
	for a != null && b != null {
		if rd(a+1) <= rd(b+1) { // on a tie, take a: the merge is stable
			wr(tail, a)
			tail = a
			a = rd(a)
		} else {
			wr(tail, b)
			tail = b
			b = rd(b)
		}
	}
	if a != null {
		wr(tail, a)
	} else {
		wr(tail, b)
	}
	return rd(scratch)
}

func init() {
	commands["smerge"] = func(a []int) {
		wr(a[0], mergeNodes(rd(a[0]), rd(a[1])))
		wr(a[1], null)
	}
	commands["svalues"] = func(a []int) {
		var values []int
		for _, p := range singly(a[0]) {
			values = append(values, rd(p+1))
		}
		outList(values)
	}
}

func init() {
	commands["check"] = func(a []int) {
		head := a[0]
		cur, count := head, 0
		for {
			next := rd(cur)
			if next == null || rd(next+1) != cur {
				out("broken", cur)
				return
			}
			if next == head {
				out("ok", count)
				return
			}
			count++
			cur = next
		}
	}
}

// A cache of capacity `capacity`. The list runs from the oldest entry (root.next) to the newest
// (root.prev); a node is four cells: next, prev, key, value. `index` maps a key to its node.
const root = 1000

var cache = struct {
	capacity, free, hits, misses int
	index                        map[int]int
}{index: map[int]int{}, free: root + 4}

func cacheNew(a []int) {
	cache.capacity = a[0]
	cache.index = map[int]int{}
	cache.free = root + 4
	initHead(root)
}

func cacheCall(a []int) {
	key, result := a[0], a[1]
	if node, ok := cache.index[key]; ok {
		delEntry(node)
		addBetween(node, rd(root+1), root)
		out("hit", rd(node+3))
		return
	}
	var node int
	if len(cache.index) < cache.capacity {
		node = cache.free
		cache.free += 4
		out("miss")
	} else {
		node = rd(root) // the oldest
		delEntry(node)
		delete(cache.index, rd(node+2))
		out("miss evict", rd(node+2))
	}
	wr(node+2, key)
	wr(node+3, result)
	cache.index[key] = node
	addBetween(node, rd(root+1), root)
}

func init() {
	commands["cache"] = cacheNew
	commands["call"] = cacheCall
	commands["order"] = func(a []int) {
		var keys []int
		for _, p := range forward(root) {
			keys = append(keys, rd(p+2))
		}
		outList(keys)
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
