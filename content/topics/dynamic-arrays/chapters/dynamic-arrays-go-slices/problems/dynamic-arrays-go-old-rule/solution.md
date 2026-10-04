Same shape as `go`, with a different threshold and a different step.

Print the capacity after every growth under both rules and look at the factors. `go117` goes 256, 512, 1024, 1280, 1600: the factor is 2, 2, then 1.25 straight away. `go` goes 256, 512, 832, 1232, 1732: the factor is 2, 1.625, 1.48, 1.41. That drop from 2 to 1.25 in one step is the "sudden transition" the Go 1.18 release notes mention.

The total cost is close: after `fill 200000 1`, `go117` has copied 863,865 items and `go` 844,665. The commit message says the threshold of 256 was picked for that, to "roughly match the total number of reallocations". Both rules are O(1) amortised per append.
