# LevelDB: merging sorted runs

LevelDB is a key-value store written at Google. It keeps its data in sorted files, and it keeps them tidy with a background job called a **compaction**. This Chapter reads how a compaction walks several sorted files at once, in LevelDB 1.23. Here the two pointers do not start at opposite ends. Each one sits in a different sequence and only ever moves forward.

## Sorted files, rewritten by merging

LevelDB's implementation notes say a sorted table "stores a sequence of entries sorted by key", and that each entry "is either a value for the key, or a deletion marker for the key". ([doc/impl.md, "Sorted tables", lines 24 to 26](https://github.com/google/leveldb/blob/1.23/doc/impl.md?plain=1#L24-L26)) When a level gets too big, "A compaction merges the contents of the picked files to produce a sequence of level-(L+1) files." ([doc/impl.md, "Compactions", line 88](https://github.com/google/leveldb/blob/1.23/doc/impl.md?plain=1#L88)) The notes give the reason for doing it with merges: they "have the effect of gradually migrating new updates from the young level to the largest level using only bulk reads and writes (i.e., minimizing expensive seeks)." ([lines 40 to 42](https://github.com/google/leveldb/blob/1.23/doc/impl.md?plain=1#L40-L42)) A pass through a sorted file from its first entry to its last is the kind of read the notes mean by "bulk": no jumping around.

## One pointer per input

To read the input files in key order, a compaction builds a list of iterators, one per input (one per level-0 file, or one per level), and hands them to `NewMergingIterator`. ([db/version_set.cc, `MakeInputIterator`, lines 1220 to 1250](https://github.com/google/leveldb/blob/1.23/db/version_set.cc#L1220-L1250)) Each iterator is a position in one sorted run, a pointer that only moves forward. The merging iterator keeps all of them and always serves the smallest:

```cpp
void MergingIterator::FindSmallest() {
  IteratorWrapper* smallest = nullptr;
  for (int i = 0; i < n_; i++) {
    IteratorWrapper* child = &children_[i];
    if (child->Valid()) {
      if (smallest == nullptr) {
        smallest = child;
      } else if (comparator_->Compare(child->key(), smallest->key()) < 0) {
        smallest = child;
      }
    }
  }
  current_ = smallest;
}
```

([table/merger.cc, lines 148 to 161](https://github.com/google/leveldb/blob/1.23/table/merger.cc#L148-L161)) To move on, `Next` advances only the current child and looks for the smallest again: `current_->Next(); FindSmallest();`. ([lines 77 and 78](https://github.com/google/leveldb/blob/1.23/table/merger.cc#L77-L78))

With two inputs this is the merge step you know: compare the two items the pointers hold, output the smaller, move that pointer. With k inputs, `FindSmallest` scans all k children each time, so one output item costs k comparisons, and merging n items in all costs about n × k comparisons in the **worst case**. For two runs of lengths m and n that is O(m + n): every item is output once, and no pointer ever moves back.

## The merge does not remove duplicates

The header of the merging iterator says so: "The result does no duplicate suppression. I.e., if a particular key is present in K child iterators, it will be yielded K times." ([table/merger.h, lines 13 to 18](https://github.com/google/leveldb/blob/1.23/table/merger.h#L13-L18)) The merge only orders. Dropping old values is a separate decision, made by the loop that reads the merged stream.

For that to work, the order must put the newest entry for a key first. The internal key comparator sorts by "increasing user key" and then "decreasing sequence number", so among entries for one key the one with the highest sequence number comes first. The compaction loop in the next section treats the first one it sees as the newer entry. ([db/dbformat.cc, `InternalKeyComparator::Compare`, lines 47 to 63](https://github.com/google/leveldb/blob/1.23/db/dbformat.cc#L47-L63))

## The compaction loop drops what is hidden

`DoCompactionWork` walks the merged stream (`input->Next()` at the end of each pass, [line 1013](https://github.com/google/leveldb/blob/1.23/db/db_impl.cc#L1013)) and remembers the previous user key and its sequence number. When the key is the same as the one before, the entry is older than one already seen:

```cpp
if (last_sequence_for_key <= compact->smallest_snapshot) {
  // Hidden by an newer entry for same user key
  drop = true;  // (A)
}
```

([db/db_impl.cc, lines 961 to 963](https://github.com/google/leveldb/blob/1.23/db/db_impl.cc#L961-L963)) The notes say the same in one line: "Compactions drop overwritten values." ([doc/impl.md, line 104](https://github.com/google/leveldb/blob/1.23/doc/impl.md?plain=1#L104))

The condition also mentions `smallest_snapshot`. LevelDB lets a reader hold a snapshot, and an old entry that a snapshot can still see must survive. The Build leaves snapshots, deletion markers and sequence numbers out. It keeps only the shape: two sorted runs, a newer and an older, merged into one sorted run where the newer entry wins.

## What the Problem builds

In the Problem, the sequence you load is the newer run followed by the older run. Both are sorted, and your two pointers walk them together. When both hold the same key, the newer one is kept and the older one is skipped. The sequence's length is the cost: each pointer moves forward at most once per item, so the merge is O(m + n) in the **worst case**, with O(m + n) extra space for the output.
