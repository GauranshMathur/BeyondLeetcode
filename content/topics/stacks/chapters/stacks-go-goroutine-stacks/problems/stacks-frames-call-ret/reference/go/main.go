package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

var out = bufio.NewWriter(os.Stdout)

var frames []int // the sizes in bytes of the live frames, oldest first
var used int // bytes in use: the sum of the sizes in frames

func call(n int) {
	frames = append(frames, n)
	used += n
}

func main() {
	defer out.Flush()
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 1024*1024), 16*1024*1024)
	for scanner.Scan() {
		parts := strings.Fields(scanner.Text())
		if len(parts) == 0 {
			continue
		}
		command, args := parts[0], parts[1:]
		arg := 0
		if len(args) > 0 {
			arg, _ = strconv.Atoi(args[0])
		}
		switch command {
		case "call":
			call(arg)
		case "ret":
			if len(frames) == 0 {
				fmt.Fprintln(out, "error")
			} else {
				size := frames[len(frames)-1]
				frames = frames[:len(frames)-1]
				used -= size
				fmt.Fprintln(out, size)
			}
		case "depth":
			fmt.Fprintln(out, len(frames))
		case "used":
			fmt.Fprintln(out, used)
		}
	}
}
