# HotpotQA subsample

`questions.jsonl` holds 40 questions (20 bridge, 20 comparison) from the HotpotQA distractor setting, dev split,
each with its 10 context paragraphs (2 gold, 8 distractors) and its supporting facts.

## Source and licence

- Dataset: HotpotQA, Yang et al., "HotpotQA: A Dataset for Diverse, Explainable Multi-hop Question Answering",
  EMNLP 2018, [arXiv:1809.09600](https://arxiv.org/abs/1809.09600). Project page: https://hotpotqa.github.io/
- File: `distractor/validation-00000-of-00001.parquet` from the Hugging Face mirror
  [`hotpotqa/hotpot_qa`](https://huggingface.co/datasets/hotpotqa/hotpot_qa), revision
  `1908d6afbbead072334abe2965f91bd2709910ab`. Its sha256 is recorded in `manifest.json`.
- Licence: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), full text in `LICENSE`. This
  folder is a derivative of HotpotQA and is shared under the same licence. The code in this repository is MIT
  licensed separately.

## Changes from the source

- Only 40 of the 7,405 dev questions are kept.
- Fields are renamed to camelCase and reshaped from columnar lists into records: `supporting_facts` becomes
  `supportingFacts: [{ sourceId, sentenceIndex }]`, `context` becomes `paragraphs: [{ sourceId, sentences }]`.
  `sourceId` is the Wikipedia article title. Sentence text is unchanged.

## Sampling method

`scripts/sample-hotpotqa.ts` is deterministic and seeded (`manifest.json` records the seed):

1. Rank every dev row by `sha256(seed + ":" + id)`.
2. Walk the ranking and keep a row while its type still has room (20 per type), skipping any row whose gold
   titles were already used by a kept row. No gold paragraph is shared between questions.

Regenerate with:

```sh
curl -L -o hotpot_qa-distractor-validation.parquet \
  https://huggingface.co/datasets/hotpotqa/hotpot_qa/resolve/1908d6afbbead072334abe2965f91bd2709910ab/distractor/validation-00000-of-00001.parquet
pnpm data:sample --source hotpot_qa-distractor-validation.parquet
```

The output sha256 in `manifest.json` must stay the same.
