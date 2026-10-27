# Java: the midpoint that overflowed

Binary search is the first algorithm most programmers write from memory, and the one they most often get wrong. This Chapter reads OpenJDK's `Arrays.binarySearch` as it stands in JDK 21 (build `jdk-21+35`), and the bug the same method had for about nine years. In the Problems you build the midpoint, then the search around it.

## The contract: a sorted array and a signed answer

The Javadoc of `binarySearch(int[] a, int key)` makes two promises. The first is a precondition: "The array must be sorted (as by the sort(int[]) method) prior to making this call. If it is not sorted, the results are undefined." ([Arrays.java, lines 1640 to 1646](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Arrays.java#L1640-L1646)) The second is what the answer looks like: the index of the key if it is found, "otherwise, (-(insertion point) - 1)". The insertion point is "the index of the first element greater than the key, or a.length if all elements in the array are less than the specified key". ([lines 1650 to 1657](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Arrays.java#L1650-L1657))

So a miss is not a single `-1`. It is a negative number that still carries the place where the key would go. Insertion point 0 becomes -1, insertion point 3 becomes -4, and the doc adds that the result "will be >= 0 if and only if the key is found". If the array holds the key more than once, the same Javadoc says "there is no guarantee which one will be found." ([lines 1644 to 1646](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Arrays.java#L1644-L1646))

## The loop

The method does its work in a private helper:

```java
int low = fromIndex;
int high = toIndex - 1;

while (low <= high) {
    int mid = (low + high) >>> 1;
    int midVal = a[mid];

    if (midVal < key)
        low = mid + 1;
    else if (midVal > key)
        high = mid - 1;
    else
        return mid; // key found
}
return -(low + 1);  // key not found.
```

([Arrays.java, lines 1702 to 1719](https://github.com/openjdk/jdk/blob/890adb6410dab4606a4f26a942aed02fb2f55387/src/java.base/share/classes/java/util/Arrays.java#L1702-L1719))

Both ends are **inclusive**: `low` and `high` are indexes that are still possible. Read that as an **invariant** (a statement that is true before and after every pass of the loop): if the key is in the array, its index is in `low..high`. This is a reading of the code, not a line the JDK states. When `midVal < key`, `mid` and everything left of it are too small, so `low = mid + 1`. When `midVal > key`, `high = mid - 1`. The loop ends when the range is empty, `low > high`, and at that moment `low` is the first index whose item is greater than the key. That is exactly the insertion point from the Javadoc, which is why `-(low + 1)` is the right thing to return.

**Cost.** The range `low..high` has `s` indexes. After `mid` is checked, at most `s / 2` (rounded down) are left on either side. So a search over `n >= 1` items makes at most `floor(log2 n) + 1` passes in the **worst case** (an empty array makes none), and uses constant extra space. With 1,000,000 items that is at most 20 passes.

## The bug

Look at the line `int mid = (low + high) >>> 1;`. It has not always been written that way. In 2006 Joshua Bloch, who wrote this method, published what he found in it: "The version of binary search that I wrote for the JDK contained the same bug. It was reported to Sun recently when it broke someone's program, after lying in wait for nine years or so." ([Extra, Extra - Read All About It: Nearly All Binary Searches and Mergesorts are Broken, Google Research blog, 2 June 2006](https://research.google/blog/extra-extra-read-all-about-it-nearly-all-binary-searches-and-mergesorts-are-broken/)) The same bug sat in the binary search that Jon Bentley proved correct in *Programming Pearls*, and it escaped detection for two decades, because arrays that large were out of reach when the book was written (same post).

The line was `int mid = (low + high) / 2;`. Bloch explains: "it fails if the sum of low and high is greater than the maximum positive int value (2^31 - 1). The sum overflows to a negative value, and the value stays negative when divided by two." In Java, a negative index "throws ArrayIndexOutOfBoundsException". He adds that it "can manifest itself for arrays whose length (in elements) is 2^30 or greater". (same post)

Work one case through. Take `low = 1,500,000,000` and `high = 2,000,000,000`. Their sum is 3,500,000,000, which is above 2,147,483,647. A 32-bit signed int can only hold values from -2,147,483,648 to 2,147,483,647, so the sum wraps around by 4,294,967,296 and becomes -794,967,296: the Java language specification says that when an integer addition overflows, "the result is the low-order bits of the mathematical sum as represented in some sufficiently large two's-complement format". ([The Java Language Specification, Java SE 21 Edition, section 15.18.2](https://docs.oracle.com/javase/specs/jls/se21/html/jls-15.html#jls-15.18.2)) Integer division "rounds toward 0" ([section 15.17.2](https://docs.oracle.com/javase/specs/jls/se21/html/jls-15.html#jls-15.17.2)), so `/ 2` on -794,967,296 gives -397,483,648: not an index at all. The correct midpoint is 1,750,000,000. Your first Problem builds both.

Bloch offers two repairs: `int mid = low + ((high - low) / 2);` and `int mid = (low + high) >>> 1;`. (same post) The JDK uses the second. `>>>` is Java's unsigned right shift. Two non-negative ints add up to at most 2 x (2^31 - 1) = 4,294,967,294, which still fits in 32 bits when those bits are read as an unsigned number, so shifting it right by one gives the exact average rounded down. (This last step is arithmetic, not a JDK claim.) The first repair never makes a sum larger than `high`, so it cannot overflow either.

Bloch's post has a second lesson. His first proposed fix for C and C++ was an unsigned cast, and in 2008 he added that it "was not guaranteed to work by the relevant C99 standard", which says that adding two signed values that overflow is undefined. (same post, update of 17 February 2008) In C, the signed sum is the problem, not the shift. The bug report is JDK-6412541, "Arrays.binarySearch does not work for arrays larger than 1<<30", which the post links; it is now closed as a duplicate. ([JDK-6412541](https://bugs.openjdk.org/browse/JDK-6412541))

## What the Build leaves out

`Arrays` has one `binarySearch` for every primitive type and one for objects with a comparator. Your Build searches integers only. It also stays in memory and ignores the `fromIndex` and `toIndex` range checks that the public methods run first.
