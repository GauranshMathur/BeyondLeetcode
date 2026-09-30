package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

func main() {
	var items []int
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) == 0 {
			continue
		}
		switch fields[0] {
		case "insert":
			n, _ := strconv.Atoi(fields[1])
			items = append(items, n)
		case "min":
			m := items[0]
			for _, x := range items {
				if x < m {
					m = x
				}
			}
			fmt.Println(m)
		}
	}
}
