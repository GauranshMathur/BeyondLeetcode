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

func init() {
	commands["trace"] = func(args []string) {
		c := lcsTable()
		i, j := len(first), len(second)
		var picked []byte // the common letters, last one first
		for i > 0 && j > 0 {
			if first[i-1] == second[j-1] {
				picked = append(picked, first[i-1])
				i--
				j--
			} else if c[i-1][j] >= c[i][j-1] {
				i--
			} else {
				j--
			}
		}
		for l, r := 0, len(picked)-1; l < r; l, r = l+1, r-1 {
			picked[l], picked[r] = picked[r], picked[l]
		}
		fmt.Fprintln(out, showWord(string(picked)))
	}
}

var grid [][]int // the energy grid, one slice per row

func init() {
	commands["grid"] = func(args []string) {
		rows, cols := num(args[0]), num(args[1])
		grid = make([][]int, rows)
		for r := range grid {
			grid[r] = make([]int, cols)
			for c := range grid[r] {
				grid[r][c] = num(args[2+r*cols+c])
			}
		}
	}
}

func init() {
	commands["seam"] = func(args []string) {
		m := make([][]int, len(grid)) // m[y][x]: the cheapest seam from the top row down to cell (y, x)
		m[0] = append([]int(nil), grid[0]...)
		for y := 1; y < len(grid); y++ {
			m[y] = make([]int, len(grid[y]))
			for x := range grid[y] {
				best := m[y-1][x]
				for k := max(0, x-1); k <= min(len(grid[y])-1, x+1); k++ {
					best = min(best, m[y-1][k])
				}
				m[y][x] = grid[y][x] + best
			}
		}
		best := m[len(m)-1][0]
		for _, v := range m[len(m)-1] {
			best = min(best, v)
		}
		fmt.Fprintln(out, best)
	}
}

const mod = 1_000_000_007

func init() {
	commands["ties"] = func(args []string) {
		cost := make([][]int, len(grid))  // cost[y][x]: the cheapest seam from the top row down to cell (y, x)
		count := make([][]int, len(grid)) // count[y][x]: how many different seams have that cost
		for y := range grid {
			cost[y] = append([]int(nil), grid[y]...)
			count[y] = make([]int, len(grid[y]))
			for x := range count[y] {
				count[y][x] = 1
			}
		}
		for y := 1; y < len(grid); y++ {
			for x := range grid[y] {
				lo, hi := max(0, x-1), min(len(grid[y])-1, x+1)
				low := cost[y-1][x]
				for k := lo; k <= hi; k++ {
					low = min(low, cost[y-1][k])
				}
				cost[y][x] = grid[y][x] + low
				total := 0
				for k := lo; k <= hi; k++ {
					if cost[y-1][k] == low {
						total = (total + count[y-1][k]) % mod
					}
				}
				count[y][x] = total
			}
		}
		last := len(grid) - 1
		low := cost[last][0]
		for _, v := range cost[last] {
			low = min(low, v)
		}
		total := 0
		for x, v := range cost[last] {
			if v == low {
				total = (total + count[last][x]) % mod
			}
		}
		fmt.Fprintln(out, total)
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
