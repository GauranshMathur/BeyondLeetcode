package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

type item struct {
	key    int
	ticket int
}

type heap struct {
	items    []*item // the heap, in array order
	compares int     // how many times two items have been compared
}

// less reports whether a is smaller than b: lower key, or the same key and an earlier ticket.
func (h *heap) less(a, b *item) bool {
	h.compares++
	return a.key < b.key || (a.key == b.key && a.ticket < b.ticket)
}

// siftUp moves the item at pos up while it is smaller than its parent, but never above start.
func (h *heap) siftUp(start, pos int) {
	it := h.items[pos]
	for pos > start {
		parent := (pos - 1) / 2
		if !h.less(it, h.items[parent]) {
			break
		}
		h.items[pos] = h.items[parent]
		pos = parent
	}
	h.items[pos] = it
}

// siftDown opens a hole at pos, moves the smaller child up into it again and again until the
// hole is at a leaf, puts the item there and sifts it up.
func (h *heap) siftDown(pos int) {
	end := len(h.items)
	start := pos
	it := h.items[pos]
	for 2*pos+1 < end {
		child := 2*pos + 1
		if child+1 < end && h.less(h.items[child+1], h.items[child]) {
			child++
		}
		h.items[pos] = h.items[child]
		pos = child
	}
	h.items[pos] = it
	h.siftUp(start, pos)
}

func (h *heap) push(it *item) {
	h.items = append(h.items, it)
	h.siftUp(0, len(h.items)-1)
}

func (h *heap) pop() *item {
	last := h.items[len(h.items)-1]
	h.items = h.items[:len(h.items)-1]
	if len(h.items) == 0 {
		return last
	}
	top := h.items[0]
	h.items[0] = last
	h.siftDown(0)
	return top
}

// init replaces the contents with items and arranges them into a heap in one pass.
func (h *heap) init(items []*item) {
	h.items = items
	for pos := len(items)/2 - 1; pos >= 0; pos-- {
		h.siftDown(pos)
	}
}

func main() {
	out := bufio.NewWriter(os.Stdout)
	defer out.Flush()
	h := &heap{}
	tickets := 0 // how many pushes so far
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 0, 1<<16), 1<<24) // a line can be longer than the default 64 KiB
	for scanner.Scan() {
		parts := strings.Fields(scanner.Text())
		if len(parts) == 0 {
			continue
		}
		switch parts[0] {
		case "push":
			key, _ := strconv.Atoi(parts[1])
			h.push(&item{key: key, ticket: tickets})
			tickets++
		case "pop":
			if len(h.items) == 0 {
				fmt.Fprintln(out, "empty")
			} else {
				fmt.Fprintln(out, h.pop().key)
			}
		case "peek":
			if len(h.items) == 0 {
				fmt.Fprintln(out, "empty")
			} else {
				fmt.Fprintln(out, h.items[0].key)
			}
		case "size":
			fmt.Fprintln(out, len(h.items))
		case "show":
			if len(h.items) == 0 {
				fmt.Fprintln(out, "empty")
				break
			}
			keys := make([]string, len(h.items))
			for i, it := range h.items {
				keys[i] = strconv.Itoa(it.key)
			}
			fmt.Fprintln(out, strings.Join(keys, " "))
		case "cmp":
			fmt.Fprintln(out, h.compares)
		case "init":
			items := make([]*item, len(parts)-1)
			for i, word := range parts[1:] {
				key, _ := strconv.Atoi(word)
				items[i] = &item{key: key, ticket: tickets + i}
			}
			h.init(items)
			tickets += len(items)
		}
	}
}
