# pip: pick the newest, go back when it conflicts

Installing a package means choosing one version of it, and of each package it needs, so that every requirement holds at once. A version that looks fine alone can rule out a version another package needs. This Chapter reads how pip 24.2 chooses, and what it does when a choice turns out wrong. Its resolver is a library, `resolvelib`, that pip carries inside its own source: pip's `vendor.txt` pins `resolvelib==1.0.1` ([src/pip/_vendor/vendor.txt, line 15](https://github.com/pypa/pip/blob/97146c7f4cd85551f3dc261830a57f304e43c181/src/pip/_vendor/vendor.txt#L15)). In the Problems you write a small resolver that makes the same moves.

## Why pip has to guess

pip's documentation says why it cannot simply compute the answer: "As downloading projects is a costly operation, pip cannot pre-compute the full dependency tree. This means that we are unable to use a number of techniques for solving the dependency resolution problem. In practice, we have to use a backtracking algorithm." ([docs/html/topics/more-dependency-resolution.md, lines 44 to 47](https://github.com/pypa/pip/blob/97146c7f4cd85551f3dc261830a57f304e43c181/docs/html/topics/more-dependency-resolution.md#L44-L47)) The same page says why the dependencies are not known in advance: "dependency metadata is only available by downloading the package file, and extracting the data from it." ([more-dependency-resolution.md, lines 36 to 37](https://github.com/pypa/pip/blob/97146c7f4cd85551f3dc261830a57f304e43c181/docs/html/topics/more-dependency-resolution.md#L36-L37)) So pip learns the dependencies of a version as it goes, and what it learns can contradict an earlier choice (reading of the two quotes). The other page describes the same thing: "During dependency resolution, pip needs to make assumptions about the package versions it needs to install and, later, check these assumptions were not incorrect. When pip finds that an assumption it made earlier is incorrect, it has to backtrack, which means also discarding some of the work that has already been done, and going back to choose another path." ([docs/html/topics/dependency-resolution.md, lines 27 to 31](https://github.com/pypa/pip/blob/97146c7f4cd85551f3dc261830a57f304e43c181/docs/html/topics/dependency-resolution.md#L27-L31))

## The newest first, then the next one down

The order of the tries is part of the design. The documentation's example starts: "pip starts by picking the most recent version of tea and get the list of dependencies of that version of tea." ([dependency-resolution.md, lines 42 to 43](https://github.com/pypa/pip/blob/97146c7f4cd85551f3dc261830a57f304e43c181/docs/html/topics/dependency-resolution.md#L42-L43); Markdown code spans dropped.) And then: "Now, pip notices that the version of cup it has chosen is not compatible with the version of spoon it has chosen. Thus, pip will "go back" (backtrack) and try to use another version of cup." ([lines 44 to 47](https://github.com/pypa/pip/blob/97146c7f4cd85551f3dc261830a57f304e43c181/docs/html/topics/dependency-resolution.md#L44-L47); code spans dropped.) The same page warns what this costs: "If pip starts backtracking during dependency resolution, it does not know how many choices it will reconsider, and how much computation would be needed." ([lines 97 to 98](https://github.com/pypa/pip/blob/97146c7f4cd85551f3dc261830a57f304e43c181/docs/html/topics/dependency-resolution.md#L97-L98))

## What a state is

The resolver keeps the search as a list of states, one per pin. A state is three fields: `State = collections.namedtuple("State", "mapping criteria backtrack_causes")` ([resolvelib/resolvers.py, line 102](https://github.com/pypa/pip/blob/97146c7f4cd85551f3dc261830a57f304e43c181/src/pip/_vendor/resolvelib/resolvers.py#L102)). The mapping holds the pins: a pin is stored as `self.state.mapping[name] = candidate` ([line 262](https://github.com/pypa/pip/blob/97146c7f4cd85551f3dc261830a57f304e43c181/src/pip/_vendor/resolvelib/resolvers.py#L262)). A criterion holds the requirements on one package: "Each pair is a requirement contributing to this criterion, and the candidate that provides the requirement." ([lines 51 to 52](https://github.com/pypa/pip/blob/97146c7f4cd85551f3dc261830a57f304e43c181/src/pip/_vendor/resolvelib/resolvers.py#L51-L52)) A new state starts as a copy of the one before it:

```python
state = State(
    mapping=base.mapping.copy(),
    criteria=base.criteria.copy(),
    backtrack_causes=base.backtrack_causes[:],
)
```

([lines 131 to 135](https://github.com/pypa/pip/blob/97146c7f4cd85551f3dc261830a57f304e43c181/src/pip/_vendor/resolvelib/resolvers.py#L131-L135)) After a pin works the resolver adds one: "Pinning was successful. Push a new state to do another pin." ([line 452](https://github.com/pypa/pip/blob/97146c7f4cd85551f3dc261830a57f304e43c181/src/pip/_vendor/resolvelib/resolvers.py#L452)) So the **undo** is different from the last two Chapters. CPython put two numbers back, and Go's jobs restored values one at a time. Here every choice leaves a whole snapshot behind, and going back means dropping the top of the list. Knuth's paper, read in Chapter 5, names both ways: "a stack that contains snapshots of the relevant state information", or global data "restored when the search returns to a previous level". ([page 1](https://arxiv.org/pdf/cs/0011047v1#page=1))

## Pin, fail, go back

Each round picks what to decide next: "Choose the most preferred unpinned criterion to try." with `name = min(unsatisfied_names, key=self._get_preference)` ([lines 425 to 426](https://github.com/pypa/pip/blob/97146c7f4cd85551f3dc261830a57f304e43c181/src/pip/_vendor/resolvelib/resolvers.py#L425-L426)). The newest pin goes last in the mapping, for a reason the source gives: "Put newly-pinned candidate at the end. This is essential because backtracking looks at this mapping to get the last pin." ([lines 259 to 260](https://github.com/pypa/pip/blob/97146c7f4cd85551f3dc261830a57f304e43c181/src/pip/_vendor/resolvelib/resolvers.py#L259-L260)) If no candidate fits, the answer is a failure: "All candidates tried, nothing works. This criterion is a dead end, signal for backtracking." ([lines 266 to 267](https://github.com/pypa/pip/blob/97146c7f4cd85551f3dc261830a57f304e43c181/src/pip/_vendor/resolvelib/resolvers.py#L266-L267))

Going back starts by dropping states from the end of the list: "Remove the state that triggered backtracking." followed by `del self._states[-1]` ([lines 307 to 308](https://github.com/pypa/pip/blob/97146c7f4cd85551f3dc261830a57f304e43c181/src/pip/_vendor/resolvelib/resolvers.py#L307-L308)). It is not only dropping, though. The docstring of `_backjump` lists the steps, and one is: "Discard Y but remember its incompatibility information gathered previously, and the failure we're dealing with right now." ([lines 293 to 294](https://github.com/pypa/pip/blob/97146c7f4cd85551f3dc261830a57f304e43c181/src/pip/_vendor/resolvelib/resolvers.py#L293-L294)) The code records the failed candidate:

```python
# Also mark the newly known incompatibility.
incompatibilities_from_broken.append((name, [candidate]))
```

([lines 332 to 333](https://github.com/pypa/pip/blob/97146c7f4cd85551f3dc261830a57f304e43c181/src/pip/_vendor/resolvelib/resolvers.py#L332-L333)) That memory is the pruning of this Topic. The criterion keeps it for a purpose its docstring states: `incompatibilities` is "a collection of all known not-to-work candidates to exclude from consideration." ([lines 53 to 54](https://github.com/pypa/pip/blob/97146c7f4cd85551f3dc261830a57f304e43c181/src/pip/_vendor/resolvelib/resolvers.py#L53-L54)) A version known to clash is written down so that it can be left out. The search is also bounded: `for round_index in range(max_rounds)` ends in `raise ResolutionTooDeep(max_rounds)` ([line 457](https://github.com/pypa/pip/blob/97146c7f4cd85551f3dc261830a57f304e43c181/src/pip/_vendor/resolvelib/resolvers.py#L457)), and pip passes its own limit, `limit_how_complex_resolution_can_be = 200000`, as `max_rounds=limit_how_complex_resolution_can_be` ([src/pip/_internal/resolution/resolvelib/resolver.py, lines 94 to 96](https://github.com/pypa/pip/blob/97146c7f4cd85551f3dc261830a57f304e43c181/src/pip/_internal/resolution/resolvelib/resolver.py#L94-L96)).

## What it costs

The **worst case** is exponential. A search with n packages of v versions each can have v^n combinations to try (arithmetic), and a failure found late throws away the work done since the choice that caused it. Memory is one state per pin, each a copy: O(n) states of O(n) size each in the **worst case**, about n^2 entries (arithmetic on the snapshot rule).

## What the Problems build

The Problem `resolve` is written for this Topic, not copied from pip. Versions are whole numbers and a requirement is a range of them. The resolver decides the packages in alphabetical order, tries each package's versions from the highest down, pins one, adds its requirements, and undoes the pin if what follows fails. It undoes by removing the requirements that pin added, not by copying a state. The output is the first complete answer, or `conflict`.
