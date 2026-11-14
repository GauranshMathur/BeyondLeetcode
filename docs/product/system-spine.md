# The system spine: a design for system-first content

Status: **proposed**. Nothing here is decided until the maintainer confirms the spine (see [Questions for the maintainer](#questions-for-the-maintainer)). No rewrite card starts before that. This document changes no learner content.

It answers issue #663. The maintainer's words there are the brief:

> The problem is that the dive into complexity is really fast. And there is not detailed explanations on real life usecases that have proper showcases of why these systems are needed. System design is heavily missing so the pieces feel like off.
>
> The way how each topic is written starts with things like cpython or go a growth rule changed. I need it to be super system design/real product focused come from something like an app or a db or something and go deeper into then use that as the method to explain why and how this topic matters and where the adding on top comes from.
>
> Maybe lets try and get fable to come up with an already built system or a new system and then the pieces join together to build this system with the leetcode stuff.

The same comment also asks for a Language choice at the start and for instructions on how to use the site. Those are not content design and are not covered here.

## The short version

- **The spine is one system: Parley (working name), a team chat app.** Channels, threads, mentions, search, reminders, notifications. It is a new system, modelled on real ones whose code and engineering write-ups are public. It has a small database inside it (the message store) and a small search engine inside it (message search), so the best parts of the other two candidates are kept as parts of the app.
- **Every Topic is one piece of Parley.** Dynamic arrays is the channel's message log. Hash tables is finding a message by its id. Heaps is the reminder scheduler. Each of the 18 Topics has a section below with the piece, the product problem that forces it, where it breaks at scale and what its Problems practise.
- **Four milestones** mark where the pieces so far make a working part of Parley: one channel on one machine; a server many people share; find anything; a network of servers. Each milestone gets a system-design Chapter and a capstone Build.
- **The pacing rule** puts the product problem first and the language internals last, and is written as eight checks a reviewer can tick. Dynamic arrays is worked as a full outline under it.
- **Three Topics do not fully fit and the document says so.** Backtracking, Math and geometry and parts of the two dynamic programming Topics use named side-systems or plain practice Problems. Nothing is bent to fit.
- **The existing content is mostly kept.** The Builds, Tests, Reference Code and citations stay. What changes is how each Chapter opens, the order inside it, and the frame around each Problem. No Topic is reordered, no Prerequisite changes, and no Learner loses progress under the recommended plan.

## What the content is today

This is what the files in `content/` hold, read for this document. I read Dynamic arrays and Graphs in full (every Chapter and a Problem statement), and for the other 16 Topics the Topic and Chapter metadata, every Problem title, the opening of the first Chapter and the first Problem's statement. Advice below about what to keep or move is therefore at Chapter level; each rewrite card should confirm it section by section.

- 18 Topics, 76 Chapters, 177 Problems (`docs/content-coverage.md`). About 77,000 words of Chapter prose, so a Chapter is about 1,000 words.
- Every Topic has one Build that reads commands on standard input, grown one Core Problem at a time, with Reference Code in Python, TypeScript and Go.
- Claims are cited inline to source code at a commit, official documentation or a specification. This is the strongest part of the content and stays.

How the Topics open:

| Topic | First Chapter | The first thing the Learner meets |
|---|---|---|
| Dynamic arrays | CPython: a list that leaves room | Python's `list`, then the fields `ob_item` and `allocated` |
| Stacks | Go: a call stack that moves | goroutine stacks and the constant `stackMin = 2048` |
| Binary search | Java: the midpoint that overflowed | the Javadoc contract of `Arrays.binarySearch` |
| Two pointers | CPython: two ends, moving in | the C loop behind `list.reverse()` |
| Hash tables | CPython: a dict that probes | open addressing, `dk_indices` and its dummy slots |
| Linked lists | Linux: a list node that lives inside the object | `struct list_head` |
| Sliding window | Rate limiters: counting in a window | what a rate limit is, then the kernel's `___ratelimit` |
| Math and geometry | CPython: integers with no ceiling | the Go specification on integer overflow |
| Bit manipulation | Linux: reading a field as a signed number | two's complement and the Java Language Specification |
| Trees | Expression trees: SQLite caps their depth | the definition of a binary tree, then SQLite's `Expr` struct |
| Backtracking | CPython's regex engine: try an alternative, undo it | a pattern example, then the `_sre` opcode |
| Tries | Redis rax: the edge lives in the parent | the definition of a trie, then `rax.h` |
| Heaps | CPython: a heap in a plain list | "which item comes next?", then `heapq.py` |
| 1-D dynamic programming | Python's functools.cache | a staircase recursion, then the `functools` docs |
| Greedy | CPython: the biggest block that fits | `ipaddress.summarize_address_range` |
| 2-D dynamic programming | Hunspell: ranking spelling suggestions | a grid over two words, then Hunspell's source |
| Graphs | Boost.Graph: a matrix or a list | the definition of a graph, then sparsity and V² |
| Intervals | Go regexp: sort the ranges, then merge | how Go's regexp parser cleans a character class |

What this shows, set against the maintainer's complaints:

- **"Starts with things like cpython or go."** 11 of the 18 first Chapters are titled after a language runtime or its standard library (CPython or Python eight times, Go twice, Java once) and two more after the Linux kernel. None opens with a person using a product. The nearest are Sliding window, which opens with what a rate limit is, and 2-D dynamic programming, which opens inside a spell checker.
- **"The dive into complexity is really fast."** In Dynamic arrays the Learner reads a C struct comment in the third paragraph and a bit-shifting growth formula in the third section, before any plain picture of why a list would leave room. Graphs opens with sparsity and V² in its second paragraph. The definitions are correct and short, but they come before the reason to care.
- **"No real life use cases with proper showcases."** The Chapters do show real systems, but as code to be read, not as a need someone had. A Chapter says what `list_resize` does; it does not say what goes wrong for a person when a list cannot grow.
- **"System design is missing, so the pieces feel off."** Each Topic's Build stands alone: a growable list of integers, a hash table of integers, a graph tool. Nothing says that the list, the table and the graph are parts of one thing. There is no Chapter anywhere that draws a system.

What already works and is not to be lost: the Builds and their step-by-step Main Lines, the Tests, the Reference Code in three Languages, the Hints and Solutions, and the cited sources. The redesign changes the order and the frame, not the algorithms.

## Constraints the spine must live inside

These come from decided documents. Where the spine would need one changed, that is a question for the maintainer, listed at the end.

1. **A Build belongs to one Topic and starts empty** (`docs/adr/0001-topic-builds.md`, `CONTEXT.md`). So the pieces cannot literally be one codebase the Learner grows across all Topics without changing that ADR, the Learning core and the content format. Under this design each Topic's Build is one piece of Parley, and the pieces are joined in the milestone capstones.
2. **Progress is derived from ids** (`docs/module-map.md`). A Topic is Complete when every Chapter is Read and every Core Problem is Solved, worked out each time from Read marks and Submissions. Adding a Chapter or a Core Problem to a Topic makes it not Complete for a Learner who had finished it, and that Locks the unfinished Topics that depend on it.
3. **Ids are stable** (`src/lib/server/content/README.md`): a published Chapter or Problem id is never renamed.
4. **A Chapter may have no Problems; a Topic needs at least one Core Problem** (same README).
5. **Every claim about a real system cites a primary source and a human checks it** (`docs/content-standards.md`).
6. **The roadmap is the 17 topics in `docs/content-coverage.md`**, covered by 18 Topics because arrays and hashing has two.

## What a spine has to do

A candidate is judged on five things:

1. **Fit, Topic by Topic.** For each of the 18 Topics: would a team building this system hit a problem that this Topic's structure solves? A spine is only as strong as its weakest Topic. Three grades are used below. **Natural:** the system forces the need and a real system of this kind is known to meet it this way. **Workable:** the need is real in this system but covers only part of the Topic, or production systems use something other than the textbook structure. **Forced:** a feature would have to be invented to make the Topic fit.
2. **A product a Learner has used.** The opening of every Topic is a product problem. It lands only if the Learner has been the person in the story.
3. **A growth story.** The system must get bigger in stages so that every Topic can say where its simple version breaks, with numbers.
4. **Primary sources.** Real systems of the same kind must have public source code, specifications or engineering write-ups by their own builders.
5. **System-design milestones.** The pieces must add up to parts that match how such systems are designed in practice.

## The candidates

### Candidate A: a key-value database

A storage engine in the style of LevelDB with a small server in front, in the style of Redis. The Learner builds the write buffer, the in-memory index, sorted files on disk, compaction, a block cache and filters.

Where it fits naturally: Dynamic arrays (the write buffer), Hash tables (the in-memory index), Two pointers (merging sorted runs, which the current Two pointers Topic already reads in LevelDB), Binary search (finding a key in a sorted block), Linked lists (the least-recently-used block cache), Trees (B-trees), Heaps (merging many runs, expiry), Intervals (which files' key ranges overlap during compaction) and Bit manipulation (Bloom filters, packed integers). The sources are the best of any candidate: LevelDB, Redis and SQLite are small, readable and documented by their authors.

Where it is forced: **Stacks** (a key-value command needs no real parser), **Backtracking** (only pattern matching on key names), **Graphs** (only deadlock detection, and a simple store takes one lock), **1-D** and **2-D dynamic programming** (a storage engine has no natural use for either). That is five Topics of 18 with no honest piece.

The other weakness is the one the maintainer named. A database is infrastructure. Its use cases are still one level away from a person: "the block cache evicts a page" is nearer to "CPython resizes a list" than to something a Learner has felt.

### Candidate B: a search engine

A text search engine in the style of Lucene: an inverted index, posting lists, a query parser, ranking and suggestions.

Where it fits naturally: Dynamic arrays (posting lists), Hash tables (the term dictionary), Two pointers (intersecting two sorted posting lists), Stacks (parsing a query with brackets and AND/OR), Binary search (the term dictionary), Sliding window (the shortest stretch of a document that holds every query word), Linked lists (the query cache), Tries (the term dictionary and autocomplete), Heaps (the best K results), 2-D dynamic programming (fuzzy matching and "did you mean") and Bit manipulation (bit sets and packed integers).

Where it is only workable: Trees (query trees; the engine's own index is not a search tree), Graphs (a link graph matters to a web search engine, not to searching one site), Backtracking (wildcard queries, though production engines compile them to automata), 1-D dynamic programming (cutting unspaced text into words), Greedy (compression), Intervals (highlight spans, range queries) and Math and geometry (scoring). Nothing is forced.

Its weakness is breadth of product, not fit. A search engine has one kind of user doing one thing: typing a query. It has no people talking to each other, no time passing, no limits per person. That removes the best stories for Sliding window (spam), Heaps (timers), Graphs (who knows whom) and Intervals (schedules). And a Learner has used a search box but has rarely had to think about what is behind it, so the first Topic would have to teach what an inverted index is before it could teach anything else.

### Candidate C: a team chat app, with search and storage inside

A chat product in the style of the open-source Zulip, Mattermost and Matrix servers and the public write-ups of Discord and Slack: workspaces, channels, threads, direct messages, mentions, reminders, notifications, search. It stores its own messages, so it has Candidate A's storage problems, and it searches them, so it has Candidate B's search problems.

Where it fits naturally: 13 Topics, listed in the table below. A chat app has ordered data that grows without end (messages), lookups by id, many people at once, per-person limits, time (reminders, schedules, presence), text people type (markup, mentions, search) and a network of people and servers.

Where it is only workable: Greedy, both dynamic programming Topics, Math and geometry, and Backtracking. The dynamic programming fits come from the search and text features (cutting hashtags into words, "did you mean", showing what an edit changed), which are real but are a corner of the product. Backtracking fits for pattern matching in keyword alerts and word filters, and there are real, public outages caused by exactly that; the rest of that Topic (subsets, permutations, the queens puzzle, pip's resolver) has no chat piece. Math and geometry is a grab-bag on the roadmap itself and gets a small piece per Chapter, not one piece.

Its weakness is the reverse of the search engine's: it is broad. A product this wide can be made to "need" almost anything, so the per-Topic sections below hold themselves to the Natural, Workable and Forced grades and name what is left as practice.

### Topic by Topic

| Topic | A: key-value database | B: search engine | C: team chat app |
|---|---|---|---|
| Dynamic arrays | Natural: write buffer | Natural: posting list | Natural: a channel's message log |
| Hash tables | Natural: in-memory index | Natural: term dictionary | Natural: message by id, sessions, duplicate sends |
| Two pointers | Natural: merging sorted runs | Natural: intersecting posting lists | Natural: merging a device's messages into the timeline |
| Stacks | **Forced** | Natural: query parser | Natural: message markup and filter parser, undo |
| Binary search | Natural: key in a sorted block | Natural: term lookup | Natural: jump to a date, history pages |
| Sliding window | Workable: client limits | Natural: shortest covering snippet | Natural: spam and rate limits |
| Linked lists | Natural: block cache | Natural: query cache | Natural: cache of hot channels |
| Math and geometry | Workable: checksums | Workable: scoring | Workable: counters, key agreement, image attachments |
| Bit manipulation | Natural: Bloom filters | Natural: bit sets | Natural: permissions, packed ids, filters |
| Trees | Natural: B-tree | Workable: query tree | Natural: threads; the history index on disk |
| Tries | Workable: prefix scans | Natural: autocomplete | Natural: mention and command autocomplete, the API router |
| Heaps | Natural: merging many runs | Natural: best K results | Natural: reminders and timers, best K |
| Backtracking | **Forced** | Workable: wildcard queries | Workable: keyword and filter patterns; the rest is practice |
| Graphs | **Forced** | Workable: link graph | Natural: who is in what, who knows whom, server links |
| 1-D dynamic programming | **Forced** | Workable: cutting text into words | Workable: cutting hashtags, wrapping text |
| Greedy | Workable: compaction choices | Workable: compression | Workable: compression on the wire, delivery by deadline |
| 2-D dynamic programming | **Forced** | Natural: fuzzy match | Workable: "did you mean", what an edit changed |
| Intervals | Natural: key ranges | Workable: highlight spans | Natural: fetched ranges, schedules, concurrent calls |
| **Natural / Workable / Forced** | **9 / 4 / 5** | **11 / 7 / 0** | **13 / 5 / 0** |

In every candidate the converging-ends Problems of Two pointers (pair sum, water between bars) are practice, not a piece of the system. The grade above is for the Topic's merging and compacting moves.

### The pick: Candidate C, the team chat app

Reasons a reader can check against the table and the sections below:

1. **No forced Topic, and the most natural ones.** A has five forced Topics. B and C have none; C has 13 natural against B's 11.
2. **It contains the other two.** Parley stores messages, so the Topics where the database is strongest (merging runs, the cache, Bloom filters, B-trees) keep their existing real-system readings as Parley's storage layer. Parley searches messages, so the Topics where the search engine is strongest (autocomplete, best K, fuzzy match) are Parley's search. The reverse does not hold: neither a database nor a search engine has threads, per-person limits, reminders, presence or a network of people.
3. **The Learner has been the person in every story.** Everyone has sent a message, scrolled up, typed `@al` and waited for a name, been pinged by a bot, set a reminder. This is the direct answer to "real life use cases".
4. **It grows in stages**, from one team on one process to a public service, so each Topic has a point where its simple version stops working and the numbers can be worked out in the Chapter.
5. **Public sources exist at code level in two of the three Languages.** Zulip's server is Python, Mattermost's is Go, Synapse (Matrix) is Python, and all three are open. Discord and Slack publish engineering write-ups and API documentation. Each is listed in [Source leads](#source-leads) with what still has to be checked.
6. **Its milestones are the standard system-design exercises**: a message store, a rate limiter and cache, autocomplete and search, notifications and presence. That is the missing system design, placed where the pieces for it have just been built.

Why a new system and not one real product: no single real product documents all 18 decisions in its own code. Zulip, for instance, hands storage to PostgreSQL and caching to other services, so most of the decisions would sit in its dependencies. And every sentence about a real system needs a primary source. A teaching system lets a Chapter state the design freely ("Parley keeps each channel's messages in one list") and cite real systems as the evidence that this is how it is done.

### Side-systems, named

Where a Chapter does not fit Parley it says so and reads one of these instead. There are three, and they are not bent into the app.

- **The machine room:** the network and disks under Parley. TCP's window (Sliding window), OSPF routing (Graphs), the Linux route table (Tries), RAID 5 parity (Bit manipulation). Parley runs on these; it does not build them.
- **The team's tools:** what Parley's engineers use. `git bisect` (Binary search), pip's resolver (Backtracking), git's common ancestors (Trees), the kernel's lock validator (Graphs), task ordering in build tools (Graphs).
- **The practice set:** Problems that drill a Topic's move on plain data with no system claimed: pair sum, the queens puzzle, subsets and permutations, climbing stairs, picking without neighbours, reading a matrix in a spiral. Their statements say plainly that they are practice.

## Parley

These are the fixed facts every rewrite uses, so 18 Topics describe one system.

**What it is.** A team chat app. A **workspace** holds **channels**. People post **messages** in channels, reply in **threads**, **mention** each other, set **reminders**, and **search**. A person has one or more **devices**.

**Its parts, and the Topics that build them.**

| Part | What it does | Topics |
|---|---|---|
| Channel store | Keeps each channel's messages in order; finds, edits and pages through them | Dynamic arrays, Hash tables, Binary search, Two pointers |
| Text handling | Checks and renders what people type | Stacks |
| Front door | Decides who may do what, and how often; names every message | Bit manipulation, Sliding window, Math and geometry |
| Memory and disk | Keeps hot channels in memory and old history on disk; holds threads | Linked lists, Trees |
| Typing aids and alerts | Autocomplete, routes, keyword alerts | Tries, Backtracking |
| Scheduler | Reminders, timers, "best few" lists | Heaps |
| Search | Cuts text into words, forgives typos | 1-D and 2-D dynamic programming |
| Network | People, servers, delivery, schedules, calls | Graphs, Greedy, Intervals |

**Its three sizes.** These are Parley's own numbers, chosen for teaching. They are not facts about any real product, and a Chapter must present them as Parley's.

| Stage | Who | Rough load |
|---|---|---|
| 1. One team | 50 people, one process | about 5,000 messages a day |
| 2. One company | 10,000 people, 2,000 channels, one server | about 1 million messages a day |
| 3. A public service | 10 million people, many servers | about 1 billion messages a day: 1,000,000,000 / 86,400 is about 11,600 a second on average |

A Topic's simple version is built for stage 1. "Where it breaks" is worked out at stage 2 or 3, with the arithmetic shown.

## The Topics

Each section gives the four answers the card asks for, then how well the Topic fits, then what happens to the existing Chapters. Numbers are arithmetic on Parley's stage sizes and are shown so a reviewer can redo them. Real systems named under "Sources" are leads for the content writer, with their status in [Source leads](#source-leads); they are not yet verified claims.

"Rewrite size" is one of: **Reframe** (the Chapter prose is re-ordered and re-opened; the Problems, Tests and Reference Code stay, and only the framing sentences of each statement change) or **Reframe, reorder wanted** (the same, but a different Chapter order would teach better and is held back for the reasons in [Learners' progress](#what-it-means-for-learners-progress)).

### Milestone 1: one channel on one machine

#### Dynamic arrays (`dynamic-arrays`)

- **Piece:** the channel log, the list of one channel's messages in the order they arrived.
- **Product problem:** Parley's first version gives each channel room for 1,024 messages. On day nine someone posts the 1,025th message in the busiest channel and the post fails. Making every channel huge wastes memory on 2,000 mostly quiet channels. Making room for one more message each time means every post copies the whole channel.
- **Where it breaks:** growing by one slot, 100,000 posts copy 0 + 1 + ... + 99,999 = 4,999,950,000 messages. Doubling copies 1 + 2 + 4 + ... + 65,536 = 131,071. Doubling still breaks at stage 3: the one post that fills a 10-million-message block copies all 10 million (80 MB at 8 bytes each) while every reader of that channel waits. Real stores cap the block and start a new one, which is the first idea of the milestone's design Chapter.
- **Problems practise:** append, read by index and length; counting copies to see amortised cost; growth rules; shrinking without thrashing; reserving room. These are the existing Problems.
- **Fit:** Natural.
- **Existing content:** all three Chapters kept. CPython's `list_resize` and its formula move to the deep dive at the end of Chapter 1. "Go: a growth rule that changed" stays as Chapter 2 but opens with the question it answers for Parley: how much room is the right amount. Nothing dropped. Rewrite size: Reframe. The full outline is under [The pacing rule](#the-pacing-rule).
- **Sources:** existing citations (CPython, Go, Rust, JDK); new leads L1, L14.

#### Hash tables (`hash-tables`)

- **Piece:** finding things by id: a message by its id (to edit it, react to it, reply to it), a person's session, and whether a send has been seen before.
- **Product problem:** someone edits a message they posted yesterday. The app sends "edit message 88213". With only the log, the server walks the channel to find it, and so does every reaction, reply preview and link preview. A second story: a phone on a bad connection sends the same message three times, and the server must know at once that it has seen that send before.
- **Where it breaks:** a table that has filled up must move every entry to a bigger one. At stage 3 that is tens of millions of entries moved during one unlucky request, so real stores move a few entries at a time. Keys chosen by a stranger (usernames, emoji names) can be picked to land in one slot and turn every lookup into a walk; this has been used as an attack on real services and is why languages changed their string hashes. One machine's memory ends, and spreading channels over servers is taken up in milestone 2's design Chapter.
- **Problems practise:** probing for a slot, deleting without breaking a probe chain, chains in bins, the load factor and resizing, hashing strings, keys that collide on purpose. The existing Problems build the table itself. The usual "use a table" patterns (have I seen this before, count by key, group by key) are thin today; the rewrite may add them as Extra Problems (duplicate sends, reactions counted per emoji, messages grouped by author).
- **Fit:** Natural.
- **Existing content:** all four Chapters kept. CPython's dict layout and Java's chains that turn into trees become deep dives after the simple version. "Hash functions, and keys chosen against you" already has an incident shape and opens with it. Rewrite size: Reframe.
- **Sources:** existing citations (CPython, JDK); new leads L14, L23.

#### Binary search (`binary-search`)

- **Piece:** jump to a date and history pages. Message ids rise with time, so the log is sorted, and the server must find a position in it.
- **Product problem:** someone clicks "jump to 3 March" in a four-year-old channel with 2 million messages. Or they open the app after a week away and it asks for "the 50 messages after the last one I have". Both need the first message at or after a point, and that point may not be in the list.
- **Where it breaks:** walking 2 million messages is up to 2 million comparisons; halving is 21, because 2^21 is 2,097,152. It breaks when the log is on disk: 21 reads from disk for every jump, which hands over to the B-tree in Trees. And the midpoint sum overflows once a list passes 2^30 items, which was a real bug in the JDK for years and is the Topic's incident.
- **Problems practise:** a midpoint that cannot overflow; search with a useful "not found" answer; lower and upper bound; searching for an answer and not an item (the first bad deploy, the slowest rate that clears a backlog in time); searching a rotated list, which is what a ring buffer of recent messages looks like. All existing.
- **Fit:** Natural. `git bisect` is read as one of the team's tools.
- **Existing content:** all four Chapters kept. Chapter 1 opens with jump-to-date, builds the simple search, and keeps "the midpoint that overflowed" as its incident and deep dive. Rewrite size: Reframe.
- **Sources:** existing citations (OpenJDK, Go, C++, git); new lead L24.

#### Two pointers (`two-pointers`)

- **Piece:** the sync merge and the compactor. Merging a device's stretch of messages into the server's timeline, and rewriting a log in place without its deleted messages.
- **Product problem:** a laptop was offline on a flight. It holds 300 messages in order; the server holds 5,000 newer ones in order. On reconnect there must be one ordered timeline with no message twice. Sorting everything again ignores that both sides were already sorted. Second story: "delete for everyone" leaves holes in the log, and closing them should not need a second copy of the channel.
- **Where it breaks:** merging two runs is one pass. At stage 3 a channel's history is spread over many servers, and merging 64 runs two at a time re-copies the growing result again and again, which hands over to Heaps. Compacting a very large log in place blocks its writers, which is why real stores compact into a new file.
- **Problems practise:** reverse and trim in place, palindromes, pair sum and triples in sorted data, merging runs where the newest wins, compacting repeats, partitioning, the middle of a list, detecting a loop. All existing.
- **Fit:** Natural for merging, compacting and trimming. The converging-ends Problems (pair sum, triples, widest container, water between bars) are the practice set, and the loop detector is a guard Parley uses on reply chains but is taught on plain data.
- **Existing content:** all four Chapters kept. "LevelDB: merging sorted runs" is already the piece and is the Topic's showcase. CPython's reverse loop becomes the deep dive of Chapter 1. Rewrite size: Reframe.
- **Sources:** existing citations (CPython, LevelDB, Go, Emacs); new lead L15.

#### Stacks (`stacks`)

- **Piece:** text handling. Checking and rendering what people type: bold inside italic inside a quote, code spans, brackets in a search filter; and undo in the message box.
- **Product problem:** someone posts `**release notes` and never closes the bold. Without knowing which marker was opened last, everything after it in the channel renders bold. Nested markers must close in the reverse of the order they opened. Second story: a message with 100,000 nested quote markers crashes the renderer, because each level of nesting used one more frame of the program's own call stack.
- **Where it breaks:** hostile depth. Any parser that recurses once per nesting level can be crashed by a deep enough message, so real parsers cap depth or keep their own stack. That second story is the bridge into how a language's call stack works, which is where the Go material belongs.
- **Problems practise:** frames pushed and popped; growing and shrinking a stack; push, pop and a stack that knows its minimum; merging pending runs; the next longer run; matching brackets; evaluating a postfix expression. All existing.
- **Fit:** Natural for the parser and undo. The Timsort Chapter is language internals and is read as a deep dive.
- **Existing content:** all four Chapters kept. The honest difficulty is order. The Main Line starts with Go's goroutine stacks and reaches brackets last, and the product story wants brackets first. Reordering the Main Line means new Reference Code for every step in three Languages and disturbs Builds in progress. Recommended for now: keep the order, and open Chapter 1 with the crash story, so the call stack is met as the cause of a product failure and Go's growth rule becomes that Chapter's deep dive. Rewrite size: Reframe, reorder wanted.
- **Sources:** existing citations (Go runtime, JDK, CPython); new leads L7, L10.

**Milestone 1 is reached here.** See [Milestones](#milestones).

### Milestone 2: a server many people share

#### Bit manipulation (`bit-manipulation`)

- **Piece:** permissions and packed ids. What a person may do in a channel as one word of flags; a message id as one number with a time, a server and a counter packed into it; and a small filter that says "certainly not here" before a slow lookup.
- **Product problem:** every post checks "may this person post here?". Comparing lists of permission names on every message is slow and easy to get wrong when roles combine. One AND on a word of flags answers it, and roles combine with OR. Second story: before reading the disk to see whether a link was posted before, ask a filter that is never wrong when it says no.
- **Where it breaks:** a word has 64 flags and a product grows past 64 permissions. A bitmap of who has read a channel is 10 million bits, 1.25 MB, for one channel; for 2,000 channels it is 2.5 GB, which is why compressed bitmaps exist. A filter that is too small for its contents says "maybe" too often and the disk reads come back.
- **Problems practise:** reading a field as signed, adding with carries, flags in words, counting set bits, XOR to rebuild and to find what is missing, the lowest set bit, counting bits from 0 to N, sizing and building a Bloom filter. All existing.
- **Fit:** Natural. RAID 5 parity is read as the machine room.
- **Existing content:** all four Chapters kept. Chapter 1 opens with the packed id, which makes "read a field out of a word" the natural first step; the kernel's `sign_extend32` becomes its deep dive. Rewrite size: Reframe.
- **Sources:** existing citations (Linux, JLS, Roaring, LevelDB); new leads L2, L3, L6.

#### Linked lists (`linked-lists`)

- **Piece:** the cache of hot channels. Keep the most recently opened channels' messages in memory and drop the one nobody has touched for longest.
- **Product problem:** at stage 2 there are 2,000 channels and most reads hit a few dozen. Reading a channel from disk on every open is slow, and memory holds only so many. On every read the cache must move that channel to "most recent" and, when full, drop the oldest. In an array both moves shift everything in between. In a list each is a few pointer changes, and a table finds the entry.
- **Where it breaks:** every read now writes the list, so many threads fight over one lock on it. Links cost memory: 10 million entries with two 8-byte pointers each is 160 MB of pointers. Real caches split the list, or give up exact order and sample.
- **Problems practise:** adding and unlinking in a ring; getting from a node back to its object; a head with one pointer; splicing, reversing and merging without allocating; checking a list for corruption; the cache itself. All existing.
- **Fit:** Natural. The kernel's design of a node that lives inside its object is the right deep dive, because a cache entry sits in a list and a table at once.
- **Existing content:** all five Chapters kept. The cache is the last Chapter today and is the reason for the whole Topic, so Chapter 1 opens with the cache problem and says the Topic builds up to it. The Build models pointers as numbered cells of a small memory; that needs a plain bridge before it. Rewrite size: Reframe.
- **Sources:** existing citations (Linux, CPython); new leads L14, L15.

#### Sliding window (`sliding-window`)

- **Piece:** the rate limiter and spam guard at the front door.
- **Product problem:** a stuck bot posts 500 messages in ten seconds into the main channel and every phone in the company buzzes. The rule "no more than 5 messages in any 5 seconds for one person" needs a count of what happened in the last 5 seconds, for each person, on every post. Second story: ten wrong passwords in a minute should lock sign-in for that address.
- **Where it breaks:** counting per period and resetting lets a double burst through at the boundary. Keeping every timestamp is exact but heavy: an integration allowed 10,000 requests an hour needs 10,000 timestamps, 80 KB, and a million integrations need 80 GB, against 16 MB for two counters each. And with many servers at the front door, one person's count is spread across them.
- **Problems practise:** count per period then reset, the busiest K seconds, two numbers in place of a window, how much fits a window, the shortest stretch that carries enough, who gets banned, the longest stretch with no repeat, the maximum of every window. All existing.
- **Fit:** Natural. This is already the most product-shaped Topic. TCP's window is read as the machine room.
- **Existing content:** all four Chapters kept. The kernel's `___ratelimit` code moves below the simple version. Rewrite size: Reframe, the lightest of the 18.
- **Sources:** existing citations (Linux, Cloudflare, TCP, fail2ban); new leads L4, L27.

#### Math and geometry (`math-geometry`)

- **Piece:** there is no single piece, and the document does not pretend there is. The roadmap topic is itself a grab-bag. Each Chapter gets its own small piece of Parley: counters that must not overflow; agreeing on a secret key for private messages; turning and cropping an image attachment; schedules that line up.
- **Product problem:** a message counter held in 32 bits. At stage 3, 2,147,483,647 messages is a little over two days of traffic, and then the next id is negative. Second story: two phones must agree on a key for a private conversation over a connection the server can read, which is done with powers and remainders of very large numbers. Third: a photo taken sideways must be turned a quarter turn before it is shown.
- **Where it breaks:** fixed-width numbers wrap silently. Numbers with no ceiling cost more the longer they get, and multiplying two of them the plain way takes time that grows with the square of their length. Raising to a power by repeated multiplying is hopeless for the sizes key agreement uses, where squaring gets there in a few hundred steps.
- **Problems practise:** wrapping at 32 bits, multiplying long numbers, power by squaring and with a modulus, a matrix as one block with strides, reading in a spiral, turning in place, greatest common divisor, primes from a sieve. All existing.
- **Fit:** Workable. Reading a matrix in a spiral and zeroing rows and columns are the practice set.
- **Existing content:** all four Chapters kept, each opening with its own small product problem. CPython's integers, the kernel's `int_pow` and NumPy's strides become deep dives. Rewrite size: Reframe.
- **Sources:** existing citations (CPython, Go specification, Linux, NumPy); new lead L22, whose fit to the power-with-a-modulus Problem is to verify.

#### Trees (`trees`)

- **Piece:** threads, and the history index on disk.
- **Product problem:** someone replies to a reply to a reply. The app shows the thread indented, with "12 replies", lets it be collapsed, and shows what a reply was answering. The reply-to links are a tree, and showing it is a walk. Second story: jump-to-date on history that is on disk needs an index that stays shallow.
- **Where it breaks:** message ids arrive in rising order. Put rising keys into a plain search tree and every key goes to the right of the last, so the tree is a list a million deep. That is why a search tree must balance itself, and Parley's own data forces it. On disk a balanced two-way tree over a billion messages is about 30 levels, so 30 reads; a tree with 200 keys a node is 4 levels, because 200^4 is 1.6 billion. And a reply chain 100,000 deep crashes a recursive walk, so depth is capped.
- **Problems practise:** height, refusing a tree that is too tall, mirroring, inserting and finding in a search tree, checking the search rule, a small B-tree, depth-first and level orders, the view from one side, the lowest common ancestor, saving and restoring a tree. All existing.
- **Fit:** Natural. git's common ancestors are read as the team's tools.
- **Existing content:** all five Chapters kept. Chapter 1 opens with a thread, where height and the depth cap are product needs, and SQLite's expression tree becomes the second real use of the same cap. The B-tree Chapter links back to Binary search with a one-sentence recap, since Binary search is not a Prerequisite of Trees. Rewrite size: Reframe.
- **Sources:** existing citations (SQLite, Linux, Rust, Go, git); new lead L16.

**Milestone 2 is reached here.**

### Milestone 3: find anything

#### Tries (`tries`)

- **Piece:** typing aids and the router. Completing a mention, an emoji name, a command or a channel name from its first letters; sending `/channels/42/messages` to the right handler.
- **Product problem:** someone types `@al` and expects alice, alan and alberto before the next keystroke, then `@ali` and expects the list to narrow. The honest first answer is a sorted list and a binary search for the prefix, and the Chapter should say so. The trie earns its place when names are added all day (a sorted array shifts on every insert), when each prefix should carry its own data such as its best few matches, and when many keys share long prefixes.
- **Where it breaks:** memory. One node a character, with a table of children in each node, is far larger than the names: 10 million names of about 10 characters is up to 100 million nodes before sharing. That is why real tries squeeze chains of single children into one node and choose their child storage with care.
- **Problems practise:** insert, find and delete; counting nodes after compression; the longest matching prefix; children as a list or a map; routing a path; counting with a wildcard; listing by prefix; the best few under a prefix. All existing.
- **Fit:** Natural. The Linux route table is read as the machine room.
- **Existing content:** all four Chapters kept. Chapter 1 opens with autocomplete; Redis's rax layout becomes its deep dive. "Go ServeMux" is already Parley's router. Rewrite size: Reframe.
- **Sources:** existing citations (Redis, Linux, Go); new leads L7, L8.

#### Heaps (`heaps`)

- **Piece:** the scheduler. Reminders, scheduled messages, messages that expire, retries; and "the best few" of anything.
- **Product problem:** someone sets "remind me in 20 minutes". At stage 2 there are 50,000 reminders waiting. Every second the server must know which is due first. Checking all 50,000 each second is 50,000 checks to find, most seconds, nothing. Keeping them sorted makes every new reminder shift half the list. A heap knows the next one at a glance and takes about 16 steps to add one, because 2^16 is 65,536. Then people snooze and cancel, so entries must change or go away.
- **Where it breaks:** most timers in a server are cancelled before they fire (a timeout that did not happen), so a heap spends its effort ordering work that never runs, and one heap behind one lock holds everyone up. Large systems move to timing wheels. Pulling an entry out of the middle of a heap is awkward, which is why real schedulers mark entries dead and clean up later.
- **Problems practise:** push, pop and peek; counting comparisons; building a heap in one pass; keeping the largest N; a running median; which timer fires next; four children a node; update and cancel by id; drop now and clean later. All existing.
- **Fit:** Natural. The existing Build already "grows into a timer scheduler".
- **Existing content:** all five Chapters kept. Chapter 1 opens with the reminder; `heapq`'s layout follows the simple version. Rewrite size: Reframe, light.
- **Sources:** existing citations (CPython, Go, libuv, Kubernetes, asyncio); new lead L19.

#### Backtracking (`backtracking`)

- **Piece:** the pattern matcher behind keyword alerts and word filters. "Notify me when a message matches `(prod|production) (down|outage)`."
- **Product problem:** a pattern offers choices, and a matcher that cannot tell in advance has to try one, follow it, and go back. The incident is real and public: a single pattern, matched by trying and undoing, has taken large services down, because on the wrong input the number of ways to try doubles with each character.
- **Where it breaks:** exactly there. A pattern with 30 places that can each match two ways has 2^30, about a billion, paths. The fix that real engines chose is to remember which states have been tried, which is the existing Go Chapter.
- **Problems practise:** matching with alternatives, tracing a word through a grid, cutting a word into palindromes, counting states with and without memory, resolving versions, every subset and every ordering, combinations that reach a sum, placing queens, exact cover. All existing.
- **Fit:** Workable, and the weakest of the 18. The first two Chapters are Parley's matcher and its failure. The other three are not Parley: pip's resolver is the team's tools, and subsets, orderings, the queens and exact cover are the practice set. They stay, because the roadmap needs them and the move (choose, explore, undo) is the same, but their statements claim no chat feature.
- **Existing content:** all five Chapters kept. The first Chapter already opens with a plain example; the rewrite puts the alert and the outage in front of it and the `_sre` opcode at the end. Rewrite size: Reframe.
- **Sources:** existing citations (CPython, Go, pip, itertools, Knuth); new leads L11, L12, L13.

#### 1-D dynamic programming (`dp-1d`)

- **Piece:** cutting and laying out text. Cutting `#throwbackthursday`, or a sentence in a language written without spaces, into words the search index knows; breaking a message into lines for a plain-text digest.
- **Product problem:** a search for "thursday" should find the message tagged `#throwbackthursday`. Taking the longest known word first can paint itself into a corner: with the words `ab`, `abc` and `cd`, the text `abcd` cut greedily starts with `abc` and is left with `d`. Trying every way to cut is the backtracking of the Topic before, and it asks the same question about the same tail of the text again and again.
- **Where it breaks:** a text of 30 letters can be cut in 2^29, about 537 million, ways, but it has only 30 different tails. Answering each tail once is the whole idea. It breaks again when the vocabulary is large, because "is this stretch a word?" must be fast, which is the trie from Tries; and when the table is kept whole though only its last few entries are read.
- **Problems practise:** counting ways once, what a cache would report, where lines break, picking without neighbours, the fewest coins, cutting digits into codes, cutting by a vocabulary. All existing.
- **Fit:** Workable. Cutting text and breaking lines are real needs of Parley's search and digests. Climbing stairs and picking without neighbours are the practice set.
- **Existing content:** all four Chapters kept. The order wants care: the cutting story is the product opening, but it belongs to the last Chapter (SentencePiece). Recommended: Chapter 1 opens with the cutting problem as the Topic's goal, uses the staircase as the simple version, and keeps `functools.cache` as its deep dive. Rewrite size: Reframe, reorder wanted.
- **Sources:** existing citations (CPython, TeX, git, SentencePiece); new leads L18, L20.

#### 2-D dynamic programming (`dp-2d`)

- **Piece:** forgiving typos, and showing what changed. "Did you mean" in search and mentions; the marked-up difference between a message and its edit.
- **Product problem:** someone searches for "recieve" and gets nothing, though the word they meant is in a thousand messages. The app needs the known words nearest to what was typed, and "nearest" needs a number: the fewest single-letter changes from one word to the other. Second story: a message was edited and people want to see what changed, which is the longest run of letters the two versions share.
- **Where it breaks:** one comparison of two 7-letter words fills 49 cells. Against a vocabulary of 500,000 words that is about 24.5 million cells for one search, and a thousand searches a second cannot afford it. Real systems give up early once a word is clearly too far, keep two rows of the table instead of all of it, and pick candidates cheaply before they compare.
- **Problems practise:** the letters two words share and which ones, weaving two words, the cheapest seam, keeping the most value within a budget, the cheapest edit between two words, giving up past a limit. All existing.
- **Fit:** Workable. The spell-suggestion and edit-distance Chapters are Parley's search. The seam Chapter (image resizing) belongs loosely to attachments. The memory-budget Chapter maps to which channels to keep in a fixed cache, which is honest but thin.
- **Existing content:** all four Chapters kept. Chapter 1 already opens close to a product; the rewrite puts the failed search in front. PostgreSQL's two-row trick is the Topic's "where it breaks" showcase. Rewrite size: Reframe.
- **Sources:** existing citations (Hunspell, liblqr, PyTorch, PostgreSQL); new leads L17, L18, L26.

**Milestone 3 is reached here.**

### Milestone 4: a network of servers

#### Greedy (`greedy`)

- **Piece:** sending less and sending the right thing first. Squeezing what goes over the wire; choosing which delivery to run next; turning a banned address range into the fewest rules.
- **Product problem:** on a phone's data connection, catching up on a busy channel is a lot of text, and text has common letters and rare ones. Give the common ones short codes. The greedy step (join the two rarest, repeat) is simple, and the Topic's point is that someone proved it cannot be beaten. Second story: 3 million notifications are late after an outage; run the one with the nearest deadline first.
- **Where it breaks:** a greedy choice with no proof is wrong quietly. The same Topic shows one that is only a good guess. Under overload, earliest-deadline-first makes everything late together, so real schedulers decide what to give up. And compression costs memory for every open connection: a 32 KB window each is 32 GB across a million connections, before anything else is counted.
- **Problems practise:** the biggest block that fits, the fewest bits for a text, the least lateness, which jobs to give up, taking the longest match or waiting one position. All existing.
- **Fit:** Workable. Each Chapter has a real Parley need, but they are four separate needs.
- **Existing content:** all four Chapters kept. "CPython: the biggest block that fits" opens with the ban list and keeps `ipaddress` as its deep dive. Rewrite size: Reframe.
- **Sources:** existing citations (CPython, zlib, Linux); new leads L5, L21.

#### Graphs (`graphs`)

- **Piece:** the network of people, channels and servers.
- **Product problem:** someone opens a stranger's profile and sees "you share 3 channels; you both know Omar". That is the fewest hops between two people. Other stories from the same graph: two requests that each hold one lock and wait for the other freeze the server; services must start in an order their needs allow; two companies link a shared channel and the app must know whether two accounts now belong to one connected group; a message must take the cheapest path between regions.
- **Where it breaks:** a table with a cell for every pair of 10 million people has 10^14 cells, 12.5 TB at one bit each, to hold a graph where each person knows a few hundred others; lists hold it in a few GB. A search that fans out from one well-connected person touches a million people in two hops and a billion in three, if each knows a thousand. And the graph stops fitting on one machine.
- **Problems practise:** edges in lists, the matrix and its cell count, the route with the fewest edges, depth-first order, whether an edge would close a circle, ordering tasks and running ready ones together, whether two nodes are in one group, the edge that joins nothing new, counting islands, the cheapest route, the hardest node to reach. All existing.
- **Fit:** Natural for representation, fewest hops, groups and ordering. The lock validator and task ordering are the team's tools; OSPF is the machine room.
- **Existing content:** all five Chapters kept. Chapter 1 opens with who-is-in-what at stage 3, which makes matrix against list a product decision with the numbers above; Boost's advice follows as what a real library says. Each later Chapter opens with its own story from the list above. Rewrite size: Reframe.
- **Sources:** existing citations (Boost, Linux, CPython, coreutils, Go, RFC 2328, FRRouting, OpenCV); new leads L9, L25.

#### Intervals (`intervals`)

- **Piece:** ranges of time and ranges of messages. Which messages a device already holds; do-not-disturb hours; calls and who is in them.
- **Product problem:** someone scrolls far up in a channel, then jumps to the bottom. The app holds messages 100 to 250 and 900 to 1000. Scrolling fetches 240 to 300. It must now know that it holds 100 to 300, and that 301 to 899 is still missing. Without merging, the list of fetched ranges grows with every scroll and the same messages are fetched twice. Second story: how many calls run at once at the busiest moment, which decides how many call servers to rent.
- **Where it breaks:** "which of these overlap this one?" answered by walking every range is fine for one device and hopeless for a million scheduled calls, which is what the interval tree is for. Peak overlap needs the ends sorted and swept, not every pair compared.
- **Problems practise:** merging ranges, the numbers no range holds, placing a range into a sorted list, cutting a range out, finding what overlaps, how many overlap at once, giving each interval a room. All existing, and every one maps to a Parley need.
- **Fit:** Natural.
- **Existing content:** all four Chapters kept. Chapter 1 opens with the fetched ranges; Go's character-class parser becomes its second real use and deep dive. Rewrite size: Reframe.
- **Sources:** existing citations (Go, Linux).

**Milestone 4 is reached here.**

## Milestones

A milestone is a point where the Topics done so far make a part of Parley that works. Each gets one **milestone Topic** on the Map: a system-design Chapter, then a short capstone Build that joins the pieces. Why a Topic and not a Chapter inside an existing Topic: a milestone belongs to several Topics at once, a Topic can list them all as Prerequisites, and adding a Chapter to an existing Topic would take Complete away from Learners who had finished it. This is a product decision and is question 3.

In a capstone the Learner may use the Language's own list, map and heap. They have built each by hand by then, and using the real one is the point.

The system-design Chapter of each milestone has the same five parts: what this part of Parley must do; a sketch of its pieces and the path of one request through them; the numbers at the next stage up, worked out; what real systems of this kind did, cited; and what Parley still cannot do, which names the next milestone.

| | Milestone | Needs these Topics Complete | What Parley can do | The design Chapter | The capstone Build |
|---|---|---|---|---|---|
| 1 | **One channel on one machine** | Stacks, Binary search, Two pointers, Hash tables (and so Dynamic arrays) | Take posts into a channel, edit and delete by id, serve history a page at a time, jump to a date, merge what an offline device sends, and reject broken markup | The message store. The write path and the read path of one channel; what is in memory; what is lost on a restart and why real stores write a log to disk first; the day 10,000 people join | A channel server: post, edit, delete, history page, jump, sync |
| 2 | **A server many people share** | Bit manipulation, Linked lists, Sliding window, Math and geometry, Trees; milestone 1 | Give every message an id no other server will give, check permission on every action, hold each person to a rate, keep hot channels in memory and the rest on disk, and show threads | The request path. Sign-in, limit, permission, write, read through the cache; cache against store; what happens to all of it when there are two servers | The front door: packed ids, a permission check, a per-person limit, a cache in front of a slow store with the reads counted |
| 3 | **Find anything** | Tries, Heaps, 2-D dynamic programming (and so Backtracking and 1-D); milestone 2 | Complete names as they are typed, fire reminders on time, raise keyword alerts without being stalled by a pattern, and search messages with typos forgiven and the best few results first | Search for a chat app. Words to lists of message ids; answering a two-word search by walking two lists; the best K with a heap; indexing as messages arrive; one index per workspace | Message search: index, a two-word query, best K, prefix completion, with "did you mean" as an Extra |
| 4 | **A network of servers** | Graphs, Intervals (and so Greedy); milestone 3 | Say how two people are connected, start its services in order, route between regions, squeeze what it sends, deliver by deadline, respect do-not-disturb and size its call servers | The whole of Parley at stage 3. Who is told about a message and when; presence; many regions; a back-of-envelope budget for 10 million people; and what was left out on purpose | Notifications: who should be told (the graph and the quiet hours), in what order (the deadline), and the busiest moment |

Milestone 4's design Chapter is the capstone of the whole spine: it is the one place that draws every piece on one page.

## The pacing rule

**The rule.** A Topic starts with the product problem and a plain-language picture, then the simplest version that works, and only then the cost, the complexity and the language internals.

A reviewer checks the **first Chapter of a Topic** against these eight points, in this order. Each is a yes or a no.

1. **Opening: the product problem.** Everything before the first `##` heading tells of a person using Parley, or an incident, and what went wrong or would. It contains no name from a language runtime, kernel or library, no link to source code, no code block and no Big-O.
2. **Plain picture.** The next section explains the idea with an everyday picture and no code. It ends with the idea in one sentence.
3. **Simple version.** The next section builds the smallest version that works, as at most 15 lines of code or a trace on at most 10 items. The Chapter's first Problem builds this and nothing more.
4. **Numbers before notation.** The cost is first shown as a count worked out in the text at one of Parley's stage sizes. Big-O, "amortised" and "worst case" first appear after that count, each defined in the sentence that brings it in.
5. **Where it breaks.** One section says at which stage the simple version stops working, with the arithmetic shown, and what is done about it.
6. **Real use cases.** The Topic names at least two real systems that made this decision, each cited under `docs/content-standards.md`, and at least one is not a language runtime or standard library.
7. **Deep dive last.** Material on how CPython, the Go runtime, the JDK or the kernel does it sits under a heading that begins "Deep dive:", after points 1 to 5. No Core Problem needs a fact that appears only in a deep dive: a Problem that builds a real system's rule states the rule in full.
8. **A worked showcase.** Somewhere in the Topic is one before-and-after the Learner can reproduce by running their Build: the same task done the naive way and the Topic's way, with both counts.

Each **later Chapter** of a Topic is checked against points 1, 4, 5 and 7 only: it opens with its own product problem in a few sentences, counts before it names, says where it breaks, and keeps internals for the end.

Two rules for the writing, also checkable:

- **Every new term is defined in the sentence that introduces it**, and a section introduces one new idea.
- **A sentence about Parley is Parley's design or arithmetic. A sentence about a real system has a citation.** A made-up scenario is told as one ("Suppose a bot...") and never as something that happened to a real product. Real incidents are cited.

### The rule applied: Dynamic arrays

This is the Topic the maintainer's complaint quotes ("cpython", "a growth rule changed"), and it is the first thing every Learner reads. The outline keeps every Chapter id, every Problem and every Test. Section titles are working titles.

**Chapter 1** (id `dynamic-arrays-cpython-list`, today "CPython: a list that leaves room"). Working title: "A channel that never fills up".

| # | Section | What it says | From today's Chapter | Problem |
|---|---|---|---|---|
| 1 | Opening | Parley's first version gives a channel 1,024 slots. Day nine, the 1,025th post fails. A bigger fixed size wastes memory on 2,000 quiet channels. One more slot each time is tried next. | new | |
| 2 | A notebook that is full | You cannot glue one line onto a full notebook. You buy a new one and copy the old one in. Buy one a line longer and you copy the whole notebook for every line you write. Buy one twice as thick and you copy rarely. The idea in one sentence: leave room in proportion to what you already have. | new | |
| 3 | The simple version | A block, a length and a capacity. Append: if the block is full, make one twice the size and copy; then write. A trace of five appends, capacities 0, 1, 2, 4, 8. | the Build's own rule, stated in Problem 1 today | Append, get and length |
| 4 | Count before you name | 100,000 posts. One slot at a time: 4,999,950,000 copies. Doubling: 131,071. Then the names: the one append that copies is O(n) in the worst case; spread over the run it is constant, which is what amortised means. | "Why leave room at all", which today uses 1,000 appends | Count the copies |
| 5 | Where it breaks | The 10-million-message channel: one post copies 80 MB while readers wait. Real stores cap the block and start a new one. Giving room back: shrink only below half, or a post and a delete at the edge move the block every time. | "Giving memory back" | Pop and shrink |
| 6 | Who else does this | A database's string buffer grows the same way (lead L14). So does the list in each of the three Languages the Learner is writing in, which is the next section. | new, cited | |
| 7 | Deep dive: CPython's list | `ob_item`, `allocated` and `ob_size`; the fast and the full path of `append`; `list_resize` and its formula; the growth pattern 0, 4, 8, 16, 24; why growing by an eighth costs at most 9 copies an append where doubling costs 2. | "A list is one block of slots", "Append: the fast path and the full path", "How much bigger?", and the last part of "Why leave room at all" | CPython's growth rule |
| 8 | What the Build leaves out | Unchanged. | "What the Build leaves out" | |

**Chapter 2** (id `dynamic-arrays-go-slices`, today "Go: a growth rule that changed"). Working title: "How much room is the right amount".

1. Opening: Parley's memory graph climbs in steps, and a channel that has just grown is half empty. The team asks whether doubling is too much.
2. The trade in numbers: growing by a factor g costs at most g / (g - 1) copies an append and leaves up to (g - 1) / g of the block empty. A small table for 2, 1.5, 1.25 and 1.125.
3. Where it breaks: a rule with a sudden change in it. A channel with room for 1,000 that doubles ends up bigger than one with room for 1,024 that grows by a quarter.
4. Deep dive: Go made exactly that change. Today's whole Chapter (the slice struct, `growslice`, the rule before and after Go 1.18, the commit message, why the Build's numbers differ from real Go) sits here, in its current order.
5. Problems: Go's growth rule (Core), Go's old rule (Extra). Unchanged.

**Chapter 3** (id `dynamic-arrays-promises`, today "Rust and Java: what is promised"). Working title: "When the caller knows better".

1. Opening: at start-up Parley loads a channel of 50,000 messages from disk. It knows the count before it starts, yet appending one at a time moves the block 16 times on the way to room for 65,536. And when a channel is archived, its spare room is wasted for good.
2. The simple version: ask for the room once before filling; give back the spare after.
3. Real use cases, cited: Rust's `Vec` and Java's `ArrayList` promise the cost and not the number, and both give the caller these two controls. Today's sections "The promise is the cost, not the factor", "Shrinking is a choice too" and "Controls for the caller".
4. Deep dive: "What they do today", with the four-system table.
5. Problem: Reserve and shrink to fit. Unchanged.

Checked against the rule: Chapter 1 passes all eight points (point 6 is met by lead L14 once verified, plus the four languages in Chapter 3; point 8 is the pair of counts in section 4, which Problem 2 reproduces). Chapters 2 and 3 pass points 1, 4, 5 and 7. Nothing is dropped, and nothing a Learner has done is lost.

## Meeting the content standards

`docs/content-standards.md` stays as it is in force. How the spine meets each part:

- **Sources.** Every claim about a real system keeps an inline primary-source citation. The existing citations move with their sentences into the deep dives and use-case sections; a moved sentence keeps its link. New claims come from the [Source leads](#source-leads) and are written only after a person has opened the source.
- **Claims about Parley.** Parley is not a real system, so a sentence about it is a design statement or arithmetic, not a sourced fact. The standards do not cover this case today, and CONTEXT.md defines a Chapter as a reading "about one real system". Both need one added line each, which is question 7. Until then the pacing rule's last writing rule carries it: Parley's sentences are design or arithmetic, real systems' sentences are cited, and no made-up scenario is told as a real event.
- **Numbers.** A number about Parley is worked out in the text from the stage sizes. A number about a real system is quoted from its source with the version. Stage sizes are never presented as a real product's traffic.
- **Code that runs.** The Builds, Tests and Reference Code are unchanged by a reframe, so the content check passes as before. New code in a Chapter (the simple version in point 3) is run before merge, like any sample. Capstone Builds are new content and ship Reference Code in all three Languages that passes the content check.
- **Correct Big-O.** Every existing complexity claim keeps its label (worst case, amortised, expected). The rule adds an order, not a relaxation: the count first, then the claim.
- **Originality.** Parley, its stories and the capstone statements are written fresh. Framing each Problem by Parley's piece is the standard's own advice ("Framing each problem by the real system it comes from makes original wording the natural path").
- **Human check.** Each rewrite ends with the maintainer's review. A rewritten Topic is read once, after the rewrite, and that reading is the review its content issue (#252 to #268, #113) asks for. No rewrite card closes those issues.

### Kept, moved, dropped

| Topic | Kept as is | Moved to a deep dive | Dropped |
|---|---|---|---|
| Dynamic arrays | All Problems; the growth-factor argument; the Rust and Java promises | CPython's struct and `list_resize`; Go's two rules | Nothing |
| Stacks | All Problems; bracket matching; the minimum stack | Go's stack constants and growth; Java's `Stack`-is-a-`Vector` history; Timsort's pending runs | Nothing |
| Binary search | All Problems; bounds; searching for an answer | The JDK source walk (the overflow itself stays up front as the incident) | Nothing |
| Two pointers | All Problems; the LevelDB merge as the showcase | CPython's reverse loop; Emacs's loop check | Nothing |
| Hash tables | All Problems; resizing; hostile keys as an incident | CPython's two arrays and probe sequence; Java's treeified bins | Nothing |
| Linked lists | All Problems; the cache | The kernel's `list_head`, `hlist` and debug checks | Nothing |
| Sliding window | All Problems; the Cloudflare and fail2ban use cases | The kernel's rate-limit and min-max code; TCP as a side-system reading | Nothing |
| Math and geometry | All Problems | CPython's integers; the kernel's power and gcd; NumPy's strides | Nothing |
| Bit manipulation | All Problems; Bloom filter sizing | The kernel's sign extension; the Java specification on shifts | Nothing |
| Trees | All Problems; B-tree pages; walking a tree | SQLite's `Expr` struct; the kernel's red-black tree code | Nothing |
| Tries | All Problems; the router | Redis's rax node layout; the kernel's route table | Nothing |
| Heaps | All Problems; timers; update and cancel | `heapq`'s and `container/heap`'s code | Nothing |
| Backtracking | All Problems; "never enter the same state twice" | The `_sre` opcode; itertools' internals | Nothing |
| 1-D dynamic programming | All Problems; TeX and SentencePiece as use cases | `functools.cache`'s code; git's row trick | Nothing |
| Greedy | All Problems; the proof for the first Chapter | `ipaddress`'s code; zlib's internals | Nothing |
| 2-D dynamic programming | All Problems; Hunspell and PostgreSQL as use cases | Line-by-line source reading | Nothing |
| Graphs | All Problems; Boost's advice; the three ways to an order | The lock validator's bounded queue; FRRouting's queue; OpenCV's union rule | Nothing |
| Intervals | All Problems | Go's character-class parser; the kernel's memblock and e820 code | Nothing |

Nothing is dropped whole, for a reason: every existing Chapter carries Core Problems on its Topic's Main Line, and removing a Chapter would orphan them and cost Learners progress. What is cut is length inside the deep dives, where long runs of quoted source lines can be shortened. A rewrite that finds a section with no place under the rule lists it in its PR for the maintainer to drop.

## The migration plan

For the planner to re-plan C413 to C429 from. The content session (`blc-content`) owns every card below.

### What a rewrite card is

One card per Topic. Its "Done when", the same for all:

- The first Chapter passes the eight points of the pacing rule; each later Chapter passes points 1, 4, 5 and 7.
- Every Chapter id and Problem id is unchanged. No Chapter and no Core Problem is added or removed. New practice, if any, is an Extra Problem.
- Each Problem statement's framing names its piece of Parley, or says it is practice. Commands, Tests and Reference Code are unchanged.
- The Topic's `summary` in `topic.json` leads with the piece of Parley.
- The content check passes; every citation is a primary source; no `[NEEDS SOURCE]` remains.
- The maintainer has reviewed it. Its content issue stays open for the maintainer to close.

### Order and dependencies

The order follows the Prerequisite graph, so it needs no change to the Map and each milestone's Topics are done before its milestone card.

| Step | Card | Topic or work | Depends on |
|---|---|---|---|
| 0 | this card | The maintainer confirms the spine | |
| 1 | new | Docs: the spine's terms in `CONTEXT.md`, its line in `docs/content-standards.md`, and the pacing rule's checklist in the content PR checklist | step 0, question 7 |
| 2 | new | **Pilot:** Dynamic arrays, from the outline above. The maintainer reads it before any other rewrite starts, and the rule is adjusted here if it reads wrong. | step 1 |
| **Content sprint 2: milestones 1 and 2** | | | |
| 3 | C416 | Hash tables | step 2 |
| 4 | C414 | Binary search | step 2 |
| 5 | C415 | Two pointers | step 2 |
| 6 | C413 | Stacks | step 2 |
| 7 | new | **Milestone 1:** one channel on one machine (design Chapter and capstone) | steps 3 to 6 |
| 8 | C420 | Bit manipulation | step 2 |
| 9 | C417 | Linked lists | step 3 (the cache uses the table) |
| 10 | C418 | Sliding window | steps 3 and 5 |
| 11 | C419 | Math and geometry | step 3 |
| 12 | C421 | Trees | steps 4, 6 and 9 |
| 13 | new | **Milestone 2:** a server many people share | steps 7 to 12 |
| **Content sprint 3: milestones 3 and 4** | | | |
| 14 | C423 | Tries | step 12 |
| 15 | C424 | Heaps | step 12 |
| 16 | C422 | Backtracking | step 12 |
| 17 | C425 | 1-D dynamic programming | steps 14 and 16 |
| 18 | C427 | 2-D dynamic programming | step 17 |
| 19 | new | **Milestone 3:** find anything | steps 13 to 18 |
| 20 | C426 | Greedy | steps 5 and 15 |
| 21 | C428 | Graphs | steps 12 and 15 |
| 22 | C429 | Intervals | steps 15 and 20 |
| 23 | new | **Milestone 4:** a network of servers. The last card of #663. | steps 19 to 22 |

This keeps the planner's two halves exactly: C413 to C421 are milestones 1 and 2, and C422 to C429 are milestones 3 and 4. What changes is the order inside each half, six new cards (the docs card, the pilot and four milestones), and one design card for the Map if question 3 is answered yes.

Within a milestone, Topics with no dependency between them can run in parallel lanes. A dependency here means the later Chapter refers to the earlier piece by name, so the earlier rewrite should be merged first.

The four Topics marked "reorder wanted" or with thin patterns (Stacks, 1-D dynamic programming, Hash tables' Extras, Backtracking's practice set) are the ones most likely to need a second pass. The plan does not include that pass; it is question 4.

### What it means for Learners' progress

Under the plan above, nothing a Learner has done is lost:

- **Ids are kept**, so every Read mark and every Submission still counts. A Topic that was Complete stays Complete, and nothing that was Unlocked becomes Locked.
- **Tests and commands are kept**, so a Learner's saved Build still passes what it passed.
- **A rewritten Chapter keeps its Read mark.** A Learner who read the old text is counted as having Read the new one and is not asked to read it again. This is the price of not resetting anyone, and it is question 5.
- **Chapter ids no longer match their titles.** `dynamic-arrays-cpython-list` will open with a chat channel. The id shows only in the address bar. Ids are stable by rule, so this is accepted.

What would cost progress, and is therefore not in the plan:

- **Adding a Chapter or a Core Problem to an existing Topic.** That Topic stops being Complete for everyone who had finished it, and their unfinished Topics that depend on it become Locked until they read or solve the new part (`rules.ts` derives each state from Read marks and Submissions every time).
- **Reordering a Topic's Chapters.** The Main Line changes, every step's Reference Code changes in three Languages, and a Build in progress no longer matches the steps before it.
- **Renaming a Build's commands** to Parley's words. Old Submissions would still count as Solved while the saved code fails the new Tests.

### What it means for the Map

- **No Topic is reordered and no Prerequisite changes.** The order of pieces above was chosen to fit the graph as it is. One soft spot: the B-tree Chapter in Trees leans on Binary search, which is not a Prerequisite of Trees. A one-sentence recap and a link cover it; adding the Prerequisite would Lock Trees for Learners who have it open.
- **Four milestone Topics are added** if question 3 is answered yes, taking the Map from 18 to 22. Each lists its milestone's Topics and the milestone before it as Prerequisites. No roadmap Topic lists a milestone, so a milestone never Locks anything and a Learner may skip all four.
- The Map artboard, `docs/content-coverage.md` and the README's Topic list would each need the four added. Whether a milestone looks different from a Topic on the Map is a design decision.

## Questions for the maintainer

Each has a recommended answer. The first is the one this document exists for.

1. **Is the spine Parley, a team chat app with its message store and its search inside it, plus the three named side-systems?** Recommended: yes. The runner-up is the search engine (Candidate B), which fits the dynamic programming Topics better and everything about people and time worse. Is "Parley" the name? It is a working name and appears in learner text, so it is the maintainer's to choose.
2. **Do Builds stay one per Topic, with the pieces joined in the milestone capstones?** Recommended: yes for now. One Build grown across all Topics is closer to "the pieces join together", but it changes ADR 0001, the Learning core's rules for seeding and Submissions, and the content format, and it would mean a Learner's broken hash table blocks their graph Topic. If the maintainer wants it, it is a product change to design on its own, after the pilot.
3. **Are the milestones four new Topics on the Map, each with a design Chapter and a capstone Build?** Recommended: yes, as leaves that nothing depends on. The alternative is a Chapter with no Problems added to an existing Topic, which the content format allows but which takes Complete away from Learners who finished that Topic and has no one Topic it belongs to. If yes: do milestone Topics look different on the Map?
4. **Should any Topic's Chapters be reordered, or any Build be rebuilt in Parley's own commands?** Recommended: not in this pass. Stacks and 1-D dynamic programming would teach better in a different order, and the Builds of Linked lists, Stacks, Bit manipulation and Math and geometry are tied to language and kernel details. Reframe all 18 first, read the result, then decide which of these earn a rebuild, knowing that a rebuild resets progress in that Topic.
5. **Is it acceptable that a Learner who Read a Chapter before its rewrite is counted as having Read the new text, and that rewrites add no Chapters and no Core Problems to existing Topics?** Recommended: yes to both. It is what keeps every Learner's progress whole.
6. **Does Dynamic arrays get a rewrite card, and does it go first as the pilot?** Recommended: yes. It has no card today (#113 covers only its review), it is the root of the Map and the Topic the complaint quotes, and reading one finished Topic is the cheapest way to find out whether the pacing rule is right before 17 more are written to it.
7. **May `CONTEXT.md` and `docs/content-standards.md` each gain a line for the spine?** Recommended: yes, as step 1. Proposed for CONTEXT.md: a Chapter is "a reading inside a Topic that starts from one piece of the spine system, the product problem that forces a data structure decision, and how real systems made it", with **Spine** and **Milestone** added as terms. Proposed for the standards: "A sentence about the spine system is its design or arithmetic shown in the text, and is never phrased as a fact about a real product. A made-up scenario is told as one. Real incidents are cited."
8. **May a capstone Build use the Language's own list, map and heap?** Recommended: yes.
9. **May rewrites add Extra Problems for the usual patterns a Topic lacks** (for Hash tables: seen-before, count by key, group by key)? Recommended: yes, as Extras only, listed in the rewrite's PR.

## Source leads

Leads for the content writer, not citations. **Exists** means I am confident the document exists and is by the system's own builders; its wording, version and the exact claim still need the human check that the standards require. **To verify** means I could not confirm that it exists, or that it says what the lead needs. No sentence in a Chapter may rest on any of these until a person has opened it.

| | Lead | For | Status |
|---|---|---|---|
| L1 | Discord engineering blog, "How Discord Stores Billions of Messages" (2017) and "How Discord Stores Trillions of Messages" (2023) | Dynamic arrays, milestone 1: how a real chat service splits a channel's history into pieces; real traffic figures | Exists. The figures and the way history is split: to verify |
| L2 | Discord developer documentation, "Snowflakes" | Bit manipulation, Math and geometry: an id packed from a time, a server and a counter | Exists. The field widths: to verify |
| L3 | Discord developer documentation, "Permissions" | Bit manipulation: permissions as a word of flags | Exists. How it handles more flags than a number holds: to verify |
| L4 | Discord developer documentation, "Rate Limits" | Sliding window | Exists |
| L5 | Discord developer documentation, "Gateway", on compression | Greedy | Exists. What is compressed and how: to verify |
| L6 | Twitter engineering blog, "Announcing Snowflake" (2010) | Bit manipulation: ids made on many servers with no shared counter | Exists |
| L7 | Zulip server source and developer documentation | Stacks (its Markdown processor), Tries (its typeahead), Sliding window (its rate limiter) | The repository exists. Which files, and what each does: to verify |
| L8 | Mattermost server source, in Go | Linked lists (its cache), Tries (autocomplete) | The repository exists. Which files, and what each does: to verify |
| L9 | The Matrix specification | Graphs: a room's history as a graph of events | Exists. The wording: to verify |
| L10 | The CommonMark specification, the appendix on a parsing strategy | Stacks: the stack of open markers | Exists |
| L11 | Cloudflare blog, "Details of the Cloudflare outage on July 2, 2019" | Backtracking: an outage caused by a pattern | Exists |
| L12 | Stack Exchange, "Outage Postmortem - July 20, 2016" | Backtracking: a second such outage | Exists. The address: to verify |
| L13 | Russ Cox, "Regular Expression Matching Can Be Simple And Fast" (2007) | Backtracking: why remembering states fixes it, by the author of Go's `regexp` | Exists |
| L14 | Redis documentation on key eviction; Redis source `dict.c` and `sds.c` | Linked lists (sampling in place of an exact list), Hash tables (moving entries a few at a time), Dynamic arrays (a string buffer's growth) | Exist. The lines and the growth rule: to verify |
| L15 | LevelDB `doc/impl.md`, `doc/table_format.md`, `util/cache.cc` | Two pointers, Linked lists, milestone 1 | Exist |
| L16 | SQLite, "Database File Format" | Trees: B-tree pages on disk | Exists |
| L17 | PostgreSQL documentation, `fuzzystrmatch` | 2-D dynamic programming: edit distance with a limit | Exists |
| L18 | Apache Lucene source | Heaps (best K results), Linked lists (its query cache), 2-D dynamic programming (fuzzy queries), 1-D dynamic programming (its Japanese tokenizer) | The repository exists. Which classes, and what each does: to verify |
| L19 | Varghese and Lauck, "Hashed and Hierarchical Timing Wheels" (1987) | Heaps: what replaces a heap for very many timers | Exists |
| L20 | Knuth and Plass, "Breaking Paragraphs into Lines" (1981) | 1-D dynamic programming | Exists. Whether the current Chapter already cites it: to verify |
| L21 | RFC 7692 (compression for WebSocket), RFC 1951 (DEFLATE) | Greedy | Exist. The memory a compression stream needs for each connection: to verify |
| L22 | Signal's published specifications; RFC 7919 | Math and geometry: key agreement | Exist. Whether either is an honest use of the power-with-a-modulus Problem, since Signal uses elliptic curves: to verify |
| L23 | PEP 456 | Hash tables: why Python changed its string hash | Exists. A primary source for the 2011 attacks themselves: to verify |
| L24 | Joshua Bloch, "Nearly All Binary Searches and Mergesorts are Broken" (2006) | Binary search: the overflow, by the author of the code | Exists. Whether the current Chapter already cites it: to verify |
| L25 | Bronson and others, "TAO: Facebook's Distributed Data Store for the Social Graph" (2013) | Graphs, milestone 4 | Exists |
| L26 | Myers, "An O(ND) Difference Algorithm and Its Variations" (1986) | 2-D dynamic programming: what an edit changed | Exists |
| L27 | Cloudflare blog, "Counting things, a lot of different things" | Sliding window | Exists. Whether it is the post the current Chapter cites: to verify |

Also to verify, from this document's own text:

- In **Heaps**, that most server timers are cancelled before they fire is the usual argument for timing wheels; it needs a source (L19 is the lead) before a Chapter says it.
- In **Hash tables**, that hostile keys have been used to attack real services needs its primary source (L23 is the lead).
- In **Binary search**, "for years" for the JDK's midpoint bug should be replaced by the dates the current Chapter already cites.
- In **Stacks**, that real parsers cap depth is shown today by the existing CPython and SQLite citations; a source from a chat product's own parser (L7) would be better.
- In **Greedy**, the 32 KB window is DEFLATE's largest match distance (L21); what a server really holds for each connection is more and must be read from zlib's own documentation.
- Every number in this document about Parley is arithmetic on the three stage sizes and involves no real system. The stage sizes themselves are invented.
