# Resolve versions

pip installs a package by picking a version of it and of everything it needs, newest first, and going back when two choices clash ([lines 42 to 43](https://github.com/pypa/pip/blob/97146c7f4cd85551f3dc261830a57f304e43c181/docs/html/topics/dependency-resolution.md#L42-L43), [lines 44 to 47](https://github.com/pypa/pip/blob/97146c7f4cd85551f3dc261830a57f304e43c181/docs/html/topics/dependency-resolution.md#L44-L47)). This Problem builds a small resolver that does that. The reading is [pip: pick the newest, go back when it conflicts](/chapters/backtracking-pip). The rules below are written for this Problem; the Chapter says how pip differs.

Packages have lowercase names. A version is a positive whole number up to 1,000,000. A **range** is two numbers, `LO` and `HI`, and a version is **in** it when `LO <= version <= HI`.

Add:

| Command | What it does | Prints |
|---|---|---|
| `pkg NAME V1 V2 ...` | Declares the package `NAME` with the versions `V1`, `V2`, and so on, which are different and in any order. Declaring the same name again replaces its versions. A package that is never declared has no versions. | nothing |
| `dep NAME V OTHER LO HI` | Says that version `V` of `NAME` requires `OTHER` at a version in the range `LO` to `HI`. A version may have several of these lines, for different packages or the same one. `OTHER` is not `NAME`. | nothing |
| `need NAME LO HI` | Says that the root requires `NAME` at a version in the range `LO` to `HI`. There may be several for one package. | nothing |
| `resolve` | Looks for one version for every package that is needed, so that every requirement holds. | `ok` followed by `name=version` for each package that got a version, in alphabetical order of name, each after a single space; or `conflict` when there is no answer |

A package is **needed** when a `need` line names it or when a version already chosen requires it. Only needed packages get a version. `resolve` changes nothing, so it can be asked again after more lines.

The answer is the first one this search finds:

1. Take the needed packages that have no version yet. If there are none, the search has succeeded. Otherwise take the first of them in alphabetical order of name.
2. Try its versions from the highest to the lowest. A version is **allowed** when it is in every range that has been required of the package so far, and, for each requirement the version itself has on a package that already has a version, that version is in the range.
3. Give the package the first allowed version, add that version's requirements, and go back to step 1. If the search from there fails, take the version and its requirements back and try the next allowed version.
4. When no version is left, this step fails, and the step before it takes its own next version.

## Example

Input:

```
pkg tea 2 1
pkg cup 3 2 1
pkg spoon 2 1
dep tea 2 cup 2 3
dep tea 2 spoon 2 2
dep spoon 2 cup 1 2
need tea 1 2
resolve
```

Output:

```
ok cup=2 spoon=2 tea=2
```

`tea` goes first and takes 2, which requires `cup` in 2 to 3 and `spoon` in 2 to 2. `cup` is next alphabetically and takes 3. Then `spoon` takes 2, but that version requires `cup` in 1 to 2, and `cup` already has 3, so `spoon` has no allowed version. The search takes `cup` 3 back and tries `cup` 2, and then `spoon` 2 is allowed.
