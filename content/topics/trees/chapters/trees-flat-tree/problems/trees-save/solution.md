Writing is a depth-first walk that writes a begin mark on the way into a node and an end mark on the way out, as the device tree does, with a `.` for each missing child so that left and right can be told apart.

Reading is the same walk on the text. A function reads one subtree at a position and returns it with the position after it: a `.` is nothing, and otherwise it reads the value, the left subtree, the right subtree and the `)`. The text has O(n) characters for n nodes, and both directions visit each node once, so each takes O(n) time in the **worst case**. The recursion goes as deep as the tree is tall, O(h).

`restore` runs the new tree through the same acceptance as `tree`, which checks the limit with `height`: text that arrives from outside is held to the same limit as a tree that is loaded. A refused `restore` leaves the current tree untouched.
