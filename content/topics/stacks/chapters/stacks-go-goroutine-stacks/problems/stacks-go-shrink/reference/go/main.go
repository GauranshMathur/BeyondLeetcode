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
var segment = 2048 // bytes the stack owns
var moved int // bytes copied each time the stack moves to a new segment
var maxStack = 1000000000 // the largest segment allowed

func moveTo(size int) {
	moved += used
	segment = size
}

func call(n int) {
	if used+n > segment {
		newSize := segment * 2
		for newSize < used+n {
			newSize *= 2
		}
		if newSize > maxStack {
			fmt.Fprintln(out, "stack overflow")
			out.Flush()
			os.Exit(0)
		}
		moveTo(newSize)
	}
	frames = append(frames, n)
	used += n
}

func collect() {
	half := segment / 2
	if half >= 2048 && used < segment/4 {
		moveTo(half)
	}
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
		case "segment":
			fmt.Fprintln(out, segment)
		case "moved":
			fmt.Fprintln(out, moved)
		case "limit":
			maxStack = arg
		case "gc":
			collect()
		}
	}
}
