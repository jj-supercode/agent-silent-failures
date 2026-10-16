import { describe, expect, test } from 'vitest';

import { faultIdSchema, severityIdSchema, variationIdSchema, type FaultId } from '../../catalog/index.ts';
import { entryIdSchema } from '../../entries/index.ts';
import type { ObservedIngestion } from '../../harness/index.ts';
import { chunkCountSchema } from '../../trace/index.ts';
import type { RunCondition } from '../model.ts';
import { faultExpressionOf, scoredCondition } from './fault-expression.ts';

const chunkCount = 10;
const chunks = (count: number) => chunkCountSchema.parse(count);

const observed = (changes: Partial<ObservedIngestion> = {}): ObservedIngestion => ({
    chunkCount: chunks(chunkCount),
    storedRowCount: chunks(chunkCount),
    reachableRowCount: chunks(chunkCount),
    overWindowChunkCount: chunks(0),
    truncatedChunkCount: chunks(0),
    ...changes,
});

const faulted = (entry: string, faultId: string, severity: string): Extract<RunCondition, { kind: 'faulted' }> => ({
    kind: 'faulted',
    entryId: entryIdSchema.parse(entry),
    faultId: faultIdSchema.parse(faultId),
    severity: severityIdSchema.parse(severity),
});

const defaultChunks = faulted('embedding-coverage', 'default-chunk-size', 'mastra-defaults');
const batchCap = faulted('embedding-coverage', 'embed-batch-cap', 'keeps-7-of-8');
const zeroVectors = faulted('embedding-coverage', 'zero-vectors', 'every-tenth');
const repeatedSearch = faulted('tool-loop', 'repeated-search', 'repeat-3');

describe('faultExpressionOf', () => {
    test('default chunk size is not expressed when every chunk fits the window', () => {
        expect(faultExpressionOf(defaultChunks, observed())).toBe('not-expressed');
    });

    test('default chunk size is expressed once the embedder gives a chunk the same vector as its window head', () => {
        expect(
            faultExpressionOf(
                defaultChunks,
                observed({ overWindowChunkCount: chunks(1), truncatedChunkCount: chunks(1) }),
            ),
        ).toBe('expressed');
    });

    test('a chunk over the declared window whose tail still changes its vector is not expressed', () => {
        expect(
            faultExpressionOf(
                defaultChunks,
                observed({ overWindowChunkCount: chunks(3), truncatedChunkCount: chunks(0) }),
            ),
        ).toBe('not-expressed');
    });

    test('a batch cap is expressed only when the store holds fewer rows than there are chunks', () => {
        expect(faultExpressionOf(batchCap, observed())).toBe('not-expressed');
        expect(faultExpressionOf(batchCap, observed({ storedRowCount: chunks(chunkCount - 1) }))).toBe('expressed');
    });

    test('zero vectors are expressed only when some stored row is returned by no query', () => {
        expect(faultExpressionOf(zeroVectors, observed())).toBe('not-expressed');
        expect(faultExpressionOf(zeroVectors, observed({ reachableRowCount: chunks(chunkCount - 1) }))).toBe(
            'expressed',
        );
    });

    test('a scripted policy fault is always expressed, with or without an observation', () => {
        expect(faultExpressionOf(repeatedSearch, null)).toBe('expressed');
    });

    test('an ingestion-checked fault without an observation is unknown, as is a fault the catalog does not hold', () => {
        expect(faultExpressionOf(defaultChunks, null)).toBe('unknown');
        const unknownFault: FaultId = faultIdSchema.parse('not-in-catalog');
        expect(faultExpressionOf({ ...repeatedSearch, faultId: unknownFault }, observed())).toBe('unknown');
    });
});

describe('scoredCondition', () => {
    test('keeps clean conditions as they are and adds the expression to faulted ones', () => {
        const clean: RunCondition = {
            kind: 'clean',
            variation: variationIdSchema.parse('baseline'),
            hardNegativeFor: [],
        };
        expect(scoredCondition(clean, null)).toBe(clean);
        expect(scoredCondition(repeatedSearch, null)).toEqual({ ...repeatedSearch, expression: 'expressed' });
    });
});
