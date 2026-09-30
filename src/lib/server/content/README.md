# Content format

The content catalogue (`loadCatalogue(dir)`) reads one content folder. Real content and the test fixture (`fixture/`) use the same format. Terms follow `CONTEXT.md`.

```
<content>/
  content.json                      { "topics": ["<topicId>", ...] }
  topics/<topicId>/
    topic.json                      { "title", "summary", "prerequisites": ["<topicId>", ...], "chapters": ["<chapterId>", ...] }
    chapters/<chapterId>/
      chapter.json                  { "title", "problems": ["<problemId>", ...] }
      chapter.md                    the Chapter prose, Markdown, sources cited inline
      problems/<problemId>/
        problem.json                { "title", "kind": "core" }  or  { "title", "kind": "extra", "parent": "<core problemId>" }
        statement.md                the Problem statement, Markdown
        solution.md                 the Solution explanation, Markdown
        hints/1.md, 2.md, ...       Hints, revealed in number order
        tests/example/<name>.in     Example Test input (stdin)
        tests/example/<name>.out    its expected output (stdout)
        tests/hidden/<name>.in|.out Hidden Tests, same shape
        reference/python/**         Reference Code: the whole Build after this Problem
        reference/typescript/**
        reference/go/**
```

## Rules

- **Ids** are folder names, lowercase slugs (`a-z`, `0-9`, single hyphens), unique across all Topics, Chapters and Problems. Ids are stable: progress is keyed by them, so never rename a published one.
- **Order** comes from the manifests: `content.json` orders Topics, `topic.json` orders Chapters, `chapter.json` orders Problems. A manifest must list exactly the folders beside it. A missing folder or an unlisted one is an error.
- **Prerequisites** name existing Topics, never the Topic itself, and never form a cycle.
- **Main Line** is the Topic's Core Problems in Chapter order, then Problem order.
- **Extra Problems** name a `parent`: a Core Problem in the same Topic that comes before the Extra. So a Topic's first Problem is always Core.
- **Tests**: every `.in` has a matching `.out` and vice versa. Each Problem needs at least one Example Test, because Run uses only those. Tests sort by name. The expected output is the `.out` file byte for byte. How output is compared (for example trailing newlines) belongs to the Learning core, not to this format.
- **Hints** are numbered `1.md` to `n.md` with no gaps.
- **Solution** is `solution.md` plus the Reference Code after the Problem, which the format does not duplicate.
- **Reference Code** is required in every Language (`python`, `typescript`, `go`), and each folder must hold at least one file. No other Language folders are allowed. The empty Build before a Topic's first Problem is implied and not stored.
- JSON manifests reject unknown keys.

## Fixture

`fixture/` holds three placeholder Topics (`stacks`, then `queues`, then `heaps`, which needs both), with Core and Extra Problems. Its prose is placeholder. Its Reference Code is real and passes its own Tests and the Tests of earlier Core Problems.
