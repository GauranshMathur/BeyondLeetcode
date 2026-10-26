# Content coverage: NeetCode roadmap topics

Gap report for card C60, written 2026-10-26 against main. It compares `content/` with the topic list of the NeetCode roadmap. The roadmap is only a list of topics to cover; none of its text or problem statements is used here or may be used in content (see `content-standards.md`, Originality).

**Counted:** shipped content only, i.e. `content/content.json`. The Stacks and Queues Topics under `src/lib/server/content/fixture` are test fixtures and do not count.

**Shipped today:** one Topic, **Dynamic arrays** (`dynamic-arrays`), unreviewed by a human source check: see #113.

| Chapter | Core Problems |
|---|---|
| `dynamic-arrays-cpython-list` | `dynamic-arrays-append`, `dynamic-arrays-copies`, `dynamic-arrays-cpython-growth`, `dynamic-arrays-pop` |
| `dynamic-arrays-go-slices` | `dynamic-arrays-go-growth`, plus extra `dynamic-arrays-go-old-rule` |
| `dynamic-arrays-promises` | `dynamic-arrays-reserve` |

Mapping is by what a Topic teaches, not its name.

## Coverage by roadmap topic

| Roadmap topic | Topic | Chapters | Problems | Content issue |
|---|---|---|---|---|
| Arrays and hashing | Dynamic arrays (partly: the array half; no hashing) | `dynamic-arrays-cpython-list`, `dynamic-arrays-go-slices`, `dynamic-arrays-promises` | the 7 above | Hashing gap: [#259](https://github.com/GauranshMathur/BeyondLeetcode/issues/259) |
| Two pointers | none | none | none | [#268](https://github.com/GauranshMathur/BeyondLeetcode/issues/268) |
| Stack | none | none | none | [#265](https://github.com/GauranshMathur/BeyondLeetcode/issues/265) |
| Binary search | none | none | none | [#255](https://github.com/GauranshMathur/BeyondLeetcode/issues/255) |
| Sliding window | none | none | none | [#264](https://github.com/GauranshMathur/BeyondLeetcode/issues/264) |
| Linked list | none | none | none | [#262](https://github.com/GauranshMathur/BeyondLeetcode/issues/262) |
| Trees | none | none | none | [#266](https://github.com/GauranshMathur/BeyondLeetcode/issues/266) |
| Tries | none | none | none | [#267](https://github.com/GauranshMathur/BeyondLeetcode/issues/267) |
| Heap | none | none | none | [#260](https://github.com/GauranshMathur/BeyondLeetcode/issues/260) |
| Backtracking | none | none | none | [#254](https://github.com/GauranshMathur/BeyondLeetcode/issues/254) |
| Graphs | none | none | none | [#257](https://github.com/GauranshMathur/BeyondLeetcode/issues/257) |
| 1-D DP | none | none | none | [#252](https://github.com/GauranshMathur/BeyondLeetcode/issues/252) |
| 2-D DP | none | none | none | [#253](https://github.com/GauranshMathur/BeyondLeetcode/issues/253) |
| Greedy | none | none | none | [#258](https://github.com/GauranshMathur/BeyondLeetcode/issues/258) |
| Intervals | none | none | none | [#261](https://github.com/GauranshMathur/BeyondLeetcode/issues/261) |
| Math (math and geometry) | none | none | none | [#263](https://github.com/GauranshMathur/BeyondLeetcode/issues/263) |
| Bit manipulation | none | none | none | [#256](https://github.com/GauranshMathur/BeyondLeetcode/issues/256) |

## Summary

- 17 roadmap topics: 0 fully covered, 1 partly covered (arrays and hashing), 16 with nothing.
- 17 content issues are open, one per gap, each labelled `enhancement` and `needs-triage`: one for the uncovered hashing half of arrays and hashing (titled "Content: Hash tables") and one for each of the 16 topics with no Topic.
- Each issue gives an outline of Chapters, candidate Problems by classic name only, Prerequisites in build order, and the content-standards bar. System names in the outlines are leads for finding primary sources, not claims.
- No existing issue covered any of these. The only related one is #113 (human source review of the dynamic arrays Topic).
