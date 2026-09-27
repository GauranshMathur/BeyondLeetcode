# Problems are steps of one build per topic, not standalone puzzles

Each Topic has one Build: a codebase the Learner grows across its Chapters, one Core Problem at a time, starting each step from their own code as the previous step left it. We chose this over LeetCode-style standalone problems because extending your own system as each chapter teaches something new is how the data structure decisions in the readings are made in real work, and it is the product's reason to exist.

## Consequences

- A Build is fixed to one Language; switching starts a new copy from Reference Code.
- Every Problem ships Reference Code for the state after it, in all three Languages, so any Problem can be started without the ones before it. This keeps "nothing locks inside a topic" true, at the cost of more content per Problem.
- A Submission reruns the Tests of every earlier Core Problem, so a change that breaks a finished step fails.
- Extra Problems work on a Branch and never feed the Main Line, so skipping one never breaks the next Core Problem.
- Topics must be authored as a sequence of steps towards one system, which constrains how chapters are ordered and written.
