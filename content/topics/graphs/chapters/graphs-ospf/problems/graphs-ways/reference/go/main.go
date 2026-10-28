package main

import (
	"bufio"
	"container/heap"
	"fmt"
	"os"
	"slices"
	"strconv"
	"strings"
)

var (
	names          []string                // every node, in the order it first appeared
	out            = map[string][]string{} // node -> the nodes it has an edge to, in the order added
	weight         = map[[2]string]int{}   // (from, to) -> the weight of that edge
	parents        = map[string]string{}   // union-find: node -> its parent; a root is its own parent
	ranks          = map[string]int{}      // union-find: root -> an upper bound on its tree's height
	redundantEdges []string                // edges whose two ends were already in one group when added
	commands       = map[string]func(args []string){}
	printer        = bufio.NewWriter(os.Stdout)
)

func addNode(name string) {
	if _, ok := out[name]; !ok {
		out[name] = []string{}
		names = append(names, name)
		parents[name] = name
		ranks[name] = 0
	}
}

// find returns the root of x's group. Each step makes x point at its grandparent (path halving).
func find[K comparable](parent map[K]K, x K) K {
	for parent[x] != x {
		parent[x] = parent[parent[x]]
		x = parent[x]
	}
	return x
}

// union merges the groups of a and b, the lower tree under the higher. False if already one group.
func union[K comparable](parent map[K]K, rank map[K]int, a, b K) bool {
	rootA, rootB := find(parent, a), find(parent, b)
	if rootA == rootB {
		return false
	}
	if rank[rootA] < rank[rootB] {
		rootA, rootB = rootB, rootA
	}
	parent[rootB] = rootA
	if rank[rootA] == rank[rootB] {
		rank[rootA]++
	}
	return true
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
		clear(weight)
		clear(parents)
		clear(ranks)
		redundantEdges = nil
	}
	commands["edge"] = func(args []string) {
		a, b := args[0], args[1]
		addNode(a)
		addNode(b)
		w := 1
		if len(args) > 2 {
			w, _ = strconv.Atoi(args[2])
		}
		if slices.Contains(out[a], b) {
			weight[[2]string{a, b}] = min(weight[[2]string{a, b}], w) // a repeated edge keeps the lighter weight
			return
		}
		weight[[2]string{a, b}] = w
		out[a] = append(out[a], b)
		if !union(parents, ranks, a, b) {
			redundantEdges = append(redundantEdges, a+"-"+b)
		}
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
	commands["dfs"] = func(args []string) {
		if _, ok := out[args[0]]; !ok {
			fmt.Fprintln(printer)
			return
		}
		seen := map[string]bool{}
		var visited []string
		stack := []string{args[0]}
		for len(stack) > 0 {
			u := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			if seen[u] {
				continue
			}
			seen[u] = true
			visited = append(visited, u)
			targets := out[u]
			for i := len(targets) - 1; i >= 0; i-- { // backwards, so the first edge is explored first
				if !seen[targets[i]] {
					stack = append(stack, targets[i])
				}
			}
		}
		fmt.Fprintln(printer, strings.Join(visited, " "))
	}
}

func inDegrees() map[string]int {
	degree := map[string]int{}
	for _, u := range names {
		degree[u] = 0
	}
	for _, u := range names {
		for _, v := range out[u] {
			degree[v]++
		}
	}
	return degree
}

// nameHeap is a min-heap of names, so the smallest ready name comes out first.
type nameHeap []string

func (h nameHeap) Len() int           { return len(h) }
func (h nameHeap) Less(i, j int) bool { return h[i] < h[j] }
func (h nameHeap) Swap(i, j int)      { h[i], h[j] = h[j], h[i] }
func (h *nameHeap) Push(x any)        { *h = append(*h, x.(string)) }
func (h *nameHeap) Pop() any {
	old := *h
	last := old[len(old)-1]
	*h = old[:len(old)-1]
	return last
}

func init() {
	commands["order"] = func(args []string) {
		degree := inDegrees()
		ready := &nameHeap{}
		for _, n := range names {
			if degree[n] == 0 {
				heap.Push(ready, n)
			}
		}
		var built []string
		for ready.Len() > 0 {
			u := heap.Pop(ready).(string)
			built = append(built, u)
			for _, v := range out[u] {
				degree[v]--
				if degree[v] == 0 {
					heap.Push(ready, v)
				}
			}
		}
		if len(built) < len(names) {
			fmt.Fprintln(printer, "cycle")
		} else {
			fmt.Fprintln(printer, strings.Join(built, " "))
		}
	}
}

func init() {
	commands["waves"] = func(args []string) {
		degree := inDegrees()
		var wave []string
		for _, n := range names {
			if degree[n] == 0 {
				wave = append(wave, n)
			}
		}
		slices.Sort(wave)
		built := 0
		for len(wave) > 0 {
			fmt.Fprintln(printer, strings.Join(wave, " "))
			built += len(wave)
			var following []string
			for _, u := range wave {
				for _, v := range out[u] {
					degree[v]--
					if degree[v] == 0 {
						following = append(following, v)
					}
				}
			}
			slices.Sort(following)
			wave = following
		}
		if built < len(names) {
			fmt.Fprintln(printer, "cycle")
		}
	}
}

func init() {
	commands["same"] = func(args []string) {
		a, b := args[0], args[1]
		_, knownA := parents[a]
		_, knownB := parents[b]
		if knownA && knownB && find(parents, a) == find(parents, b) {
			fmt.Fprintln(printer, "yes")
		} else {
			fmt.Fprintln(printer, "no")
		}
	}
	commands["groups"] = func(args []string) {
		roots := 0
		for _, n := range names {
			if parents[n] == n {
				roots++
			}
		}
		fmt.Fprintln(printer, roots)
	}
}

func init() {
	commands["redundant"] = func(args []string) {
		if len(redundantEdges) == 0 {
			fmt.Fprintln(printer, "none")
		} else {
			fmt.Fprintln(printer, strings.Join(redundantEdges, " "))
		}
	}
}

// distItem is a node waiting in the heap with the total weight of the path that reached it.
type distItem struct {
	d    int
	name string
}

// distHeap is a min-heap of distItems by d.
type distHeap []distItem

func (h distHeap) Len() int           { return len(h) }
func (h distHeap) Less(i, j int) bool { return h[i].d < h[j].d }
func (h distHeap) Swap(i, j int)      { h[i], h[j] = h[j], h[i] }
func (h *distHeap) Push(x any)        { *h = append(*h, x.(distItem)) }
func (h *distHeap) Pop() any {
	old := *h
	last := old[len(old)-1]
	*h = old[:len(old)-1]
	return last
}

// search is Dijkstra from start: the lowest total weight to every node it can reach.
// paths counts the cheapest paths to each of those nodes.
func search(start string) (dist map[string]int, paths map[string]int) {
	paths = map[string]int{start: 1}
	dist = map[string]int{start: 0}
	pending := &distHeap{{0, start}}
	for pending.Len() > 0 {
		item := heap.Pop(pending).(distItem)
		d, u := item.d, item.name
		if d > dist[u] {
			continue // a stale entry: u was reached more cheaply after this was pushed
		}
		for _, v := range out[u] {
			nd := d + weight[[2]string{u, v}]
			if known, seen := dist[v]; !seen || nd < known {
				dist[v] = nd
				paths[v] = paths[u]
				heap.Push(pending, distItem{nd, v})
			} else if nd == known {
				paths[v] += paths[u]
			}
		}
	}
	return
}

func init() {
	commands["cost"] = func(args []string) {
		a, b := args[0], args[1]
		if _, ok := out[a]; !ok {
			fmt.Fprintln(printer, "none")
			return
		}
		dist, _ := search(a)
		if d, ok := dist[b]; ok {
			fmt.Fprintln(printer, d)
		} else {
			fmt.Fprintln(printer, "none")
		}
	}
}

func init() {
	commands["ways"] = func(args []string) {
		a, b := args[0], args[1]
		_, knownA := out[a]
		_, knownB := out[b]
		if !knownA || !knownB {
			fmt.Fprintln(printer, 0)
			return
		}
		_, paths := search(a)
		fmt.Fprintln(printer, paths[b])
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
