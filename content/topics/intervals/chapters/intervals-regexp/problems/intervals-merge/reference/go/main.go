package main

import (
	"bufio"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
)

var (
	commands = map[string]func(args []int){}
	out      = bufio.NewWriter(os.Stdout)
)

type span struct{ lo, hi int }

var ivs []span // every interval added so far

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

// mergeAll sorts by start, then folds each interval into the last range when it overlaps or abuts it.
func mergeAll() []span {
	sorted := append([]span{}, ivs...)
	sort.Slice(sorted, func(i, j int) bool {
		if sorted[i].lo != sorted[j].lo {
			return sorted[i].lo < sorted[j].lo
		}
		return sorted[i].hi < sorted[j].hi
	})
	var merged []span
	for _, s := range sorted {
		if n := len(merged); n > 0 && s.lo <= merged[n-1].hi+1 {
			merged[n-1].hi = max(merged[n-1].hi, s.hi)
		} else {
			merged = append(merged, s)
		}
	}
	return merged
}

func init() {
	commands["add"] = func(args []int) {
		ivs = append(ivs, span{args[0], args[1]})
	}
	commands["merged"] = func(args []int) {
		fmt.Fprintln(out, fmtSpans(mergeAll()))
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
