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
	isMap bool // set once the node has held more than 8 children
}

func newNode() *node { return &node{kids: map[byte]*node{}} }

var root = newNode()

// A routeNode is a node of the route table: a trie over the 32 bits of an address, one bit per level.
type routeNode struct {
	kids [2]*routeNode
	text string
	has  bool
}

var routeRoot = &routeNode{}

// A routerNode is a node of the router: a trie over path segments. A wildcard child has the key "{}".
type routerNode struct {
	kids  map[string]*routerNode
	value string
	has   bool
	names []string
}

var routerRoot = &routerNode{kids: map[string]*routerNode{}}

func add(key string, value int) {
	n := root
	for i := 0; i < len(key); i++ {
		next, ok := n.kids[key[i]]
		if !ok {
			next = newNode()
			n.kids[key[i]] = next
			if len(n.kids) > 8 {
				n.isMap = true
			}
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

// compressedNodes counts the nodes left when each chain of single-child, non-key nodes shares one node.
func compressedNodes() int {
	absorbed := 0
	all := walk(root)
	for _, e := range all {
		if len(e.n.kids) == 1 {
			for _, child := range e.n.kids {
				if len(child.kids) == 1 && !child.has {
					absorbed++
				}
			}
		}
	}
	return len(all) - absorbed
}

func parseCidr(text string) (uint32, int) {
	parts := strings.Split(text, "/")
	var address uint32
	for _, octet := range strings.Split(parts[0], ".") {
		v, _ := strconv.Atoi(octet)
		address = address<<8 | uint32(v)
	}
	length, _ := strconv.Atoi(parts[1])
	return address, length
}

func route(out *bufio.Writer, text, value string) {
	address, length := parseCidr(text)
	if length < 32 && address&(uint32(1)<<(32-length)-1) != 0 {
		fmt.Fprintln(out, "error")
		return
	}
	n := routeRoot
	for i := 0; i < length; i++ {
		bit := (address >> (31 - i)) & 1
		if n.kids[bit] == nil {
			n.kids[bit] = &routeNode{}
		}
		n = n.kids[bit]
	}
	n.text = text + " " + value
	n.has = true
}

func match(out *bufio.Writer, text string) {
	address, _ := parseCidr(text + "/32")
	n := routeRoot
	best, found := n.text, n.has
	for i := 0; i < 32; i++ {
		n = n.kids[(address>>(31-i))&1]
		if n == nil {
			break
		}
		if n.has {
			best, found = n.text, true
		}
	}
	if found {
		fmt.Fprintln(out, best)
	} else {
		fmt.Fprintln(out, "none")
	}
}

func shape(out *bufio.Writer) {
	slices, maps := 0, 0
	for _, e := range walk(root) {
		if e.n.isMap {
			maps++
		} else if len(e.n.kids) > 0 {
			slices++
		}
	}
	fmt.Fprintln(out, slices, maps)
}

func segments(path string) []string {
	if path == "/" {
		return nil
	}
	return strings.Split(path[1:], "/")
}

func handle(out *bufio.Writer, pattern, value string) {
	n := routerRoot
	var names []string
	for _, seg := range segments(pattern) {
		if strings.HasPrefix(seg, "{") {
			names = append(names, seg[1:len(seg)-1])
			seg = "{}"
		}
		next, ok := n.kids[seg]
		if !ok {
			next = &routerNode{kids: map[string]*routerNode{}}
			n.kids[seg] = next
		}
		n = next
	}
	if n.has {
		fmt.Fprintln(out, "conflict")
		return
	}
	n.value, n.has, n.names = value, true, names
}

// search returns the first match, trying a literal before a wildcard at every segment.
func search(n *routerNode, segs []string, i int, seen []string) (*routerNode, []string) {
	if i == len(segs) {
		if n.has {
			return n, seen
		}
		return nil, nil
	}
	if literal, ok := n.kids[segs[i]]; ok {
		if found, caps := search(literal, segs, i+1, seen); found != nil {
			return found, caps
		}
	}
	if wild, ok := n.kids["{}"]; ok {
		return search(wild, segs, i+1, append(append([]string{}, seen...), segs[i]))
	}
	return nil, nil
}

func serve(out *bufio.Writer, path string) {
	found, seen := search(routerRoot, segments(path), 0, nil)
	if found == nil {
		fmt.Fprintln(out, "404")
		return
	}
	fields := []string{found.value}
	for i, name := range found.names {
		fields = append(fields, name+"="+seen[i])
	}
	fmt.Fprintln(out, strings.Join(fields, " "))
}

type keyValue struct {
	key   string
	value int
}

func keysUnder(prefix string) []keyValue {
	start := find(prefix)
	if start == nil {
		return nil
	}
	var found []keyValue
	for _, e := range walk(start) {
		if e.n.has {
			found = append(found, keyValue{prefix + e.key, e.n.value})
		}
	}
	return found
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
		case "rnodes":
			fmt.Fprintln(out, compressedNodes())
		case "route":
			route(out, parts[1], parts[2])
		case "match":
			match(out, parts[1])
		case "shape":
			shape(out)
		case "handle":
			handle(out, parts[1], parts[2])
		case "serve":
			serve(out, parts[1])
		case "list", "count":
			prefix := ""
			if len(parts) > 1 {
				prefix = parts[1]
			}
			found := keysUnder(prefix)
			if parts[0] == "count" {
				fmt.Fprintln(out, len(found))
			} else if len(found) == 0 {
				fmt.Fprintln(out, "none")
			} else {
				keys := make([]string, len(found))
				for i, kv := range found {
					keys[i] = kv.key
				}
				fmt.Fprintln(out, strings.Join(keys, " "))
			}
		}
	}
}
