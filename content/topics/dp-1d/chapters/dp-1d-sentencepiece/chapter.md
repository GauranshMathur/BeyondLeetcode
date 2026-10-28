# SentencePiece: one lattice, the best path or the sum over paths

A tokeniser cuts text into pieces from a vocabulary, and the same text can usually be cut in many ways. "Which cut do we use?" is an optimising question: out of all the ways, pick the best. "How many cuts are there, or how likely is each?" is a counting question: add up all the ways. They look like different problems, and the recurrence behind them is the same one. Only the operation at each step changes, from taking the best to adding. This Chapter reads SentencePiece (the `google/sentencepiece` repository), v0.2.0, in `src/unigram_model.cc`, where one structure answers both.

## A lattice of pieces

The header describes the structure in one line: "Lattice represents a search space of sentence piece segmentation." ([src/unigram_model.h, line 32](https://github.com/google/sentencepiece/blob/17d7580d6407802f85855d2cc9190634e2c95624/src/unigram_model.h#L32)) A node is one candidate piece. It records where it starts (`pos`), how long it is (`length`), and its `score`, "logprob of this sentencepiece" ([lines 40 to 44](https://github.com/google/sentencepiece/blob/17d7580d6407802f85855d2cc9190634e2c95624/src/unigram_model.h#L40-L44); the comment marker dropped). Inserting a node files it twice, under where it begins and under where it ends: `begin_nodes_[pos].push_back(node); end_nodes_[pos + node->length].push_back(node);` ([src/unigram_model.cc, lines 155 to 156](https://github.com/google/sentencepiece/blob/17d7580d6407802f85855d2cc9190634e2c95624/src/unigram_model.cc#L155-L156)). A way to cut the text is a path through the nodes, each starting where the one before it ended. There are many paths, and the lattice never lists them: it keeps, for each place, the nodes that end there and the nodes that begin there.

## Optimising: the best path

`Lattice::Viterbi` finds the best path, and it is a loop over places:

```cpp
for (int pos = 0; pos <= len; ++pos) {
  for (Node *rnode : begin_nodes_[pos]) {
    rnode->prev = nullptr;
    float best_score = 0.0;
    Node *best_node = nullptr;
    for (Node *lnode : end_nodes_[pos]) {
      const float score = lnode->backtrace_score + rnode->score;
      if (best_node == nullptr || score > best_score) {
        best_node = lnode;
        best_score = score;
      }
    }
    if (best_node == nullptr) {
      LOG(ERROR) << "Failed to find the best path in Viterbi.";
      return {};
    }
    rnode->prev = best_node;
    rnode->backtrace_score = best_score;
  }
}
```

([src/unigram_model.cc, lines 164 to 183](https://github.com/google/sentencepiece/blob/17d7580d6407802f85855d2cc9190634e2c95624/src/unigram_model.cc#L164-L183)) For each piece that begins at `pos`, look at every piece that ends at `pos`, and take the one whose best total so far (`backtrace_score`) plus this piece's score is largest. Store that total on the piece, and remember which piece it came from (`prev`). This is the recurrence over a line: the best total up to a place depends only on the best totals at the places before it. `Model::Encode` has a fast path, `EncodeOptimized`, for one encoder version ([lines 675 to 677](https://github.com/google/sentencepiece/blob/17d7580d6407802f85855d2cc9190634e2c95624/src/unigram_model.cc#L675-L677)). Otherwise it builds a lattice and takes the Viterbi path: `for (const auto *node : lattice.Viterbi().first)` ([lines 683 to 688](https://github.com/google/sentencepiece/blob/17d7580d6407802f85855d2cc9190634e2c95624/src/unigram_model.cc#L683-L688)).

## Counting: the same loops, a sum

`Lattice::ForwardAlgorithm` has the same two loops over the same lists, and a different line in the middle:

```cpp
for (int pos = 0; pos <= len; ++pos) {
  for (Node *rnode : begin_nodes_[pos]) {
    for (Node *lnode : end_nodes_[pos]) {
      alpha[rnode->node_id] =
          LogSumExp(alpha[rnode->node_id],
                    inv_theta * lnode->score + alpha[lnode->node_id],
                    lnode == end_nodes_[pos][0]);
    }
  }
}
```

([lines 204 to 213](https://github.com/google/sentencepiece/blob/17d7580d6407802f85855d2cc9190634e2c95624/src/unigram_model.cc#L204-L213)) Where Viterbi keeps the larger of two totals, this combines them with `LogSumExp`, which "Returns log(exp(x) + exp(y))." ([line 42](https://github.com/google/sentencepiece/blob/17d7580d6407802f85855d2cc9190634e2c95624/src/unigram_model.cc#L42)) The scores are logarithms of probabilities, so adding the exponentials is adding probabilities. Reading the loop with `inv_theta` as 1, `alpha` for a piece is the logarithm of the total probability of every path that reaches it. The library uses it to draw a path at random. `Sample` is documented as sampling "one path from the lattice according to the generation probability (Product of piece probabilities)" ([unigram_model.h, lines 99 to 100](https://github.com/google/sentencepiece/blob/17d7580d6407802f85855d2cc9190634e2c95624/src/unigram_model.h#L99-L100)), and `SampleEncode` calls `lattice.Sample(inv_theta)` ([unigram_model.cc, line 734](https://github.com/google/sentencepiece/blob/17d7580d6407802f85855d2cc9190634e2c95624/src/unigram_model.cc#L734)). If every piece's weight were 1 and the combining step were an ordinary sum, the same loops would count the paths (the Chapter's reading of the code; SentencePiece's `alpha` is probability, not a count).

## Two different answers from one shape

The decision is to write the recurrence once and choose its operation by the question. Taking the best (`max` or `min`) answers "what is the best way". Adding answers "how many ways" or "how much weight". Three things differ when you write them as Problems:

- **Counts grow fast.** The number of cuts of a text can be exponential in its length, so a counting answer is asked **modulo** a number. A sum survives a modulo; a minimum does not (arithmetic), which is why the best answers are plain small numbers and the counting answers are not.
- **Edge cases differ.** A best answer may not exist, and the Problems print `-1` for that. A count has an honest answer when none exists: 0.
- **Neither answer gives the other.** Knowing the best cut says nothing about how many there are, and the count does not say which is best. `vocab` asks for both at once from the same table.

## What the Problems build

The sequence is a row of items and the table has one entry per place, as in the first Chapter. `fewest` is Climbing Stairs turned from counting into optimising: the sequence holds coin values, and the answer is the fewest coins that sum to an amount. It is the loop of `ways` with a `min` in place of the sum. `decode` counts the ways to cut a row of digits into tokens, each a number from 1 to 26. The Extra Problem `vocab` takes a list of allowed pieces and prints both the number of cuts and the fewest pieces in one.
