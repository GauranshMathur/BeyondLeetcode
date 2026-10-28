# Go ServeMux: a tree of path segments

A web server has to decide which handler answers `/a/b/c`. In Go 1.22.0 the file `routing_tree.go` of `net/http` begins: "This file implements a decision tree for fast matching of requests to patterns." ([routing_tree.go, lines 5 to 6](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/net/http/routing_tree.go#L5-L6)) This Chapter reads that file and `mapping.go` beside it. They answer two questions you meet in every trie: what does one level stand for, and how does a node keep its children?

## One level, one segment

The same comment says what each level of the tree branches on: "The root of the tree branches on the host of the request. The next level branches on the method. The remaining levels branch on consecutive segments of the path." ([routing_tree.go, lines 8 to 10](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/net/http/routing_tree.go#L8-L10)) A path is cut into segments at its slashes, and the helper that does it says so: "firstSegment splits path into its first segment, and the rest." ([line 199](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/net/http/routing_tree.go#L199)) So `/a/b/c` is three steps down the tree, `a`, `b` and `c`, where a trie over the characters would take six. The Build in Problem 5 keeps only those path levels.

## Children: a slice first, then a map

Each interior node keeps its children in a `mapping`: `children   mapping[string, *routingNode]` ([routing_tree.go, line 38](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/net/http/routing_tree.go#L38)), under the comment "An interior node maps parts of the incoming request to child nodes." ([line 33](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/net/http/routing_tree.go#L33)) The `mapping` type in `mapping.go` chooses how to store them: "A mapping tries to pick a representation that makes [mapping.find] most efficient." ([mapping.go, line 9](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/net/http/mapping.go#L9)) It has two fields, with their own comments: one slice "for few pairs" and one map "for many pairs". ([lines 11 to 12](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/net/http/mapping.go#L11-L12)) The line that decides between them is a number: "maxSlice is the maximum number of pairs for which a slice is used." ([line 20](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/net/http/mapping.go#L20)) Its value is `var maxSlice int = 8` ([line 22](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/net/http/mapping.go#L22)), and the next comment line reads "It is a variable for benchmarking." ([line 21](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/net/http/mapping.go#L21)) The file states the goal and the number. It does not state a reason for 8.

The switch is in `add`:

```go
func (h *mapping[K, V]) add(k K, v V) {
	if h.m == nil && len(h.s) < maxSlice {
		h.s = append(h.s, entry[K, V]{k, v})
	} else {
		if h.m == nil {
			h.m = map[K]V{}
			for _, e := range h.s {
				h.m[e.key] = e.value
			}
			h.s = nil
		}
		h.m[k] = v
	}
}
```

([mapping.go, lines 25 to 38](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/net/http/mapping.go#L25-L38)) While the slice holds fewer than 8 pairs, a new pair is appended. The ninth pair builds a map, copies the slice into it and drops the slice. After that `h.m` is not nil, so every later pair goes to the map. The file defines `add`, `find` and `eachPair` and no method that removes a pair, so nothing here turns a map back into a slice. ([lines 24 to 78](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/net/http/mapping.go#L24-L78)) The Build in Problem 4 counts which nodes would be a slice and which a map. Go has no delete here, so the rule for `del` in that Problem is written for the Problem.

What does each form cost? Looking a child up in the slice form compares each pair in turn, `for _, e := range h.s {` ([line 51](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/net/http/mapping.go#L51)), so with at most 8 pairs it makes at most 8 comparisons, a **worst case** bound that does not grow. The other form looks the key up in the map, `v, found = h.m[k]` ([line 48](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/net/http/mapping.go#L48)). What that costs depends on how Go implements `map`, which this file does not say. For comparison, take a node that keeps an array with one slot for each of the 26 lowercase letters: with 8-byte pointers that is 26 × 8 = 208 bytes (arithmetic), whether the node has one child or twenty-six. The rax node of [the first Chapter](/chapters/tries-rax) stores one byte and one pointer per child instead ([src/rax.h, lines 105 to 106](https://github.com/redis/redis/blob/f60370ce28b946c1146dcea77c9c399d39601aaa/src/rax.h#L105-L106)). Three nodes, three answers to one question.

## Literal first, and back up

A pattern can have a wildcard in a segment. The match function tries one kind of child, then the next: "First try matching against patterns that have a literal for this position." ([line 168](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/net/http/routing_tree.go#L168)) If that finds nothing: "If matching a literal fails, try again with patterns that have a single wildcard (represented by an empty string in the child mapping)." ([lines 175 to 176](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/net/http/routing_tree.go#L175-L176)) The file's own example needs both. With the patterns `/a/b/z` and `/a/{x}/c`, "we will first try to match the path "/a/b/c" with /a/b/z, and when that fails we will try against /a/{x}/c." ([lines 16 to 17](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/net/http/routing_tree.go#L16-L17)) The comment names the cost: "The "more specific wins" precedence rule can result in backtracking." ([line 12](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/net/http/routing_tree.go#L12)) The walk takes the literal child, finds it leads nowhere and returns to the same node to try the wildcard. That is a depth-first search ([lines 172 to 185](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/net/http/routing_tree.go#L172-L185)), and its **worst case** is every node of the tree.

A wildcard also captures the segment it matched. The comment above `match` gives the order: "if the request path is "/a/b/c" and the pattern is "/{x}/b/{y}", then the second return value will be []string{"a", "c"}." ([lines 113 to 114](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/net/http/routing_tree.go#L113-L114))

## Some pairs are refused

Two patterns can both match one path with neither the more specific. The source defines it: "Patterns whose method and path is more specific win. One pattern is more specific than another if the second matches all the (method, path) pairs of the first and more." ([pattern.go, lines 222 to 224](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/net/http/pattern.go#L222-L224)) Then: "two patterns conflict if their relationship is either equivalence (they match the same set of requests) or overlap (they both match some requests, but neither is more specific than the other)." ([lines 226 to 228](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/net/http/pattern.go#L226-L228)) By that rule `/a/{x}` and `/{y}/b` conflict, because both match `/a/b` and neither is more specific. So do `/users/{id}` and `/users/{name}`, which match the same requests. Problem 5 refuses the second kind and says `conflict`. It lets the first kind in and decides by the leftmost literal, which is a rule of this Problem and not of Go.

## What the Build leaves out

The Build has no host, no method and no multi-segment wildcard. The source's special child keys include one for a trailing slash and one for a multi wildcard. ([routing_tree.go, lines 34 to 37](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/net/http/routing_tree.go#L34-L37)) The Build's keys are lowercase letters and digits, where the real router returns each segment "unescaped, if possible." ([line 202](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/net/http/routing_tree.go#L202))
