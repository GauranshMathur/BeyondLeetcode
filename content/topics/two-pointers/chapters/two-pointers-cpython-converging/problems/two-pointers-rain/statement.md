# Water between bars

An **Extra Problem**: it branches off after `pairsum` and does not affect completing the Topic.

Read the sequence as bar heights again (0 or more, one unit apart). After rain, water collects in the dips. The water above one bar stands as high as the lower of the two tallest bars on its sides (counting the bar itself in both), and never below the bar itself.

Add:

| Command | What it does | Prints |
|---|---|---|
| `rain` | The total amount of water held above all bars, in units. | the total |

For the bar at position `i`, the water above it is `min(tallest bar at or left of i, tallest bar at or right of i) - height[i]`.

## Example

Input:

```
load 2 0 3 1 0 4 1 2
rain
```

Output:

```
8
```

Counting positions from 1: position 2 holds 2 units, position 4 holds 2, position 5 holds 3 and position 7 holds 1. That is 8 in all; the other bars hold none.
