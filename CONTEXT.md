# BeyondLeetcode

A self-hosted place to learn data structures and algorithms through real systems: learners read how a system made a data structure decision, then solve problems built on it.

## Content

**Topic Map**:
The set of all Topics and their Prerequisites; also the Learner's home screen and progress view.
_Avoid_: Tree, roadmap, dashboard

**Topic**:
One DSA subject (e.g. heaps) on the Topic Map, holding an ordered set of Chapters.
_Avoid_: Module, unit, category

**Chapter**:
A reading inside a Topic about one real system and the data structure decision it made, followed by that Chapter's Problems.
_Avoid_: Reading, article, lesson

**Problem**:
One step of a Topic's Build, belonging to exactly one Chapter: it asks the Learner to add something to the Build, checked against Tests.
_Avoid_: Question, exercise, challenge, stage

**Core Problem**:
A Problem on its Build's Main Line; it must be Solved for its Topic to be Complete.

**Extra Problem**:
An optional Problem that branches off the Main Line; Solving it never affects Topic completion or later Problems.
_Avoid_: Bonus, optional

## Builds

**Build**:
The codebase a Learner grows across one Topic, one Problem at a time, in one Language.
_Avoid_: Project, codebase, workspace

**Main Line**:
The ordered Core Problems of a Topic; each one starts from the Build as the one before it left it.

**Branch**:
The Build copy an Extra Problem works on; its changes never flow back to the Main Line.

**Reference Code**:
The known-good Build as it stands after a given Problem, in each Language; a Learner can start any Problem from it.
_Avoid_: Starter code, scaffold, template

**Hint**:
One step of guidance on a Problem, revealed one at a time in a fixed order, that points the Learner back to the concept in the Chapter behind it.

**Solution**:
The reference answer to a Problem: an explanation plus working code in every Language, always available to the Learner.
_Avoid_: Editorial, answer

## Progress

**Prerequisite**:
A Topic that must be Complete before another Topic Unlocks.

**Locked** / **Unlocked** (Topic):
A Locked Topic cannot be opened; it becomes Unlocked when all its Prerequisites are Complete.

**Read** (Chapter):
The Learner has reached the end of the Chapter.

**Complete** (Topic):
Every Chapter in the Topic is Read and every Core Problem is Solved.
_Avoid_: Done, finished, mastered

**Solved** (Problem):
The Learner has at least one Accepted Submission for the Problem.

## Running code

**Language**:
One of Python, TypeScript or Go, chosen per Build; switching starts a new copy of the Build from Reference Code and keeps the old one.

**Test**:
One input and expected outcome a Problem is checked against; an Example Test is visible to the Learner, a Hidden Test is not.

**Run**:
Executing the Learner's code against the Example Tests; it never changes progress.
_Avoid_: Test run, try

**Submission**:
Executing the Learner's Build against every Test of the Problem and of every earlier Core Problem, producing a Verdict.
_Avoid_: Attempt

**Verdict**:
The outcome of a Submission: Accepted, Wrong Answer, Runtime Error, Time Limit Exceeded or Compile Error.
_Avoid_: Result, status

**Accepted**:
The Verdict where the code passes every Test.
_Avoid_: Passed, correct, success

**Sandbox**:
The short-lived, isolated container one piece of learner code runs in.
_Avoid_: VM, jail, judge

**Runner**:
The part of an Instance that owns the container engine and starts Sandboxes; the only part allowed to.
_Avoid_: Judge, executor, worker

## Instances and people

**Instance**:
One self-hosted installation of BeyondLeetcode, run by an operator.
_Avoid_: Server, deployment, site

**Learner**:
A person working through the Topic Map, in either mode.
_Avoid_: User, student

**Account**:
A Learner's sign-in identity; exists only in Multi-user Mode.
_Avoid_: User, profile

**Local Mode**:
An Instance with exactly one Learner and no sign-in.
_Avoid_: Single-user mode, guest, offline

**Multi-user Mode**:
An Instance with Accounts, each keeping its own progress.

**Admin**:
The Account that sets up a Multi-user Instance and manages its Accounts, Invites and Registration Mode.

**Registration Mode**:
Whether anyone may create an Account (Open) or only people with an Invite (Invite-only).

**Invite**:
A single-use link an Admin sends so one person can create an Account.
