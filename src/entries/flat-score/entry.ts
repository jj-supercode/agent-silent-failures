import type { RunViewOptions } from '../../trace/index.ts';
import { defineRunEntry, entryIdSchema, type RunEntry } from '../contract.ts';
import { detectFlatScore } from './detector.ts';
import { flatScoreThresholds, type FlatScoreThresholds } from './model.ts';

export const flatScoreEntryId = entryIdSchema.parse('flat-score');

/** The flat-score entry for an agent whose retrieval tools are declared in `runViewOptions`. */
export const defineFlatScoreEntry = (runViewOptions: RunViewOptions): RunEntry<FlatScoreThresholds> =>
    defineRunEntry({
        id: flatScoreEntryId,
        title: 'Flat retrieval scores',
        summary: 'Retrieval returns rows whose scores are all equal or not numbers, so the ranking carries no signal.',
        family: 'rag',
        status: 'stable',
        thresholds: flatScoreThresholds,
        runViewOptions,
        detect: detectFlatScore,
    });
