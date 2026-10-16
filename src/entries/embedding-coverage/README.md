---
id: embedding-coverage
title: Embedding coverage
family: rag-ingest
scope: ingestion
status: stable
requires:
    - rag_ingestion.output (ingestion report with chunk, vector and token counts)
    - rag_action.output.chunkCount
thresholds:
    - name: MAX_MISSING_CHUNKS
      value: 0
      basis: every chunk a pipeline produces is meant to be searchable; a deliberate skip should not be a chunk
      calibratedOn: invariant
    - name: MAX_OVER_LIMIT_CHUNKS
      value: 0
      basis: tokens past the embedder window are dropped without a warning, so any over-limit chunk loses text
      calibratedOn: invariant
    - name: MAX_DEGENERATE_VECTORS
      value: 0
      basis: a zero, non-finite or duplicated vector cannot rank its chunk against a query
      calibratedOn: invariant
references:
    - title: 'Chat history and embedding truncation happens silently with no user-visible indication (Ollama #14259)'
      url: https://github.com/ollama/ollama/issues/14259
      date: 2026-02-14
    - title: '@mastra/fastembed source: FlagEmbedding.init without maxLength, so the 512-token default applies'
      url: https://github.com/mastra-ai/mastra/blob/main/packages/fastembed/src/index.ts
      date: 2026-10-14
    - title: 'BAAI/bge-small-en-v1.5 model card: 384 dimensions, 512-token maximum sequence'
      url: https://huggingface.co/BAAI/bge-small-en-v1.5
      date: 2026-10-14
    - title: 'Sentence-Transformers: longer texts are truncated to the first max_seq_length tokens'
      url: https://sbert.net/examples/sentence_transformer/applications/computing-embeddings/README.html
      date: 2026-10-14
---

# Embedding coverage

## Symptom

Part of the corpus is not searchable. Questions whose answer sits in a chunk's tail, or in a chunk that never got a
vector, fail while everything else works, so overall quality looks only slightly worse.

<!-- docs-tables:default-stack:start -->

With Mastra's defaults this happens out of the box: `@mastra/rag` 2.6.7 chunks to 4,000 characters (recursive, 200 overlap) and `@mastra/fastembed` 1.3.3 embeds the first 512 tokens of each input, about 2,500 characters of English prose. On this repository's question-level documents (median 6,083 characters), 58 of 77 default chunks overflow and 27.8% of all chunk tokens are never embedded. Per-paragraph documents (median 491 characters) give 0 of 386. On this repository's corpus no document of 2,366 characters or fewer overflowed, and every document of 3,326 or more did. Source: `pnpm repros fastembed-truncation-hotpotqa fastembed-truncation`, scripted (offline, no model), darwin 25.6.0 arm64, Node v24.22.0, generated 2026-10-15, @mastra/core 1.77.0, @mastra/evals 1.10.7, @mastra/fastembed 1.3.3, @mastra/libsql 1.26.1, @mastra/memory 1.37.1, @mastra/observability 1.20.0, @mastra/rag 2.6.7, ai 7.0.140.

<!-- docs-tables:default-stack:end -->

## Why no error is raised

Embedders truncate silently: the tokenizer cuts every input to its window and returns a vector of the usual shape.
Each Mastra default is sound on its own (a 512-token window is `bge-small-en-v1.5`'s, and 4,000-character chunks
suit large-window embedders); together they lose chunk tails, and `@mastra/fastembed`'s `doEmbed` returns no
warning.
LibSQL accepts zero vectors and never returns those rows for any query.

Missing vectors are caught loudly by Mastra's documented stack: `embedMany` throws when a provider returns fewer
embeddings than inputs, and `LibSQLVector.upsert` with `metadata: chunks.map(...)` throws
`METADATA_LENGTH_MISMATCH` (`pnpm repros upsert-length-check`). They go silent in hand-written pipelines: an
embedding loop that skips failed batches, followed by code that pairs vectors with chunks by position and builds
metadata from the vectors side (a zip helper, or `vectors.map((_, i) => chunks[i])`).

## Trace signature

An instrumented ingestion trace: a `rag_ingestion` root span whose output is the ingestion report (chunk, embedded,
upserted and index counts; token counts measured with the embedder's own tokenizer; zero-norm, non-finite and
duplicate vector counts), plus Mastra's own `rag_action` chunk span with the chunker's count. Counts, not lists:
the span serializer caps arrays at 50 items, and a corpus has hundreds of chunks.

## Detector

Three sub-signals; the entry fires when any of them exceeds its threshold:

1. **Missing vectors**, by where they were lost (chunks counted as the larger of the report's count and the
   `rag_action` count):
    - **Embedder shortfall:** fewer vectors than chunks. Severity 1: with no record of which vector belongs to
      which chunk, a hand-written pipeline that pairs them by position indexes nearly every chunk after the first
      gap under another chunk's vector, so a retrieval returns confident rows with the wrong text.
    - **Index shortfall:** embedded vectors that never reached the index (upserted or index count lower). Severity
      is the missing share, since every stored vector still belongs to its chunk.
2. **Token overflow:** chunks over the embedder's window. Its share is `truncatedTokenShare`, tokens past the window
   over all chunk tokens: the part of the corpus text no query can reach. If the counts were measured against a
   wider limit than the window the embedder declares (`tokenCounts.limit > embedder.maxInputTokens`), the longest
   chunk is checked against the declared window too, so an inconsistent report cannot hide the overflow.
3. **Degenerate vectors:** zero-norm, non-finite, or identical to the vector of a different text (the visible
   symptom of truncation when chunks share a long prefix).

Severity is the largest share of the corpus one gap covers. An ingestion with no chunks is `not-applicable`. Any
other trace shape (an agent run) is not scorable.

The scorer reads the report your ingestion records as the output of a `rag_ingestion` span (Mastra's
`startRagIngestion` or `withRagIngestion`). Build the report with `buildIngestionReport` from
`agent-silent-failures/ingestion` and return it from `withRagIngestion`, so it becomes the `rag_ingestion` span's
output. It needs your chunk texts, the vectors in chunk order, the index counts after the upsert, the embedder's
declared window, and a `countTokens` function that counts with the embedder's own tokenizer, without its
truncation. For `@mastra/fastembed` that tokenizer is the model's `tokenizer.json`, read with
`@anush008/tokenizers` (install it next to the package):

```ts
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { Tokenizer } from '@anush008/tokenizers';
import type { CountTokens } from 'agent-silent-failures/ingestion';
import { tokenCountSchema } from 'agent-silent-failures/trace/model';
import { z } from 'zod';

// Where @mastra/fastembed 1.3.3 keeps bge-small-en-v1.5; it reads this file with @anush008/tokenizers 0.6.0.
const modelDirectory = join(homedir(), '.cache', 'mastra', 'fastembed-models', 'fast-bge-small-en-v1.5');
const tokenizer = Tokenizer.fromFile(join(modelDirectory, 'tokenizer.json'));

/** Counts like the embedder ([CLS] and [SEP] included) but without its truncation, so overflow stays visible. */
export const countTokens: CountTokens = async (text) => (await tokenizer.encode(text)).getLength();

/** fastembed reads min(512, model_max_length) tokens per input. */
const tokenizerConfig = z
    .object({ model_max_length: z.int() })
    .parse(JSON.parse(await readFile(join(modelDirectory, 'tokenizer_config.json'), 'utf8')));
export const embedderWindow = tokenCountSchema.parse(Math.min(512, tokenizerConfig.model_max_length));
```

Then register the scorer and score the ingestion trace from Studio or with `scoreTraces`:

```ts
import { Mastra } from '@mastra/core/mastra';
import { embeddingCoverageScorer } from 'agent-silent-failures';

export const mastra = new Mastra({ scorers: { embeddingCoverage: embeddingCoverageScorer } });
```

## Thresholds and why

All three are invariants of a correct pipeline, so their thresholds are 0 and need no calibration. Raising one
tolerates a known, declared loss (for example chunks skipped on purpose). On the offline stack every clean and
hard-negative configuration measures exactly 0 on all three; every faulted configuration measures above 0.

## Reproduction

| Fault                | Severity                       | Mechanism                                                        | Documents             |
| -------------------- | ------------------------------ | ---------------------------------------------------------------- | --------------------- |
| `default-chunk-size` | `mastra-defaults`              | Mastra's default 4,000/200 chunking into the 512-token embedder  | question-level (long) |
| `embed-batch-cap`    | `keeps-7-of-8`, `keeps-4-of-8` | a hand-written embedding loop keeps fewer vectors per batch of 8 | per paragraph         |
| `zero-vectors`       | `every-tenth`, `every-second`  | some document vectors are zeros                                  | per paragraph         |

`embed-batch-cap` reproduces user code, not Mastra's documented pattern: the harness pairs the vectors it got with
chunks by position and upserts only those pairs, which is the silent path described above.

Hard negatives in the clean pool: Mastra's defaults over short per-paragraph documents, and clean 1,000/100
chunking over the long question-level documents. Both stay clear.

## Known false alarms

- An ingestion that skips chunks on purpose (empty or boilerplate chunks) reads as missing vectors unless the skip
  happens before chunks are counted.

## Known misses

The exact boundary of the token-overflow signal: it catches every chunk longer than the window the embedder
**declares**, measured with the embedder's **own tokenizer**. That is the default-stack case (`@mastra/fastembed`
truncates at min(512, the model's `model_max_length`), which is the window the report declares, and tokens are
counted with the model's `tokenizer.json`). It misses truncation the declared window does not describe:

- An embedder that truncates below the window it declares (a provider-side character cap, a proxy that cuts
  inputs) is missed: the counts are measured against the declared window. Only the duplicate-vector signal can
  catch it, and only when chunks share a long prefix.
- A pipeline that counts with a different tokenizer than its embedder, or that cannot reach the embedder's
  tokenizer and estimates, can under-count tokens and miss chunks just over the window.
- A vector store that silently drops rows after reporting its count is invisible here.
- An index that already held rows from an earlier ingestion reports a larger count, which can hide rows the store
  dropped from this one (the upserted count still catches drops before the store).

## Credits

Silent embedder truncation is long documented (Sentence-Transformers docs, Ollama #14259), and truncating to the
model's window is standard behaviour. This entry measures what it costs when Mastra's default chunker and default
local embedder meet, and turns it into an ingestion trace scorer with reproducible faults.

## Results

<!-- docs-tables:results:start -->

Source: `scripted` (offline scripted model, local embeddings). Platform: darwin arm64, Node v24.22.0. Generated: 2026-10-15 (UTC). Versions: @mastra/core 1.77.0, @mastra/rag 2.6.7, @mastra/fastembed 1.3.3, @mastra/libsql 1.26.1.

- caught 113/120 = 94.2% [Wilson 95%: 88.4%, 97.1%]; not expressed: 7; caught when expressed 113/113 = 100.0% [Wilson 95%: 96.7%, 100.0%]
    - default-chunk-size / mastra-defaults: caught 21/24 = 87.5% [Wilson 95%: 69.0%, 95.7%]; not expressed: 3; caught when expressed 21/21 = 100.0% [Wilson 95%: 84.5%, 100.0%]
    - embed-batch-cap / keeps-7-of-8: caught 22/24 = 91.7% [Wilson 95%: 74.2%, 97.7%]; not expressed: 2; caught when expressed 22/22 = 100.0% [Wilson 95%: 85.1%, 100.0%]
    - embed-batch-cap / keeps-4-of-8: caught 22/24 = 91.7% [Wilson 95%: 74.2%, 97.7%]; not expressed: 2; caught when expressed 22/22 = 100.0% [Wilson 95%: 85.1%, 100.0%]
    - zero-vectors / every-tenth: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
    - zero-vectors / every-second: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
- false alarms 0/288 = 0.0% [Wilson 95%: 0.0%, 1.3%; rule of three: 1.0%]
    - hard negative mastra-default-chunking-short-documents: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - hard negative clean-chunking-long-documents: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
- Also fires on other entries' faults:
    - vector-side-off / collapsed-embedder: fired 24/24
- Threshold sensitivity (one threshold at a time, the others at their defaults; caught over expressed runs):
    - `MAX_MISSING_CHUNKS`: 0 (default): caught 113/113, false alarms 0/288; 1: caught 95/113, false alarms 0/288; 5: caught 74/113, false alarms 0/288; 20: caught 69/113, false alarms 0/288
    - `MAX_OVER_LIMIT_CHUNKS`: 0 (default): caught 113/113, false alarms 0/288; 1: caught 105/113, false alarms 0/288; 5: caught 92/113, false alarms 0/288; 20: caught 92/113, false alarms 0/288
    - `MAX_DEGENERATE_VECTORS`: 0 (default): caught 113/113, false alarms 0/288; 1: caught 100/113, false alarms 0/288; 5: caught 77/113, false alarms 0/288; 20: caught 65/113, false alarms 0/288

Held-out families vary retrieval config, query phrasing, answer and abstention wording, and supervisor and worker wording, and the clean pool holds hard negatives; the faults themselves are our reproductions, so a high catch rate shows the detector matches them, not how often the failure occurs or is caught in the wild. Generated by `pnpm docs:tables` from `results/offline/report.json`.

<!-- docs-tables:results:end -->
