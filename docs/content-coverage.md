# Content coverage: NeetCode roadmap topics

First written for card C60 on 2026-10-26 as a gap report, and updated on 2026-10-28 when Sprint 12 closed. It compares `content/` with the topic list of the NeetCode roadmap. The roadmap is only a list of topics to cover; none of its text or problem statements is used here or may be used in content (see `content-standards.md`, Originality).

**Counted:** shipped content only, i.e. `content/content.json`. The Stacks and Queues Topics under `src/lib/server/content/fixture` are test fixtures and do not count.

**Shipped today:** 18 Topics with 177 Problems. Every roadmap topic has a Topic, and arrays and hashing has two. No Topic has had its human source check yet. Each Topic's cited links are listed, unticked, in its section of `docs/research/human-review-queue.md`. Dynamic arrays' review is tracked in #113.

Mapping is by what a Topic teaches, not its name.

## Coverage by roadmap topic

| Roadmap topic | Topic | Chapters | Problems (core + extra) | Shipped by | Content issue |
|---|---|---|---|---|---|
| Arrays and hashing | Dynamic arrays (`dynamic-arrays`) | 3 | 6 + 1 | before Sprint 8 | review: [#113](https://github.com/GauranshMathur/BeyondLeetcode/issues/113) |
| | Hash tables (`hash-tables`) | 4 | 9 + 0 | C100, Sprint 8 | [#259](https://github.com/GauranshMathur/BeyondLeetcode/issues/259) |
| Two pointers | Two pointers (`two-pointers`) | 4 | 10 + 3 | C101, Sprint 8 | [#268](https://github.com/GauranshMathur/BeyondLeetcode/issues/268) |
| Stack | Stacks (`stacks`) | 4 | 9 + 0 | C103, Sprint 8 | [#265](https://github.com/GauranshMathur/BeyondLeetcode/issues/265) |
| Binary search | Binary search (`binary-search`) | 4 | 7 + 0 | C102, Sprint 8 | [#255](https://github.com/GauranshMathur/BeyondLeetcode/issues/255) |
| Sliding window | Sliding window (`sliding-window`) | 4 | 8 + 2 | C104, Sprint 8 | [#264](https://github.com/GauranshMathur/BeyondLeetcode/issues/264) |
| Linked list | Linked lists (`linked-lists`) | 5 | 12 + 2 | C105, Sprint 8 | [#262](https://github.com/GauranshMathur/BeyondLeetcode/issues/262) |
| Trees | Trees (`trees`) | 5 | 9 + 2 | C113, Sprint 12 | [#266](https://github.com/GauranshMathur/BeyondLeetcode/issues/266) |
| Tries | Tries (`tries`) | 4 | 6 + 2 | C115, Sprint 12 | [#267](https://github.com/GauranshMathur/BeyondLeetcode/issues/267) |
| Heap | Heaps (`heaps`) | 5 | 7 + 2 | C114, Sprint 12 | [#260](https://github.com/GauranshMathur/BeyondLeetcode/issues/260) |
| Backtracking | Backtracking (`backtracking`) | 5 | 6 + 4 | C116, Sprint 12 | [#254](https://github.com/GauranshMathur/BeyondLeetcode/issues/254) |
| Graphs | Graphs (`graphs`) | 5 | 10 + 4 | C117, Sprint 12 | [#257](https://github.com/GauranshMathur/BeyondLeetcode/issues/257) |
| 1-D DP | 1-D dynamic programming (`dp-1d`) | 4 | 6 + 3 | C120, Sprint 12 | [#252](https://github.com/GauranshMathur/BeyondLeetcode/issues/252) |
| 2-D DP | 2-D dynamic programming (`dp-2d`) | 4 | 5 + 5 | C121, Sprint 12 | [#253](https://github.com/GauranshMathur/BeyondLeetcode/issues/253) |
| Greedy | Greedy (`greedy`) | 4 | 4 + 2 | C118, Sprint 12 | [#258](https://github.com/GauranshMathur/BeyondLeetcode/issues/258) |
| Intervals | Intervals (`intervals`) | 4 | 4 + 3 | C119, Sprint 12 | [#261](https://github.com/GauranshMathur/BeyondLeetcode/issues/261) |
| Math (math and geometry) | Math and geometry (`math-geometry`) | 4 | 8 + 4 | C122, Sprint 12 | [#263](https://github.com/GauranshMathur/BeyondLeetcode/issues/263) |
| Bit manipulation | Bit manipulation (`bit-manipulation`) | 4 | 10 + 2 | C123, Sprint 12 | [#256](https://github.com/GauranshMathur/BeyondLeetcode/issues/256) |

## Summary

- 17 roadmap topics, all covered by at least one Topic: 18 Topics, 76 Chapters, 177 Problems.
- Each content issue stays open until a person has checked its Topic's links in the review queue. Every PR said `Refs`, not `Closes`, for that reason.
- The candidate Problems each Topic left out, with the reason, are listed in its PR and in `docs/sprints.md` (Sprints 8 and 12).
