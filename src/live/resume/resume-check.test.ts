import { beforeAll, describe, expect, test } from 'vitest';

import { planRuns, runIdSchema, type RunSpec } from '../../bed/index.ts';
import { loadQuestions } from '../../corpus/index.ts';
import { modelIdSchema } from '../../trace/index.ts';
import { selectLiveRuns } from '../live-plan.ts';
import { identityMismatches, runsToResume, type RecordingIdentity } from './resume-check.ts';

const sampledRuns = 6;
let planned: readonly RunSpec[] = [];

beforeAll(async () => {
    const loaded = await loadQuestions();
    if (loaded.kind === 'failed') {
        throw new Error('the corpus did not load');
    }
    planned = selectLiveRuns(planRuns(loaded.questions, { split: 'held-out', entryId: null }), sampledRuns).runs;
});

const identity: RecordingIdentity = {
    mode: 'live',
    corpusSha256: 'a'.repeat(64),
    models: { agent: modelIdSchema.parse('claude-haiku-5-5'), judge: null },
    versions: { '@mastra/core': '1.77.0', ai: '7.0.140' },
    split: 'held-out',
};

describe('identityMismatches', () => {
    test('finds nothing when the checkout matches the recording', () => {
        expect(identityMismatches(identity, identity)).toEqual([]);
    });

    test('names a different corpus, model, judge, mode or split', () => {
        const changed: RecordingIdentity = {
            mode: 'dry-run',
            corpusSha256: 'b'.repeat(64),
            models: { agent: modelIdSchema.parse('another-model'), judge: modelIdSchema.parse('a-judge') },
            versions: identity.versions,
            split: 'dev',
        };
        expect(identityMismatches(identity, changed)).toHaveLength(5);
    });

    test('names every traced package whose version changed, appeared or disappeared', () => {
        const upgraded = { ...identity, versions: { '@mastra/core': '1.78.0', '@mastra/rag': '2.6.7' } };
        expect(identityMismatches(identity, upgraded)).toEqual([
            '@mastra/core 1.77.0 when recorded, 1.78.0 now',
            '@mastra/rag absent when recorded, 2.6.7 now',
            'ai 7.0.140 when recorded, absent now',
        ]);
    });
});

describe('runsToResume', () => {
    test('keeps every planned run without a completed line, in plan order', () => {
        const completed = [planned[0], planned[2]].flatMap((spec) => (spec === undefined ? [] : [spec.runId]));
        const selection = runsToResume(planned, completed);
        expect(selection.kind).toBe('runs');
        expect(selection.kind === 'runs' ? selection.runs.map((spec) => spec.runId) : []).toEqual(
            planned.filter((spec) => !completed.includes(spec.runId)).map((spec) => spec.runId),
        );
    });

    test('has nothing to do once every planned run completed', () => {
        expect(
            runsToResume(
                planned,
                planned.map((spec) => spec.runId),
            ),
        ).toEqual({ kind: 'runs', runs: [] });
    });

    test('refuses a recording holding a completed run the plan does not know', () => {
        const foreign = runIdSchema.parse('held-out/elsewhere/r0');
        expect(runsToResume(planned, [foreign])).toEqual({ kind: 'foreign-runs', runIds: [foreign] });
    });
});
