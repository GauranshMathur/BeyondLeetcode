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
		case "push":
			n, _ := strconv.Atoi(fields[1])
			items = append(items, n)
		case "size":
			fmt.Println(len(items))
		case "pop":
			fmt.Println(items[len(items)-1])
			items = items[:len(items)-1]
		}
	}
}
