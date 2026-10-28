# The numbers no range holds

The Chapter reads how Go's regexp parser turns a clean class into the characters it leaves out. This Extra Problem branches off `merged` and asks for the same on a window of whole numbers. Nothing here flows into the Core Problems after it.

Add:

| Command | What it does | Prints |
|---|---|---|
| `gaps lo hi` | Looks at the whole numbers from `lo` to `hi`, both included, and finds the ones that no added interval holds. It changes nothing. | the longest runs of such numbers, smallest first, each as `a-b`, separated by single spaces; `none` if every number in the window is held |

`0 <= lo <= hi <= 1000000000`. A run is as long as it can be: the numbers 6, 7 and 8 are printed as `6-8`, never as `6-6 7-8`. A run is cut at the window: intervals may reach outside it.

## Example

Input:

```
add 3 5
add 9 10
gaps 0 12
```

Output:

```
0-2 6-8 11-12
```

The intervals hold 3 to 5 and 9 to 10. Inside the window 0 to 12, the numbers 0 to 2, 6 to 8 and 11 to 12 are held by none.
