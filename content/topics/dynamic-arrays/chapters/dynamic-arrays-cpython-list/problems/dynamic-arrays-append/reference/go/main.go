package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

var (
	block  []int // a fixed-size block of slots; its size is the capacity
	length int   // how many slots are in use
)

// nextCap is the capacity of the block that replaces a full one.
func nextCap() int {
	c := len(block)
	if c == 0 {
		return 1
	}
	return c * 2
}

// moveTo replaces the block with one of c slots, copying the items across.
func moveTo(c int) {
	newBlock := make([]int, c)
	for i := 0; i < length; i++ {
		newBlock[i] = block[i]
	}
	block = newBlock
}

func push(value int) {
	if length == len(block) {
		moveTo(nextCap())
	}
	block[length] = value
	length++
}

func main() {
	out := bufio.NewWriter(os.Stdout)
	defer out.Flush()
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) == 0 {
			continue
		}
		arg := 0
		if len(fields) > 1 {
			arg, _ = strconv.Atoi(fields[1])
		}
		switch fields[0] {
		case "append":
			push(arg)
		case "get":
			if arg >= 0 && arg < length {
				fmt.Fprintln(out, block[arg])
			} else {
				fmt.Fprintln(out, "error")
			}
		case "len":
			fmt.Fprintln(out, length)
		}
	}
}
