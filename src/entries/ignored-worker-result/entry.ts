import { defineRunEntry, entryIdSchema } from '../contract.ts';
import { detectIgnoredWorkerResult } from './detector.ts';
import { ignoredWorkerResultThresholds } from './model.ts';

export const ignoredWorkerResultEntryId = entryIdSchema.parse('ignored-worker-result');

export const ignoredWorkerResultEntry = defineRunEntry({
    id: ignoredWorkerResultEntryId,
    title: 'Ignored worker result',
    summary:
        "A worker returned the facts, and the supervisor answered from its own prior instead, using none of the worker's result.",
    family: 'multi-agent',
    status: 'experimental',
    thresholds: ignoredWorkerResultThresholds,
    runViewOptions: { retrievalTools: new Map() },
    detect: detectIgnoredWorkerResult,
});
