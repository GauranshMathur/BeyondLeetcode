package main

import (
	"bufio"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
)

// node is one node of the trie. The edge that leads to it is stored in its parent.
type node struct {
	kids  map[byte]*node // next character -> child node
	value int
	has   bool // whether a key ends here
}

func newNode() *node { return &node{kids: map[byte]*node{}} }

var root = newNode()

func add(key string, value int) {
	n := root
	for i := 0; i < len(key); i++ {
		next, ok := n.kids[key[i]]
		if !ok {
			next = newNode()
			n.kids[key[i]] = next
		}
		n = next
	}
	n.value = value
	n.has = true
}

func find(key string) *node {
	n := root
	for i := 0; i < len(key); i++ {
		n = n.kids[key[i]]
		if n == nil {
			return nil
		}
	}
	return n
}

func remove(key string) int {
	path := []*node{root}
	for i := 0; i < len(key); i++ {
		next := path[len(path)-1].kids[key[i]]
		if next == nil {
			return 0
		}
		path = append(path, next)
	}
	if !path[len(path)-1].has {
		return 0
	}
	path[len(path)-1].has = false
	// Cut every node that no longer leads to a key.
	for i := len(key); i > 0; i-- {
		n := path[i]
		if len(n.kids) > 0 || n.has {
			break
		}
		delete(path[i-1].kids, key[i-1])
	}
	return 1
}

type entry struct {
	key string
	n   *node
}

// walk returns every (key, node) under start in key order, start included.
func walk(start *node) []entry {
	var result []entry
	stack := []entry{{"", start}}
	for len(stack) > 0 {
		top := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		result = append(result, top)
		chars := make([]int, 0, len(top.n.kids))
		for ch := range top.n.kids {
			chars = append(chars, int(ch))
		}
		sort.Sort(sort.Reverse(sort.IntSlice(chars)))
		for _, ch := range chars {
			stack = append(stack, entry{top.key + string(rune(ch)), top.n.kids[byte(ch)]})
		}
	}
	return result
}

func main() {
	out := bufio.NewWriter(os.Stdout)
	defer out.Flush()
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
	for scanner.Scan() {
		parts := strings.Fields(scanner.Text())
		if len(parts) == 0 {
			continue
		}
		switch parts[0] {
		case "add":
			value, _ := strconv.Atoi(parts[2])
			add(parts[1], value)
		case "get":
			if n := find(parts[1]); n != nil && n.has {
				fmt.Fprintln(out, n.value)
			} else {
				fmt.Fprintln(out, "none")
			}
		case "del":
			fmt.Fprintln(out, remove(parts[1]))
		case "nodes":
			fmt.Fprintln(out, len(walk(root)))
		case "size":
			size := 0
			for _, e := range walk(root) {
				if e.n.has {
					size++
				}
			}
			fmt.Fprintln(out, size)
		}
	}
}
