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
var data = make([]int, 10) // the slots behind the value stack
var count int // how many slots hold an item
var copies int // items copied when the value stack grew
var mins []int // mins[i] is the smallest of the first i + 1 items
var listLen int // the number of elements being sorted
var runEnd int // where the runs seen so far end
var pending []run // each run not yet merged, oldest first

type run struct {
	length int
	power  int
}

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

func push(x int) {
	if count == len(data) {
		bigger := make([]int, len(data)*2)
		for i := 0; i < count; i++ {
			bigger[i] = data[i]
		}
		copies += count
		data = bigger
	}
	data[count] = x
	count++
	if len(mins) > 0 && mins[len(mins)-1] < x {
		mins = append(mins, mins[len(mins)-1])
	} else {
		mins = append(mins, x)
	}
}

func pop() string {
	if count == 0 {
		return "error"
	}
	count--
	item := data[count]
	data[count] = 0
	mins = mins[:len(mins)-1]
	return strconv.Itoa(item)
}

func power(s1, n1, n2, n int) int {
	result := 0
	a := 2*s1 + n1
	b := a + n1 + n2
	for {
		result++
		if a >= n {
			a -= n
			b -= n
		} else if b >= n {
			break
		}
		a <<= 1
		b <<= 1
	}
	return result
}

func mergeAt(i int) {
	fmt.Fprintln(out, "merge", pending[i].length, pending[i+1].length)
	pending[i].length += pending[i+1].length
	pending = append(pending[:i+1], pending[i+2:]...)
}

func addRun(length int) {
	if len(pending) > 0 {
		n1 := pending[len(pending)-1].length
		p := power(runEnd-n1, n1, length, listLen)
		for len(pending) > 1 && pending[len(pending)-2].power > p {
			mergeAt(len(pending)-2)
		}
		pending[len(pending)-1].power = p
	}
	pending = append(pending, run{length, 0})
	runEnd += length
}

func finish() {
	for len(pending) > 1 {
		i := len(pending) - 2
		if i > 0 && pending[i-1].length < pending[i+1].length {
			i--
		}
		mergeAt(i)
	}
}

func nextLonger(values []int) []int {
	answer := make([]int, len(values))
	var stack []int // indexes whose answer is still unknown; their values never rise
	for i, v := range values {
		for len(stack) > 0 && values[stack[len(stack)-1]] < v {
			j := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			answer[j] = i - j
		}
		stack = append(stack, i)
	}
	return answer
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
		case "push":
			push(arg)
		case "pop":
			fmt.Fprintln(out, pop())
		case "peek":
			if count > 0 {
				fmt.Fprintln(out, data[count-1])
			} else {
				fmt.Fprintln(out, "error")
			}
		case "empty":
			fmt.Fprintln(out, count == 0)
		case "search":
			found := -1
			for i := count - 1; i >= 0; i-- {
				if data[i] == arg {
					found = count - i
					break
				}
			}
			fmt.Fprintln(out, found)
		case "size":
			fmt.Fprintln(out, count)
		case "capacity":
			fmt.Fprintln(out, len(data))
		case "copies":
			fmt.Fprintln(out, copies)
		case "min":
			if len(mins) > 0 {
				fmt.Fprintln(out, mins[len(mins)-1])
			} else {
				fmt.Fprintln(out, "error")
			}
		case "sort":
			listLen, runEnd, pending = arg, 0, nil
		case "run":
			addRun(arg)
		case "end":
			finish()
		case "pending":
			if len(pending) == 0 {
				fmt.Fprintln(out, "empty")
			} else {
				lengths := make([]string, len(pending))
				for i, r := range pending {
					lengths[i] = strconv.Itoa(r.length)
				}
				fmt.Fprintln(out, strings.Join(lengths, " "))
			}
		case "nextlonger":
			values := make([]int, len(args))
			for i, a := range args {
				values[i], _ = strconv.Atoi(a)
			}
			answers := nextLonger(values)
			texts := make([]string, len(answers))
			for i, a := range answers {
				texts[i] = strconv.Itoa(a)
			}
			fmt.Fprintln(out, strings.Join(texts, " "))
		}
	}
}
