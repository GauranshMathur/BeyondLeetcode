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
	out      = bufio.NewWriter(os.Stdout)
	commands = map[string]func(args []string){}
)

type step struct {
	group   bool
	options []string
}

// parse splits a pattern into steps: whether it is a group, and the strings the step can match.
func parse(pattern string) []step {
	var steps []step
	i := 0
	for i < len(pattern) {
		if pattern[i] == '(' {
			j := i + strings.IndexByte(pattern[i:], ')')
			steps = append(steps, step{true, strings.Split(pattern[i+1:j], "|")})
			i = j + 1
		} else {
			j := i
			for j < len(pattern) && pattern[j] != '(' {
				j++
			}
			steps = append(steps, step{false, []string{pattern[i:j]}})
			i = j
		}
	}
	return steps
}

func match(args []string) {
	steps := parse(args[0])
	text := args[1]
	var chosen []int // the alternative picked at each group so far
	var do func(s, pos int) bool
	do = func(s, pos int) bool {
		if s == len(steps) {
			return pos == len(text)
		}
		for index, option := range steps[s].options {
			if !strings.HasPrefix(text[pos:], option) {
				continue
			}
			if steps[s].group {
				chosen = append(chosen, index) // choose
			}
			if do(s+1, pos+len(option)) { // explore
				return true
			}
			if steps[s].group {
				chosen = chosen[:len(chosen)-1] // undo
			}
		}
		return false
	}
	if !do(0, 0) {
		fmt.Fprintln(out, "no")
		return
	}
	words := []string{"yes"}
	for _, index := range chosen {
		words = append(words, strconv.Itoa(index))
	}
	fmt.Fprintln(out, strings.Join(words, " "))
}

func init() { commands["match"] = match }

// calls counts the states the search enters, where a state is (step, position).
func calls(steps []step, text string, prune bool) int {
	seen := map[[2]int]bool{}
	count := 0
	var do func(s, pos int) bool
	do = func(s, pos int) bool {
		if prune {
			key := [2]int{s, pos}
			if seen[key] {
				return false // entered before, and the search is still going: it failed
			}
			seen[key] = true
		}
		count++
		if s == len(steps) {
			return pos == len(text)
		}
		for _, option := range steps[s].options {
			if strings.HasPrefix(text[pos:], option) && do(s+1, pos+len(option)) {
				return true
			}
		}
		return false
	}
	do(0, 0)
	return count
}

func cost(args []string) {
	steps := parse(args[0])
	text := args[1]
	fmt.Fprintf(out, "plain %d visited %d\n", calls(steps, text, false), calls(steps, text, true))
}

func init() { commands["cost"] = cost }

type rng struct {
	pkg    string
	lo, hi int
}

var (
	available = map[string][]int{} // package -> its versions
	requires  = map[string][]rng{} // "package version" -> its ranges
	needs     []rng                // asked for by the root
)

func key(name string, version int) string { return name + " " + strconv.Itoa(version) }

func pkg(args []string) {
	versions := []int{}
	for _, v := range args[1:] {
		n, _ := strconv.Atoi(v)
		versions = append(versions, n)
	}
	available[args[0]] = versions
}

func dep(args []string) {
	version, _ := strconv.Atoi(args[1])
	lo, _ := strconv.Atoi(args[3])
	hi, _ := strconv.Atoi(args[4])
	k := key(args[0], version)
	requires[k] = append(requires[k], rng{args[2], lo, hi})
}

func need(args []string) {
	lo, _ := strconv.Atoi(args[1])
	hi, _ := strconv.Atoi(args[2])
	needs = append(needs, rng{args[0], lo, hi})
}

func resolve(args []string) {
	pins := map[string]int{}            // package -> the version chosen for it
	wanted := append([]rng{}, needs...) // a stack of ranges
	var do func() bool
	do = func() bool {
		var todo []string
		seen := map[string]bool{}
		for _, w := range wanted {
			if _, pinned := pins[w.pkg]; !pinned && !seen[w.pkg] {
				seen[w.pkg] = true
				todo = append(todo, w.pkg)
			}
		}
		if len(todo) == 0 {
			return true
		}
		sort.Strings(todo)
		name := todo[0]
		versions := append([]int{}, available[name]...)
		sort.Sort(sort.Reverse(sort.IntSlice(versions)))
		for _, version := range versions {
			fits := true
			for _, w := range wanted {
				if w.pkg == name && (version < w.lo || version > w.hi) {
					fits = false
				}
			}
			if !fits {
				continue
			}
			added := requires[key(name, version)]
			clash := false
			for _, a := range added {
				if v, pinned := pins[a.pkg]; pinned && (v < a.lo || v > a.hi) {
					clash = true
				}
			}
			if clash {
				continue
			}
			pins[name] = version // choose
			wanted = append(wanted, added...)
			if do() { // explore
				return true
			}
			wanted = wanted[:len(wanted)-len(added)] // undo
			delete(pins, name)
		}
		return false
	}
	if !do() {
		fmt.Fprintln(out, "conflict")
		return
	}
	names := []string{}
	for n := range pins {
		names = append(names, n)
	}
	sort.Strings(names)
	words := []string{"ok"}
	for _, n := range names {
		words = append(words, n+"="+strconv.Itoa(pins[n]))
	}
	fmt.Fprintln(out, strings.Join(words, " "))
}

func init() {
	commands["pkg"] = pkg
	commands["dep"] = dep
	commands["need"] = need
	commands["resolve"] = resolve
}

var values []int // the list the commands work on

func load(args []string) {
	values = values[:0]
	for _, a := range args {
		n, _ := strconv.Atoi(a)
		values = append(values, n)
	}
}

func fmtItems(items []int) string {
	words := make([]string, len(items))
	for i, x := range items {
		words[i] = strconv.Itoa(x)
	}
	return "[" + strings.Join(words, " ") + "]"
}

func subsets(args []string) {
	var current []int
	var grow func(start int)
	grow = func(start int) {
		fmt.Fprintln(out, fmtItems(current))
		for i := start; i < len(values); i++ {
			current = append(current, values[i]) // choose
			grow(i + 1)                          // explore
			current = current[:len(current)-1]   // undo
		}
	}
	grow(0)
}

func init() {
	commands["load"] = load
	commands["subsets"] = subsets
}

func perms(args []string) {
	n := len(values)
	size := n
	if len(args) > 0 {
		size, _ = strconv.Atoi(args[0])
	}
	used := make([]bool, n)
	var current []int
	var fill func()
	fill = func() {
		if len(current) == size {
			fmt.Fprintln(out, fmtItems(current))
			return
		}
		for i := 0; i < n; i++ {
			if used[i] {
				continue
			}
			used[i] = true // choose
			current = append(current, values[i])
			fill()                             // explore
			current = current[:len(current)-1] // undo
			used[i] = false
		}
	}
	fill()
}

func init() { commands["perms"] = perms }

func queens(args []string) {
	n, _ := strconv.Atoi(args[0])
	cols := make([]bool, n)     // is this column taken
	diag := make([]bool, 2*n-1) // is this "\" diagonal taken (row + col)
	anti := make([]bool, 2*n-1) // is this "/" diagonal taken (row - col, shifted)
	var placed []int            // the column (from 1) of the queen in each row so far
	var first []int
	count := 0
	var place func(row int)
	place = func(row int) {
		if row == n {
			count++
			if first == nil {
				first = append([]int{}, placed...)
			}
			return
		}
		for c := 0; c < n; c++ {
			if cols[c] || diag[row+c] || anti[row-c+n-1] {
				continue
			}
			cols[c], diag[row+c], anti[row-c+n-1] = true, true, true // choose
			placed = append(placed, c+1)
			place(row + 1)                  // explore
			placed = placed[:len(placed)-1] // undo
			cols[c], diag[row+c], anti[row-c+n-1] = false, false, false
		}
	}
	place(0)
	fmt.Fprintln(out, count)
	if first != nil {
		words := make([]string, len(first))
		for i, c := range first {
			words[i] = strconv.Itoa(c)
		}
		fmt.Fprintln(out, strings.Join(words, " "))
	}
}

func init() { commands["queens"] = queens }

func exact(args []string) {
	ncols, _ := strconv.Atoi(args[0])
	var rows [][]int
	for _, a := range args[1:] {
		var row []int
		for _, c := range strings.Split(a, ",") {
			n, _ := strconv.Atoi(c)
			row = append(row, n)
		}
		rows = append(rows, row)
	}
	covered := make([]bool, ncols+1)
	var chosen []int
	nodes := 0
	var search func()
	search = func() {
		nodes++
		var open []int
		for c := 1; c <= ncols; c++ {
			if !covered[c] {
				open = append(open, c)
			}
		}
		if len(open) == 0 {
			sorted := append([]int{}, chosen...)
			sort.Ints(sorted)
			words := make([]string, len(sorted))
			for i, r := range sorted {
				words[i] = strconv.Itoa(r)
			}
			fmt.Fprintln(out, strings.Join(words, " "))
			return
		}
		var usable []int
		for i, row := range rows {
			free := true
			for _, c := range row {
				if covered[c] {
					free = false
				}
			}
			if free {
				usable = append(usable, i)
			}
		}
		ones := map[int]int{}
		for _, i := range usable {
			for _, c := range rows[i] {
				ones[c]++
			}
		}
		col := open[0] // the column with fewest rows to choose from; the lowest number on a tie
		for _, c := range open {
			if ones[c] < ones[col] {
				col = c
			}
		}
		for _, i := range usable {
			has := false
			for _, c := range rows[i] {
				if c == col {
					has = true
				}
			}
			if !has {
				continue
			}
			for _, c := range rows[i] {
				covered[c] = true // choose
			}
			chosen = append(chosen, i+1)
			search()                        // explore
			chosen = chosen[:len(chosen)-1] // undo
			for _, c := range rows[i] {
				covered[c] = false
			}
		}
	}
	search()
	fmt.Fprintf(out, "nodes %d\n", nodes)
}

func init() { commands["exact"] = exact }

func main() {
	defer out.Flush()
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) == 0 {
			continue
		}
		if run, ok := commands[fields[0]]; ok {
			run(fields[1:])
		}
	}
}
