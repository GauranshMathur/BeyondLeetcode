package main

import (
	"bufio"
	"fmt"
	"os"
	"slices"
	"strings"
)

var (
	names    []string                // every node, in the order it first appeared
	out      = map[string][]string{} // node -> the nodes it has an edge to, in the order added
	commands = map[string]func(args []string){}
	printer  = bufio.NewWriter(os.Stdout)
)

func addNode(name string) {
	if _, ok := out[name]; !ok {
		out[name] = []string{}
		names = append(names, name)
	}
}

func edgeCount() int {
	total := 0
	for _, targets := range out {
		total += len(targets)
	}
	return total
}

func init() {
	commands["clear"] = func(args []string) {
		names = nil
		clear(out)
	}
	commands["edge"] = func(args []string) {
		a, b := args[0], args[1]
		addNode(a)
		addNode(b)
		if slices.Contains(out[a], b) {
			return // a repeated edge changes nothing
		}
		out[a] = append(out[a], b)
	}
	commands["out"] = func(args []string) {
		fmt.Fprintln(printer, strings.Join(out[args[0]], " "))
	}
	commands["has"] = func(args []string) {
		if slices.Contains(out[args[0]], args[1]) {
			fmt.Fprintln(printer, "yes")
		} else {
			fmt.Fprintln(printer, "no")
		}
	}
	commands["count"] = func(args []string) {
		fmt.Fprintln(printer, len(names), edgeCount())
	}
}

func init() {
	commands["matrix"] = func(args []string) {
		for _, a := range names {
			targets := map[string]bool{}
			for _, t := range out[a] {
				targets[t] = true
			}
			row := make([]string, len(names))
			for i, b := range names {
				row[i] = "0"
				if targets[b] {
					row[i] = "1"
				}
			}
			fmt.Fprintln(printer, strings.Join(row, " "))
		}
	}
	commands["cells"] = func(args []string) {
		v := len(names)
		fmt.Fprintln(printer, v+edgeCount(), v*v)
	}
}

// shortestPath returns the nodes of a path with the fewest edges from start to goal, or nil.
func shortestPath(start, goal string) []string {
	if _, ok := out[start]; !ok {
		return nil
	}
	if _, ok := out[goal]; !ok {
		return nil
	}
	cameFrom := map[string]string{}
	seen := map[string]bool{start: true}
	queue := []string{start}
	for head := 0; head < len(queue) && !seen[goal]; head++ {
		u := queue[head]
		for _, v := range out[u] {
			if !seen[v] {
				seen[v] = true
				cameFrom[v] = u
				queue = append(queue, v)
			}
		}
	}
	if !seen[goal] {
		return nil
	}
	route := []string{goal}
	for node := goal; node != start; {
		node = cameFrom[node]
		route = append(route, node)
	}
	slices.Reverse(route)
	return route
}

func init() {
	commands["path"] = func(args []string) {
		route := shortestPath(args[0], args[1])
		if route == nil {
			fmt.Fprintln(printer, "none")
		} else {
			fmt.Fprintln(printer, strings.Join(route, " "))
		}
	}
}

func init() {
	commands["would"] = func(args []string) {
		a, b := args[0], args[1]
		if a == b {
			fmt.Fprintln(printer, "cycle", a, a)
			return
		}
		route := shortestPath(b, a)
		if route == nil {
			fmt.Fprintln(printer, "safe")
		} else {
			fmt.Fprintln(printer, "cycle "+a+" "+strings.Join(route, " "))
		}
	}
}

func main() {
	defer printer.Flush()
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
