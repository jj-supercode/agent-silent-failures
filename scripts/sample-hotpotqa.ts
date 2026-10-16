import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { asyncBufferFromFile, parquetReadObjects } from 'hyparquet';
import { z } from 'zod';

import { corpusQuestionSchema } from '../src/corpus/index.ts';
import { selectSubsample, type SubsampleSpec } from './hotpotqa/select-subsample.ts';
import { hotpotSourceRowSchema } from './hotpotqa/source-row.ts';
import { toCorpusQuestionRecord } from './hotpotqa/to-corpus-question.ts';

const sourceDataset = {
    name: 'hotpotqa/hotpot_qa',
    config: 'distractor',
    split: 'validation',
    revision: '1908d6afbbead072334abe2965f91bd2709910ab',
    file: 'distractor/validation-00000-of-00001.parquet',
    url: 'https://huggingface.co/datasets/hotpotqa/hotpot_qa/resolve/1908d6afbbead072334abe2965f91bd2709910ab/distractor/validation-00000-of-00001.parquet',
    license: 'CC BY-SA 4.0',
} as const;

const subsampleSpec = {
    seed: 'agent-silent-failures/hotpotqa/v1',
    perType: { bridge: 20, comparison: 20 },
} as const satisfies SubsampleSpec;

const sha256 = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');

const { values } = parseArgs({
    options: {
        source: { type: 'string' },
        out: { type: 'string', default: join(import.meta.dirname, '..', 'data', 'hotpotqa') },
    },
});
if (values.source === undefined) {
    console.error(`usage: pnpm data:sample --source <path to ${sourceDataset.file}> (download: ${sourceDataset.url})`);
    process.exit(1);
}

const sourceRows = z
    .array(hotpotSourceRowSchema)
    .parse(await parquetReadObjects({ file: await asyncBufferFromFile(values.source) }));
const questions = selectSubsample(sourceRows, subsampleSpec).map((row) =>
    corpusQuestionSchema.parse(toCorpusQuestionRecord(row)),
);
const jsonl = questions.map((question) => JSON.stringify(question)).join('\n') + '\n';

const manifest = {
    source: { ...sourceDataset, sha256: sha256(await readFile(values.source)), rows: sourceRows.length },
    sampling: {
        method: 'rank rows by sha256(seed:id), take greedily per type, skip rows whose gold titles are already used',
        ...subsampleSpec,
    },
    output: { file: 'questions.jsonl', questions: questions.length, sha256: sha256(jsonl) },
};

await writeFile(join(values.out, 'questions.jsonl'), jsonl);
await writeFile(join(values.out, 'manifest.json'), JSON.stringify(manifest, null, 4) + '\n');
console.log(`wrote ${questions.length} questions to ${values.out}`);
