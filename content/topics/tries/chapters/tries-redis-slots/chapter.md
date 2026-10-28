# Redis Cluster: listing by prefix

A trie answers a question a hash table does not help with: which keys start with these characters? You can walk to the node for the prefix, and everything below it is the answer. This Chapter reads a place where Redis 7.2.5 asks it, the function `unsigned int countChannelsInSlot(unsigned int hashslot) {` ([src/cluster.c, line 7705](https://github.com/redis/redis/blob/f60370ce28b946c1146dcea77c9c399d39601aaa/src/cluster.c#L7705)). The Problems build the same prefix listing.

## The key is the slot, then the name

The cluster header defines the number of slots: `#define CLUSTER_SLOTS 16384` ([src/cluster.h, line 8](https://github.com/redis/redis/blob/f60370ce28b946c1146dcea77c9c399d39601aaa/src/cluster.h#L8)). The cluster state has a field for the index: `rax *slots_to_channels;` ([line 187](https://github.com/redis/redis/blob/f60370ce28b946c1146dcea77c9c399d39601aaa/src/cluster.h#L187)). When a channel is added, `slotToChannelUpdate` first works out its slot, `unsigned int hashslot = keyHashSlot(channel,keylen);` ([src/cluster.c, line 7680](https://github.com/redis/redis/blob/f60370ce28b946c1146dcea77c9c399d39601aaa/src/cluster.c#L7680)), and then builds the key it stores:

```c
    indexed[0] = (hashslot >> 8) & 0xff;
    indexed[1] = hashslot & 0xff;
    memcpy(indexed+2,channel,keylen);
```

([lines 7685 to 7687](https://github.com/redis/redis/blob/f60370ce28b946c1146dcea77c9c399d39601aaa/src/cluster.c#L7685-L7687)) and inserts it with `raxInsert(server.cluster->slots_to_channels,indexed,keylen+2,NULL,NULL);` ([line 7689](https://github.com/redis/redis/blob/f60370ce28b946c1146dcea77c9c399d39601aaa/src/cluster.c#L7689)). The key is two bytes that hold the slot number, followed by the channel's name. 16,384 is less than 65,536, so two bytes are enough (arithmetic). The insert passes `NULL` for the value: the tree is used as a set of keys.

That is the decision: the slot is not a field in a table that has to be searched. It is the front of the key. All the channels of one slot start with the same two bytes, so in a trie they share the path for those two bytes and hang below it (the shape of any trie, not a claim about rax's nodes).

## Seek, then step until the prefix ends

`countChannelsInSlot` asks for the channels of one slot:

```c
    indexed[0] = (hashslot >> 8) & 0xff;
    indexed[1] = hashslot & 0xff;
    raxStart(&iter,server.cluster->slots_to_channels);
    raxSeek(&iter,">=",indexed,2);
    while(raxNext(&iter)) {
        if (iter.key[0] != indexed[0] || iter.key[1] != indexed[1]) break;
        j++;
    }
```

([src/cluster.c, lines 7710 to 7717](https://github.com/redis/redis/blob/f60370ce28b946c1146dcea77c9c399d39601aaa/src/cluster.c#L7710-L7717)) It builds the two-byte prefix, seeks to the first key that is greater than or equal to it, and steps forward with `raxNext`. The loop stops at the first key whose first two bytes differ, and counts the ones before it. `removeChannelsInSlot` does the same walk twice: it calls `countChannelsInSlot` first ([lines 6494 to 6498](https://github.com/redis/redis/blob/f60370ce28b946c1146dcea77c9c399d39601aaa/src/cluster.c#L6494-L6498)) so that it can size an array, and then collects the names with the same loop ([lines 6505 to 6510](https://github.com/redis/redis/blob/f60370ce28b946c1146dcea77c9c399d39601aaa/src/cluster.c#L6505-L6510)).

Why can the loop stop at the first mismatch? Because of the order of the keys. The rax README says: "The Rax key space is ordered lexicographically, using the value of the bytes the keys are composed of in order to decide which key is greater between two keys. If the prefix is the same, the longer key is considered to be greater." ([README.md, lines 161 to 164](https://github.com/antirez/rax/blob/1927550cb218ec3c3dda8b39d82d1d019bf0476d/README.md#L161-L164)) The README is the standalone rax project's, pinned to a commit. In that order the keys that begin with the same two bytes sit next to each other, so once a key has left the prefix no later key can come back to it. A key that equals the prefix comes before the keys that extend it, which is why the Build's `list` prints `ab` before `abc`.

The README describes the seek by example: "seek the first element greater or equal to the key" ([lines 185 to 186](https://github.com/antirez/rax/blob/1927550cb218ec3c3dda8b39d82d1d019bf0476d/README.md#L185-L186)), as the quoted text renders without the code markup around the key.

`raxSeek` has a rule for the empty key too: "Seeking the first key greater or equal to the empty string is equivalent to seeking the smaller key available." ([src/rax.c, lines 1546 to 1548](https://github.com/redis/redis/blob/f60370ce28b946c1146dcea77c9c399d39601aaa/src/rax.c#L1546-L1548)) So the empty prefix lists every key, and the Build's `list` and `count` with no argument do too.

## What it costs in the Build

Your Build keeps its children in a hash map, so it cannot step forward in order by itself. `list` walks to the prefix node, which takes one step per character of the prefix, and then visits every node below it. A node's children are put in order before they are visited, which is a sort of the characters it has. In the **worst case** the prefix is empty and the visit covers the whole tree. rax keeps the characters of a node in order. When it adds a child it looks for "where to insert the new child in order to make sure it is inserted in-place lexicographically." ([src/rax.c, lines 301 to 302](https://github.com/redis/redis/blob/f60370ce28b946c1146dcea77c9c399d39601aaa/src/rax.c#L301-L302)) A hash-map node has to be sorted each time it is visited, which is the price of the Build's simpler node.

Compare a hash table keyed by the full channel name. A hash spreads names that start alike to unrelated places, so listing a prefix would need a look at every key (the Hash tables Topic explains how a table places keys).

## What the Build leaves out

The Build has one operator: everything that starts with a given prefix. The source lists more operators for the seek: `>`, `>=`, `<`, `<=`, `=`, `^` and `$`. ([src/rax.c, lines 1521 to 1531](https://github.com/redis/redis/blob/f60370ce28b946c1146dcea77c9c399d39601aaa/src/rax.c#L1521-L1531)) It has no backward step either. The Extra Problem keeps the prefix walk and asks for the best few keys by a number each, which needs the keys under the prefix and then a choice among them.
