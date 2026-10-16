import { describe, expect, test } from 'vitest';

import { toRunView, unitIntervalSchema } from '../trace/index.ts';
import { sampleAgentRunSpans, sampleRetrievalTools } from '../trace/testing.ts';
import type { RunView } from '../trace/model.ts';
import {
    applyThresholdOverrides,
    defineRunEntry,
    entryIdSchema,
    type ThresholdOverrides,
    type Thresholds,
    type Verdict,
} from './contract.ts';
import { InvalidThresholdValueError, UnknownThresholdError } from './errors.ts';

const minimumHits = 3;
const overriddenMinimumHits = 5;

const thresholds = {
    MIN_HITS: { value: minimumHits, basis: 'two hits can tie legitimately', calibratedOn: 'prior' },
} as const satisfies Thresholds;

const fewHitsDetector = (view: RunView, current: typeof thresholds): Verdict =>
    view.retrievals.length < current.MIN_HITS.value
        ? {
              kind: 'fired',
              severity: unitIntervalSchema.parse(1),
              evidence: { spanIds: [], summary: `minimum ${current.MIN_HITS.value}` },
          }
        : { kind: 'clear', evidence: { summary: 'enough' } };

describe('applyThresholdOverrides', () => {
    test('replaces only the value of a named threshold and keeps its basis', () => {
        expect(applyThresholdOverrides(thresholds, { MIN_HITS: overriddenMinimumHits }).MIN_HITS).toEqual({
            ...thresholds.MIN_HITS,
            value: overriddenMinimumHits,
        });
    });

    test('rejects an override for a threshold the entry does not have', () => {
        const untypedOverrides: ThresholdOverrides = { MAX_HITS: 1 };
        expect(() => applyThresholdOverrides(thresholds, untypedOverrides)).toThrow(UnknownThresholdError);
    });

    test('makes a misspelt threshold name a type error', () => {
        // @ts-expect-error MIN_HIT is not a threshold of this entry
        const misspelt: ThresholdOverrides<typeof thresholds> = { MIN_HIT: overriddenMinimumHits };
        expect(misspelt).toBeDefined();
    });

    test('rejects a non-finite override value', () => {
        expect(() => applyThresholdOverrides(thresholds, { MIN_HITS: Number.NaN })).toThrow(InvalidThresholdValueError);
    });
});

describe('defineRunEntry', () => {
    const entry = defineRunEntry({
        id: entryIdSchema.parse('few-hits'),
        title: 'Few hits',
        summary: 'Fewer retrievals than expected.',
        family: 'rag',
        status: 'experimental',
        thresholds,
        runViewOptions: { retrievalTools: sampleRetrievalTools() },
        detect: fewHitsDetector,
    });
    const runWithoutRetrievals = toRunView(
        sampleAgentRunSpans({ agentId: 'rag-agent', outputText: '', steps: [] }),
        entry.runViewOptions,
    );
    const emptyView = runWithoutRetrievals.kind === 'run' ? runWithoutRetrievals.view : undefined;

    test('detects with the defined thresholds by default and with overrides on request', () => {
        expect(emptyView).toBeDefined();
        if (emptyView !== undefined) {
            expect(entry.detect(emptyView)).toMatchObject({ evidence: { summary: `minimum ${minimumHits}` } });
            expect(entry.detect(emptyView, { MIN_HITS: overriddenMinimumHits })).toMatchObject({
                evidence: { summary: `minimum ${overriddenMinimumHits}` },
            });
        }
    });
});
