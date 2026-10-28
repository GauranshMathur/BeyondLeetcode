package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

var (
	commands = map[string]func(args []string){}
	out      = bufio.NewWriter(os.Stdout)
)

func num(s string) int {
	v, _ := strconv.Atoi(s)
	return v
}

var first, second string // the two words the commands work on

func word(s string) string {
	if s == "-" {
		return "" // an empty word is written -
	}
	return s
}

func showWord(s string) string {
	if s == "" {
		return "-"
	}
	return s
}

func init() {
	commands["words"] = func(args []string) {
		first, second = word(args[0]), word(args[1])
	}
	commands["show"] = func(args []string) {
		fmt.Fprintln(out, showWord(first), showWord(second))
	}
}

func lcsTable() [][]int {
	// c[i][j]: length of the longest common subsequence of the first i letters of first and the first j of second
	c := make([][]int, len(first)+1)
	for i := range c {
		c[i] = make([]int, len(second)+1)
	}
	for i := 1; i <= len(first); i++ {
		for j := 1; j <= len(second); j++ {
			if first[i-1] == second[j-1] {
				c[i][j] = c[i-1][j-1] + 1
			} else {
				c[i][j] = max(c[i-1][j], c[i][j-1])
			}
		}
	}
	return c
}

func init() {
	commands["common"] = func(args []string) {
		fmt.Fprintln(out, lcsTable()[len(first)][len(second)])
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
		if command, ok := commands[fields[0]]; ok {
			command(fields[1:])
		}
	}
}
