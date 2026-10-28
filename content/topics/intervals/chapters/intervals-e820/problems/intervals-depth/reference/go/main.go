package main

import (
	"bufio"
	"fmt"
	"os"
	"slices"
	"sort"
	"strconv"
	"strings"
)

var (
	commands = map[string]func(args []int){}
	out      = bufio.NewWriter(os.Stdout)
)

type span struct{ lo, hi int }

var (
	regions []span // merged ranges, sorted, none overlapping or abutting
	covered int    // how many integers the regions hold
)

func fmtSpans(spans []span) string {
	if len(spans) == 0 {
		return "none"
	}
	parts := make([]string, len(spans))
	for i, s := range spans {
		parts[i] = fmt.Sprintf("%d-%d", s.lo, s.hi)
	}
	return strings.Join(parts, " ")
}

// firstReaching is a binary search: the index of the first region whose hi is at least x.
func firstReaching(x int) int {
	return sort.Search(len(regions), func(i int) bool { return regions[i].hi >= x })
}

func placeRange(a, b int) {
	i := firstReaching(a - 1) // the first region that overlaps or abuts [a, b] on the left
	j := i
	for j < len(regions) && regions[j].lo <= b+1 {
		a = min(a, regions[j].lo)
		b = max(b, regions[j].hi)
		covered -= regions[j].hi - regions[j].lo + 1
		j++
	}
	regions = slices.Replace(regions, i, j, span{a, b})
	covered += b - a + 1
}

func init() {
	commands["merged"] = func(args []int) {
		fmt.Fprintln(out, fmtSpans(regions))
	}
}

var (
	ivs   []span // every interval added or placed, in the order they came
	order []span // the intervals sorted by lo; equal lo keep the order they came in
	sub   []int  // sub[m] is the largest hi in the part of order that m is the middle of
	dirty bool   // whether ivs changed since order was built
)

func addInterval(a, b int) {
	ivs = append(ivs, span{a, b})
	dirty = true
	placeRange(a, b)
}

func init() {
	commands["add"] = func(args []int) {
		addInterval(args[0], args[1])
	}
	commands["place"] = func(args []int) {
		addInterval(args[0], args[1])
		fmt.Fprintln(out, len(regions), covered)
	}
}

// build makes the middle item of order[lo:hi] the root of that part and returns its index (-1 if empty).
func build(lo, hi int) int {
	if lo >= hi {
		return -1
	}
	mid := (lo + hi) / 2
	best := order[mid].hi
	for _, child := range []int{build(lo, mid), build(mid+1, hi)} {
		if child >= 0 {
			best = max(best, sub[child])
		}
	}
	sub[mid] = best
	return mid
}

func search(lo, hi, a, b int, found *[]span) {
	if lo >= hi {
		return
	}
	mid := (lo + hi) / 2
	if sub[mid] < a { // nothing in this part reaches a
		return
	}
	search(lo, mid, a, b, found)
	if order[mid].lo <= b { // otherwise this item and everything after it starts too late
		if order[mid].hi >= a {
			*found = append(*found, order[mid])
		}
		search(mid+1, hi, a, b, found)
	}
}

func init() {
	commands["find"] = func(args []int) {
		a, b := args[0], args[1]
		if dirty {
			idx := make([]int, len(ivs))
			for i := range idx {
				idx[i] = i
			}
			// Sort by (lo, position added): equal lo keep the order they were added in.
			sort.Slice(idx, func(x, y int) bool {
				if ivs[idx[x]].lo != ivs[idx[y]].lo {
					return ivs[idx[x]].lo < ivs[idx[y]].lo
				}
				return idx[x] < idx[y]
			})
			order = make([]span, len(ivs))
			for k, i := range idx {
				order[k] = ivs[i]
			}
			sub = make([]int, len(order))
			build(0, len(order))
			dirty = false
		}
		var found []span
		search(0, len(order), a, b, &found)
		fmt.Fprintln(out, fmtSpans(found))
	}
}

func init() {
	commands["depth"] = func(args []int) {
		// Each interval [lo, hi] opens at lo and closes at hi + 1; closes sort before opens at a tie.
		type event struct{ at, step int }
		var events []event
		for _, s := range ivs {
			events = append(events, event{s.lo, 1}, event{s.hi + 1, -1})
		}
		sort.Slice(events, func(i, j int) bool {
			if events[i].at != events[j].at {
				return events[i].at < events[j].at
			}
			return events[i].step < events[j].step
		})
		now, best := 0, 0
		for _, e := range events {
			now += e.step
			best = max(best, now)
		}
		fmt.Fprintln(out, best)
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
		command, ok := commands[fields[0]]
		if !ok {
			continue
		}
		args := make([]int, len(fields)-1)
		for i, f := range fields[1:] {
			args[i], _ = strconv.Atoi(f)
		}
		command(args)
	}
}
