# From the node back to its object

The list functions only see `list_head`s. Linux gets from a node back to the object that contains it with `container_of`: subtract the offset of the member from the node's address. This Problem builds that and a list walk that uses it.

Here an object is a block of cells. Its first cell holds a number, the object's value, and its `list_head` members come after it. The *offset* of a member is how many cells after the start of the block it begins. An object can have several members and be on several lists at once, one per member.

Add:

| Command | What it does | Prints |
|---|---|---|
| `set A V` | writes the number `V` into cell `A` | nothing |
| `entry P O` | `container_of`: the address of the object that has a member at `P` with offset `O` | the address `P - O` |
| `values H O` | like `list_for_each_entry`: walks the list `H`, and for each node reads the value of the object that contains it, given that the list uses the member at offset `O` | the values in list order, separated by single spaces, or `-` if the list is empty |

## Example

Two objects, each five cells: a value, then a member `a` at offset 1 (cells 1 and 2), then a member `b` at offset 3 (cells 3 and 4). The first starts at 100 and the second at 105. List 10 uses member `a`, list 20 uses member `b`.

Input:

```
init 10
init 20
set 100 7
set 105 8
add_tail 101 10
add_tail 106 10
add_tail 108 20
add_tail 103 20
values 10 1
values 20 3
entry 106 1
```

Output:

```
7 8
8 7
105
```

List 10 holds the `a` members at 101 and 106, so its objects start at 100 and 105 and the values are 7 and 8. List 20 holds the `b` members at 108 and 103, which are the same two objects in the other order: 8 and 7. `entry 106 1` is 106 - 1 = 105.
