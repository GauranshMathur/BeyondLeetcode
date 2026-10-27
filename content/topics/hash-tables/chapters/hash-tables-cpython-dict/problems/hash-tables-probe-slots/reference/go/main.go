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
	impl     = "cpython"
	resizeOn = false
	moved    = 0

	// CPython-style table: slots holds empty, dummy or an index into entries.
	slots   = filled(8)
	entries []*node // in insertion order; nil once deleted
	used    = 0

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


func makeTable(n int) {
	moved = 0
	if impl == "cpython" {
		slots = filled(n)
		entries = nil
		used = 0
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
		case "get":
			k := parseKey(arg(1))
			if impl == "cpython" {
				if _, ix, _ := cpFind(k.num); ix >= 0 {
					fmt.Fprintln(out, entries[ix].value)
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
		case "len":
			if impl == "cpython" {
				fmt.Fprintln(out, used)
			}
		case "cap":
			if impl == "cpython" {
				fmt.Fprintln(out, len(slots))
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
		}
	}
}
