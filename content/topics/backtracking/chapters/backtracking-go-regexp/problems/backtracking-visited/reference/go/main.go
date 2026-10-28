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
