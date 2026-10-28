package main

import (
	"bufio"
	"fmt"
	"os"
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

func find(args []string) {
	word, rows := args[0], args[1:]
	used := make([][]bool, len(rows))
	for r := range rows {
		used[r] = make([]bool, len(rows[r]))
	}
	var path []string
	moves := [][2]int{{-1, 0}, {0, 1}, {1, 0}, {0, -1}} // up, right, down, left
	var walk func(r, c, k int) bool
	walk = func(r, c, k int) bool {
		if used[r][c] || rows[r][c] != word[k] {
			return false
		}
		used[r][c] = true // choose
		path = append(path, strconv.Itoa(r)+":"+strconv.Itoa(c))
		if k == len(word)-1 {
			return true
		}
		for _, m := range moves {
			nr, nc := r+m[0], c+m[1]
			if nr >= 0 && nr < len(rows) && nc >= 0 && nc < len(rows[nr]) && walk(nr, nc, k+1) { // explore
				return true
			}
		}
		path = path[:len(path)-1] // undo
		used[r][c] = false
		return false
	}
	for r := range rows {
		for c := range rows[r] {
			if walk(r, c, 0) {
				fmt.Fprintln(out, "yes "+strings.Join(path, " "))
				return
			}
		}
	}
	fmt.Fprintln(out, "no")
}

func init() { commands["find"] = find }

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
