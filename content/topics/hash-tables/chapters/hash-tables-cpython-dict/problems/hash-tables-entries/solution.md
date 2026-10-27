The slots are now only an index. Searching still follows the same path, but to tell whether a slot holds the key you go to its row and compare there. A new key is appended to the rows, and the slot it lands in gets the new row number. A delete empties the row and turns the slot into a Dummy, so the rows after it keep their numbers.

Insertion order falls out for free. The rows are never reordered, so reading them from the start returns the keys in the order they were first added. A key that is deleted and put back is a new key and goes to the end. This is what the Python documentation promises and what the Chapter's source comment says.

`nentries` is not `len`: emptied rows stay in the list. Nothing here ever removes them. They stay until the table is rebuilt, which a later Problem does.
