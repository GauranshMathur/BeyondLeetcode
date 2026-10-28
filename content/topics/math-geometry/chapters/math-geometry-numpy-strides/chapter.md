# NumPy: one block, many views

A matrix is a grid, but memory is a line. Something has to decide which item of the line is row 2, column 1, and what to do when the program asks for the matrix turned on its side. NumPy, the array library for Python, made a decision that keeps most turns from touching the data at all. This Chapter reads it in NumPy 2.1.0. In the Problems you build a matrix the same way, then spiral through it, and two Extra Problems change the block itself.

## One block and a formula

NumPy's reference page for its array type starts from the mismatch: "A segment of memory is inherently 1-dimensional, and there are many different schemes for arranging the items of an N-dimensional array in a 1-dimensional block." ([doc/source/reference/arrays.ndarray.rst, lines 109 to 111](https://github.com/numpy/numpy/blob/2f7fe64b8b6d7591dd208942f1cc74473d5db4cb/doc/source/reference/arrays.ndarray.rst#L109-L111)) The quote is as the page renders it: in the file `N` is wrapped in the markup for emphasis.

The scheme is a list of numbers called **strides**, one for each axis. The docstring of `ndarray.strides` defines them as a "Tuple of bytes to step in each dimension when traversing an array." ([numpy/_core/_add_newdocs.py, line 2877](https://github.com/numpy/numpy/blob/2f7fe64b8b6d7591dd208942f1cc74473d5db4cb/numpy/_core/_add_newdocs.py#L2877)) The position of an item is found by adding up its index times the stride on each axis: the docstring writes it as `offset = sum(np.array(i) * a.strides)`. ([lines 2879 to 2882](https://github.com/numpy/numpy/blob/2f7fe64b8b6d7591dd208942f1cc74473d5db4cb/numpy/_core/_add_newdocs.py#L2879-L2882)) NumPy counts the offset in bytes. The Build counts it in items, which changes nothing about the idea.

A matrix with 2 rows and 3 columns, stored row by row, has the strides (3, 1): to go down a row you skip 3 items, and to go right you skip 1. Item (row 1, column 2) is at 1 × 3 + 2 × 1 = 5, the sixth item of the block.

## Turning it on its side moves nothing

The strides are separate from the block, so a different view of the same block is a different pair of numbers. Swap the two strides and the two sizes, and what was row `j`, column `i` is now row `i`, column `j`. That is a transpose, and no item moved. This is the Chapter's reading of the formula above. For the 2 by 3 matrix above, the transposed view is 3 rows by 2 columns with the strides (1, 3), and item (row 2, column 1) is at 2 × 1 + 1 × 3 = 5 again: the sixth item of the same block.

NumPy's documentation of `transpose` states the outcome: "A view is returned whenever possible." ([numpy/_core/fromnumeric.py, line 664](https://github.com/numpy/numpy/blob/2f7fe64b8b6d7591dd208942f1cc74473d5db4cb/numpy/_core/fromnumeric.py#L664)) A transpose does a fixed amount of work, however large the matrix is, so it is O(1) in the worst case. Problem 5 asks for exactly this.

## Reversing a row moves nothing either

`flip` reverses the items along an axis. Its code builds a slice with a step of -1 and returns the slice: `indexer[ax] = np.s_[::-1]`, then `return m[indexer]`. ([numpy/lib/_function_base_impl.py, lines 341 to 343](https://github.com/numpy/numpy/blob/2f7fe64b8b6d7591dd208942f1cc74473d5db4cb/numpy/lib/_function_base_impl.py#L341-L343)) The docstring states the cost: "Since a view is returned, this operation is done in constant time." ([lines 277 to 278](https://github.com/numpy/numpy/blob/2f7fe64b8b6d7591dd208942f1cc74473d5db4cb/numpy/lib/_function_base_impl.py#L277-L278))

In terms of strides, a step of -1 along the columns means: start at the last column and walk backwards. That is two changes, and both are arithmetic on numbers you already hold (the Chapter's arithmetic, again): the start moves forward by (columns - 1) × the column stride, and the column stride changes sign. The block is untouched.

## A quarter turn is two views

`rot90` rotates an array by a quarter turn. Its docstring starts "Rotate an array by 90 degrees in the plane specified by axes." ([line 156 of the same file](https://github.com/numpy/numpy/blob/2f7fe64b8b6d7591dd208942f1cc74473d5db4cb/numpy/lib/_function_base_impl.py#L156)) and its direction is stated plainly: "the rotation will be counterclockwise." ([lines 159 to 160](https://github.com/numpy/numpy/blob/2f7fe64b8b6d7591dd208942f1cc74473d5db4cb/numpy/lib/_function_base_impl.py#L159-L160)) The code for one and three quarter turns is:

```python
if k == 1:
    return transpose(flip(m, axes[1]), axes_list)
else:
    # k == 3
    return flip(transpose(m, axes_list), axes[1])
```

([lines 239 to 243](https://github.com/numpy/numpy/blob/2f7fe64b8b6d7591dd208942f1cc74473d5db4cb/numpy/lib/_function_base_impl.py#L239-L243))

Three counterclockwise quarter turns make one clockwise one, so the second branch is the clockwise turn: transpose, then flip each row. Try it on the matrix with rows `1 2` and `3 4`. The transpose has rows `1 3` and `2 4`. Reversing each row gives `3 1` and `4 2`, which is the original turned a quarter clockwise. Two cheap views, and no item moved. Problem 5 builds `transpose`, `mirror` and `rotate` this way.

## The price of not moving

A view is free to make and can cost something to use. In a transposed view, two items that are next to each other in a row are a whole row of the original apart in the block. NumPy's page names the consequence: "When an irregularly strided array is passed in to such algorithms, a copy is automatically made." ([arrays.ndarray.rst, lines 182 to 184](https://github.com/numpy/numpy/blob/2f7fe64b8b6d7591dd208942f1cc74473d5db4cb/doc/source/reference/arrays.ndarray.rst#L182-L184)) Some code needs the items laid out in order, and then the cost of the quarter turn is paid after all, in time proportional to the number of items.

## What the Build does

Problem 5 stores a matrix as one block with an offset, a shape and two strides, and turns it with `transpose`, `mirror` and `rotate` without moving an item; the `block` command shows that the block never changed. Problem 6 reads the matrix in spiral order, walking the view, so it works on a matrix that has been turned. Reading all R × C items once is O(R × C).

The two Extra Problems pay for writing. `spin` turns a square matrix by moving its items inside the block with no second block: O(n²) time and O(1) extra space for n rows. `zero` sets whole rows and columns to zero, using the first row and column as its notes instead of a second grid: O(R × C) time and O(1) extra space.
