package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

type node struct {
	value       int
	left, right *node
}

var (
	root     *node // the tree the commands work on
	commands = map[string]func(args []string){}
	out      = bufio.NewWriter(os.Stdout)
)

func number(s string) int {
	n, _ := strconv.Atoi(s)
	return n
}

// build reads a tree from tokens in level order. "-" is an absent child.
func build(tokens []string) *node {
	if len(tokens) == 0 || tokens[0] == "-" {
		return nil
	}
	top := &node{value: number(tokens[0])}
	queue := []*node{top}
	pos := 1
	for head := 0; head < len(queue); head++ {
		n := queue[head]
		if pos < len(tokens) {
			token := tokens[pos]
			pos++
			if token != "-" {
				n.left = &node{value: number(token)}
				queue = append(queue, n.left)
			}
		}
		if pos < len(tokens) {
			token := tokens[pos]
			pos++
			if token != "-" {
				n.right = &node{value: number(token)}
				queue = append(queue, n.right)
			}
		}
	}
	return top
}

func heightOf(n *node) int {
	if n == nil {
		return 0
	}
	return 1 + max(heightOf(n.left), heightOf(n.right))
}

func init() {
	commands["show"] = func(args []string) {
		var tokens []string
		queue := []*node{root}
		for head := 0; head < len(queue); head++ {
			n := queue[head]
			if n == nil {
				tokens = append(tokens, "-")
				continue
			}
			tokens = append(tokens, strconv.Itoa(n.value))
			queue = append(queue, n.left, n.right)
		}
		for len(tokens) > 0 && tokens[len(tokens)-1] == "-" {
			tokens = tokens[:len(tokens)-1]
		}
		fmt.Fprintln(out, strings.Join(tokens, " "))
	}
	commands["height"] = func(args []string) {
		fmt.Fprintln(out, heightOf(root))
	}
}

var maxHeight = -1 // the tallest tree `tree` may load; -1 means no limit

// accept makes next the tree, unless it is taller than the limit.
func accept(next *node) {
	if maxHeight >= 0 && heightOf(next) > maxHeight {
		fmt.Fprintln(out, "too deep")
		return
	}
	root = next
}

func init() {
	commands["tree"] = func(args []string) {
		accept(build(args))
	}
	commands["limit"] = func(args []string) {
		if args[0] == "off" {
			maxHeight = -1
		} else {
			maxHeight = number(args[0])
		}
	}
}

func insertValue(value int) {
	if root == nil {
		root = &node{value: value}
		return
	}
	n := root
	for {
		if value < n.value {
			if n.left == nil {
				n.left = &node{value: value}
				return
			}
			n = n.left
		} else if value > n.value {
			if n.right == nil {
				n.right = &node{value: value}
				return
			}
			n = n.right
		} else {
			return // already there
		}
	}
}

func init() {
	commands["insert"] = func(args []string) {
		for _, token := range args {
			insertValue(number(token))
		}
	}
	commands["find"] = func(args []string) {
		value := number(args[0])
		n := root
		visited := 0
		for n != nil {
			visited++
			if value < n.value {
				n = n.left
			} else if value > n.value {
				n = n.right
			} else {
				fmt.Fprintln(out, "found", visited)
				return
			}
		}
		fmt.Fprintln(out, "missing", visited)
	}
}

// isSearchTree reports whether every value below n is above low and below high (nil: no bound).
func isSearchTree(n *node, low, high *int) bool {
	if n == nil {
		return true
	}
	if low != nil && n.value <= *low {
		return false
	}
	if high != nil && n.value >= *high {
		return false
	}
	return isSearchTree(n.left, low, &n.value) && isSearchTree(n.right, &n.value, high)
}

func init() {
	commands["validate"] = func(args []string) {
		if isSearchTree(root, nil, nil) {
			fmt.Fprintln(out, "valid")
		} else {
			fmt.Fprintln(out, "invalid")
		}
	}
}

const maxKeys = 3 // a B-tree node holds at most this many keys

type bnode struct {
	keys     []int
	children []*bnode // empty for a leaf, else one more than keys
}

var btree *bnode

func insertAt[T any](items []T, i int, item T) []T {
	items = append(items, item)
	copy(items[i+1:], items[i:])
	items[i] = item
	return items
}

// btInsert adds key below n. If n splits, it returns the key to move up and the new right node.
func btInsert(n *bnode, key int) (up int, right *bnode) {
	i := 0
	for i < len(n.keys) && n.keys[i] < key {
		i++
	}
	if i < len(n.keys) && n.keys[i] == key {
		return 0, nil
	}
	if len(n.children) > 0 {
		childUp, childRight := btInsert(n.children[i], key)
		if childRight == nil {
			return 0, nil
		}
		n.keys = insertAt(n.keys, i, childUp)
		n.children = insertAt(n.children, i+1, childRight)
	} else {
		n.keys = insertAt(n.keys, i, key)
	}
	if len(n.keys) <= maxKeys {
		return 0, nil
	}
	// Four keys: the second moves up, the first stays, the last two go to a new node.
	up = n.keys[1]
	right = &bnode{keys: append([]int{}, n.keys[2:]...)}
	if len(n.children) > 0 {
		right.children = append([]*bnode{}, n.children[2:]...)
		n.children = n.children[:2]
	}
	n.keys = n.keys[:1]
	return up, right
}

func btAdd(key int) {
	if btree == nil {
		btree = &bnode{keys: []int{key}}
		return
	}
	if up, right := btInsert(btree, key); right != nil {
		btree = &bnode{keys: []int{up}, children: []*bnode{btree, right}}
	}
}

func init() {
	commands["bt"] = func(args []string) {
		switch args[0] {
		case "add":
			for _, token := range args[1:] {
				btAdd(number(token))
			}
		case "show":
			var level []*bnode
			if btree != nil {
				level = []*bnode{btree}
			}
			for len(level) > 0 {
				var parts []string
				var next []*bnode
				for _, n := range level {
					keys := make([]string, len(n.keys))
					for i, k := range n.keys {
						keys[i] = strconv.Itoa(k)
					}
					parts = append(parts, "["+strings.Join(keys, " ")+"]")
					next = append(next, n.children...)
				}
				fmt.Fprintln(out, strings.Join(parts, " "))
				level = next
			}
		case "find":
			key := number(args[1])
			n := btree
			read := 0
			for n != nil {
				read++
				i := 0
				for i < len(n.keys) && n.keys[i] < key {
					i++
				}
				if i < len(n.keys) && n.keys[i] == key {
					fmt.Fprintln(out, "found", read)
					return
				}
				if len(n.children) == 0 {
					break
				}
				n = n.children[i]
			}
			fmt.Fprintln(out, "missing", read)
		}
	}
}

func init() {
	commands["walk"] = func(args []string) {
		order := args[0]
		var values []string
		var visit func(n *node)
		visit = func(n *node) {
			if n == nil {
				return
			}
			if order == "pre" {
				values = append(values, strconv.Itoa(n.value))
			}
			visit(n.left)
			if order == "in" {
				values = append(values, strconv.Itoa(n.value))
			}
			visit(n.right)
			if order == "post" {
				values = append(values, strconv.Itoa(n.value))
			}
		}
		visit(root)
		fmt.Fprintln(out, strings.Join(values, " "))
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
		if command, ok := commands[fields[0]]; ok {
			command(fields[1:])
		}
	}
}
