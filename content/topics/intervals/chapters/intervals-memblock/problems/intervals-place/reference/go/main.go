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

func init() {
	commands["add"] = func(args []int) {
		placeRange(args[0], args[1])
	}
	commands["place"] = func(args []int) {
		placeRange(args[0], args[1])
		fmt.Fprintln(out, len(regions), covered)
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
