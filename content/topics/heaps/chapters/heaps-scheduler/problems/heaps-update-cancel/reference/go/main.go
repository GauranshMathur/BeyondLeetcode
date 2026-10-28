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
	name   string // a timer's ID; empty for an item made by push or init
	pos    int    // the item's index in the heap array, kept up to date by put
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

// put is where every move of an item goes through, so item.pos is always right.
func (h *heap) put(pos int, it *item) {
	h.items[pos] = it
	it.pos = pos
}

// siftUp moves the item at pos up while it is smaller than its parent, but never above start.
// It returns where the item ends up.
func (h *heap) siftUp(start, pos int) int {
	it := h.items[pos]
	for pos > start {
		parent := (pos - 1) / 2
		if !h.less(it, h.items[parent]) {
			break
		}
		h.put(pos, h.items[parent])
		pos = parent
	}
	h.put(pos, it)
	return pos
}

// siftDown opens a hole at pos, moves the smaller child up into it again and again until the
// hole is at a leaf, puts the item there and sifts it up. It returns where the item ends up.
func (h *heap) siftDown(pos int) int {
	end := len(h.items)
	start := pos
	it := h.items[pos]
	for 2*pos+1 < end {
		child := 2*pos + 1
		if child+1 < end && h.less(h.items[child+1], h.items[child]) {
			child++
		}
		h.put(pos, h.items[child])
		pos = child
	}
	h.put(pos, it)
	return h.siftUp(start, pos)
}

// fix restores the heap after the item at pos changed its key or took the place of another.
func (h *heap) fix(pos int) {
	if h.siftDown(pos) == pos {
		h.siftUp(0, pos)
	}
}

func (h *heap) push(it *item) {
	h.items = append(h.items, it)
	h.siftUp(0, len(h.items)-1)
}

func (h *heap) pop() *item {
	return h.remove(0)
}

// remove takes out the item at pos: the last item fills the gap and is fixed.
func (h *heap) remove(pos int) *item {
	removed := h.items[pos]
	last := h.items[len(h.items)-1]
	h.items = h.items[:len(h.items)-1]
	if pos < len(h.items) {
		h.put(pos, last)
		h.fix(pos)
	}
	return removed
}

// replaceTop overwrites the smallest item with it and restores the heap.
func (h *heap) replaceTop(it *item) {
	h.put(0, it)
	h.siftDown(0)
}

// init replaces the contents with items and arranges them into a heap in one pass.
func (h *heap) init(items []*item) {
	h.items = items
	for pos, it := range items {
		it.pos = pos
	}
	for pos := len(items)/2 - 1; pos >= 0; pos-- {
		h.siftDown(pos)
	}
}

func main() {
	out := bufio.NewWriter(os.Stdout)
	defer out.Flush()
	h := &heap{}
	tickets := 0                 // how many pushes so far
	limit := 0                   // 0: keep every item; otherwise the most items to keep
	queued := map[string]*item{} // ID -> the timer with that ID that is in the heap
	popItem := func() *item {
		it := h.pop()
		if queued[it.name] == it {
			delete(queued, it.name)
		}
		return it
	}
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		parts := strings.Fields(scanner.Text())
		if len(parts) == 0 {
			continue
		}
		switch parts[0] {
		case "push":
			key, _ := strconv.Atoi(parts[1])
			it := &item{key: key, ticket: tickets}
			tickets++
			if limit == 0 || len(h.items) < limit {
				h.push(it)
			} else if it.key > h.items[0].key {
				h.replaceTop(it)
			}
		case "keep":
			limit, _ = strconv.Atoi(parts[1])
		case "pop":
			if len(h.items) == 0 {
				fmt.Fprintln(out, "empty")
			} else {
				fmt.Fprintln(out, popItem().key)
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
		case "sched":
			when, _ := strconv.Atoi(parts[2])
			it := &item{key: when, ticket: tickets, name: parts[1]}
			tickets++
			queued[it.name] = it
			h.push(it)
		case "advance":
			now, _ := strconv.Atoi(parts[1])
			for len(h.items) > 0 && h.items[0].key <= now {
				it := popItem()
				fmt.Fprintln(out, it.name)
			}
		case "update", "cancel":
			it := queued[parts[1]]
			if it == nil {
				fmt.Fprintln(out, "error")
			} else if parts[0] == "update" {
				it.key, _ = strconv.Atoi(parts[2])
				h.fix(it.pos)
			} else {
				delete(queued, it.name)
				h.remove(it.pos)
			}
		case "init":
			items := make([]*item, len(parts)-1)
			for i, word := range parts[1:] {
				key, _ := strconv.Atoi(word)
				items[i] = &item{key: key, ticket: tickets + i}
			}
			h.init(items)
			tickets += len(items)
			queued = map[string]*item{}
		}
	}
}
