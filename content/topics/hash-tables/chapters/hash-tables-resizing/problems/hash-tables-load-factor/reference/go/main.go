package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

const (
	empty = -1
	dummy = -2
)

// A key is an integer or, from the String hash Problem on, a string.
type key struct {
	text  string
	isStr bool
	num   int
}

type node struct {
	key   key
	value int
}

var (
	impl = "cpython"
	resizeOn = false
	moved    = 0

	// CPython-style table: slots holds empty, dummy or an index into entries.
	slots   = filled(8)
	entries []*node // in insertion order; nil once deleted
	used    = 0

	// Java-style table: one list of nodes per bin.
	bins  = make([][]*node, 16)
	nodes = 0
	isTree = make([]bool, 16)
)

func filled(n int) []int {
	s := make([]int, n)
	for i := range s {
		s[i] = empty
	}
	return s
}

func parseKey(token string) key {
	n, _ := strconv.Atoi(token)
	return key{num: n}
}

// javaHash is the key's hash code as an unsigned 32-bit number.
func javaHash(k key) uint32 {
	return uint32(k.num)
}

func spread(h uint32) uint32 {
	return h ^ (h >> 16)
}

func keyText(k key) string {
	if k.isStr {
		return k.text
	}
	return strconv.Itoa(k.num)
}

func binIndex(k key) int {
	return int(uint32(len(bins)-1) & spread(javaHash(k)))
}

func makeTable(n int) {
	moved = 0
	nodes = 0
	if impl == "cpython" {
		slots = filled(n)
		entries = nil
		used = 0
	}
	if impl != "cpython" {
		bins = make([][]*node, n)
		isTree = make([]bool, n)
	}
}

// ---- CPython-style open addressing ----

// nextSlot is the recurrence from the Chapter.
func nextSlot(i, perturb int) (int, int) {
	perturb >>= 5
	return (i*5 + perturb + 1) & (len(slots) - 1), perturb
}

// cpFind returns the slot, the entry index (or -1) and how many slots it examined.
func cpFind(k int) (int, int, int) {
	i := k & (len(slots) - 1)
	perturb := k
	examined := 1
	for {
		ix := slots[i]
		if ix == empty {
			return i, -1, examined
		}
		if ix >= 0 && entries[ix].key.num == k {
			return i, ix, examined
		}
		i, perturb = nextSlot(i, perturb)
		examined++
	}
}


func cpPut(k, value int) int {
	i, ix, _ := cpFind(k)
	if ix >= 0 {
		entries[ix].value = value
		return i
	}
	j := k & (len(slots) - 1)
	perturb := k
	for slots[j] >= 0 {
		j, perturb = nextSlot(j, perturb)
	}
	slots[j] = len(entries)
	entries = append(entries, &node{key{num: k}, value})
	used++
	return j
}

func cpDel(k int) bool {
	i, ix, _ := cpFind(k)
	if ix < 0 {
		return false
	}
	slots[i] = dummy
	entries[ix] = nil
	used--
	return true
}


// ---- Java-style chaining ----

func jbResize() {
	oldCap := len(bins)
	newBins := make([][]*node, oldCap*2)
	newTree := make([]bool, oldCap*2)
	for j, chain := range bins {
		var lo, hi []*node
		for _, n := range chain {
			if int(spread(javaHash(n.key)))&oldCap == 0 {
				lo = append(lo, n)
			} else {
				hi = append(hi, n)
			}
		}
		newBins[j] = lo
		newTree[j] = isTree[j] && len(lo) > 6
		newBins[j+oldCap] = hi
		newTree[j+oldCap] = isTree[j] && len(hi) > 6
		moved += len(chain)
	}
	bins = newBins
	isTree = newTree
}


func jbPut(k key, value int) int {
	index := binIndex(k)
	for _, n := range bins[index] {
		if n.key == k {
			n.value = value
			return index
		}
	}
	bins[index] = append(bins[index], &node{k, value})
	nodes++
	if !isTree[index] && len(bins[index]) >= 9 {
		if len(bins) < 64 {
			jbResize()
		} else {
			isTree[index] = true
		}
	}
	if resizeOn && nodes > len(bins)*3/4 {
		jbResize()
	}
	return binIndex(k)
}

// jbFind returns the node (or nil) and how many nodes the lookup visited.
func jbFind(k key) (*node, int) {
	chain := bins[binIndex(k)]
	for visited, n := range chain {
		if n.key == k {
			return n, visited + 1
		}
	}
	return nil, len(chain)
}


func main() {
	out := bufio.NewWriter(os.Stdout)
	defer out.Flush()
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		parts := strings.Fields(scanner.Text())
		if len(parts) == 0 {
			continue
		}
		arg := func(i int) string { return parts[i] }
		num := func(i int) int { n, _ := strconv.Atoi(parts[i]); return n }
		switch parts[0] {
		case "table":
			makeTable(num(1))
		case "put":
			k := parseKey(arg(1))
			if impl == "cpython" {
				fmt.Fprintln(out, cpPut(k.num, num(2)))
			}
			if impl != "cpython" {
				fmt.Fprintln(out, jbPut(k, num(2)))
			}
		case "get":
			k := parseKey(arg(1))
			if impl == "cpython" {
				if _, ix, _ := cpFind(k.num); ix >= 0 {
					fmt.Fprintln(out, entries[ix].value)
				} else {
					fmt.Fprintln(out, "error")
				}
			}
			if impl != "cpython" {
				if n, _ := jbFind(k); n != nil {
					fmt.Fprintln(out, n.value)
				} else {
					fmt.Fprintln(out, "error")
				}
			}
		case "probes":
			k := parseKey(arg(1))
			if impl == "cpython" {
				_, _, examined := cpFind(k.num)
				fmt.Fprintln(out, examined)
			}
			if impl != "cpython" {
				_, visited := jbFind(k)
				fmt.Fprintln(out, visited)
			}
		case "len":
			if impl == "cpython" {
				fmt.Fprintln(out, used)
			}
			if impl != "cpython" {
				fmt.Fprintln(out, nodes)
			}
		case "cap":
			if impl == "cpython" {
				fmt.Fprintln(out, len(slots))
			}
			if impl != "cpython" {
				fmt.Fprintln(out, len(bins))
			}
		case "dump":
			if impl == "cpython" {
				cells := make([]string, len(slots))
				for i, ix := range slots {
					switch ix {
					case empty:
						cells[i] = "."
					case dummy:
						cells[i] = "x"
					default:
						cells[i] = strconv.Itoa(entries[ix].key.num)
					}
				}
				fmt.Fprintln(out, strings.Join(cells, " "))
			}
			if impl != "cpython" {
				for index, chain := range bins {
					if len(chain) == 0 {
						continue
					}
					if isTree[index] {
						fmt.Fprintf(out, "%d: tree %d\n", index, len(chain))
						continue
					}
					names := make([]string, len(chain))
					for i, n := range chain {
						names[i] = keyText(n.key)
					}
					fmt.Fprintf(out, "%d: %s\n", index, strings.Join(names, " "))
				}
			}
		case "del":
			if cpDel(parseKey(arg(1)).num) {
				fmt.Fprintln(out, "ok")
			} else {
				fmt.Fprintln(out, "error")
			}
		case "indices":
			cells := make([]string, len(slots))
			for i, ix := range slots {
				switch ix {
				case empty:
					cells[i] = "."
				case dummy:
					cells[i] = "x"
				default:
					cells[i] = strconv.Itoa(ix)
				}
			}
			fmt.Fprintln(out, strings.Join(cells, " "))
		case "keys":
			var names []string
			for _, e := range entries {
				if e != nil {
					names = append(names, strconv.Itoa(e.key.num))
				}
			}
			fmt.Fprintln(out, strings.Join(names, " "))
		case "nentries":
			fmt.Fprintln(out, len(entries))
		case "impl":
			impl = arg(1)
			if impl == "cpython" {
				makeTable(8)
			} else {
				makeTable(16)
			}
		case "bin":
			fmt.Fprintln(out, binIndex(parseKey(arg(1))))
		case "longest":
			longest := 0
			for _, c := range bins {
				if len(c) > longest {
					longest = len(c)
				}
			}
			fmt.Fprintln(out, longest)
		case "trees":
			count := 0
			for _, t := range isTree {
				if t {
					count++
				}
			}
			fmt.Fprintln(out, count)
		case "resize":
			resizeOn = arg(1) == "on"
		case "moved":
			fmt.Fprintln(out, moved)
		}
	}
}
