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
