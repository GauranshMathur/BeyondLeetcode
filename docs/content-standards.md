# Content standards

Everything a learner reads or solves here (chapters, problem statements, test cases, hints, solutions, card text) is held to one bar: **every claim is traceable to a primary source that a human has opened and checked.** AI may draft; nothing ships until a person has verified it.

## Sources

A claim about how a real system works cites that system's own material, inline, next to the sentence it supports. In order of preference:

1. **Source code**, as a permalink to a specific commit (never a branch, which moves).
2. **Official documentation** for the version being described.
3. **The original paper or design doc** by the people who built it.
4. **A talk or post by the system's own engineers**, on the project's or company's own site.

Blog posts, tutorials, Q&A answers, video summaries and AI-generated text are leads for finding a source, never the source itself.

A claim with no primary source is cut or rewritten until it has one. "Commonly said" and "widely known" are not citations.

## Verification

- **Links:** a human opens every cited link before merge and confirms it says what the sentence says, for the version named.
- **Code:** every code sample runs as shown.
- **Complexity:** every Big-O claim is correct for the operation named. Amortised, expected and worst case are labelled as such, and anything non-obvious gets one sentence explaining why.
- **Problems:** the reference solution passes every test in the sandbox, and the tests include the edge cases the statement mentions.

## Originality

Problem statements, examples and test cases are written fresh for this project. A classic problem's *name* and underlying algorithm are fine to reuse; another site's statement text and test cases are not. Framing each problem by the real system it comes from makes original wording the natural path.

## Mockups are not content

Text in the design canvas and on placeholder cards was written to show layout. Treat every factual-looking sentence there as unverified until it passes this document.

## For agents

Use the `research` skill to find and capture primary sources, then cite them inline. When a source cannot be found, write `[NEEDS SOURCE]` in place of the claim and list it in your report. A human resolves it.

## Content PR checklist

Copy into the PR description:

- [ ] Every claim about a real system has an inline primary-source citation (commit permalink, official docs, original paper, or the builders' own talk/post)
- [ ] I opened every cited link and it says what the sentence says, for the version named
- [ ] Every code sample runs as shown
- [ ] Complexity claims are correct and labelled (worst / amortised / expected)
- [ ] Problem statement, examples and tests are original, and the reference solution passes all tests
- [ ] No `[NEEDS SOURCE]` markers remain
