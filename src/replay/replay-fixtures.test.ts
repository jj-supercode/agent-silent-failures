import { describe, expect, test } from 'vitest';

import { sampleQuestion } from '../corpus/testing.ts';
import {
    fixtureManifestSchema,
    fixtureSchemaVersion,
    recordedRunSchema,
    type FixtureSet,
    type RecordedRunInput,
} from '../record/index.ts';
import { descendingScore, sampleAgentRunSpans, sampleHits } from '../trace/testing.ts';
import { replayFixtures, sourceOf } from './replay-fixtures.ts';

const question = sampleQuestion('q-1', ['Paris', 'France', 'Lyon']);

const cleanLabels = (runId: string, questionId: string = question.id): RecordedRunInput['labels'] => ({
    runId,
    split: 'held-out',
    family: 'h1',
    questionId,
    replicate: 0,
    seed: 7,
    harness: 'single-agent',
    condition: { kind: 'clean', variation: 'baseline', hardNegativeFor: [] },
    observation: 'agent-run',
    modelSource: 'clean-policy',
    harnessKey: 'held-out/h1/clean/baseline',
});

const answeredSpans = sampleAgentRunSpans({
    agentId: 'rag-agent',
    outputText: 'Paris is a place. [S1]',
    steps: [
        {
            toolName: 'searchCorpus',
            args: { query: 'Paris' },
            result: { returned: { hits: sampleHits(3, descendingScore) } },
        },
    ],
});

/** Round-trips through JSON, as a committed fixture line does. */
const recorded = (input: RecordedRunInput) => recordedRunSchema.parse(JSON.parse(JSON.stringify(input)));

const fixtureSet = (mode: 'live' | 'dry-run', runs: readonly RecordedRunInput[]): FixtureSet => ({
    directory: 'fixtures/test',
    manifest: fixtureManifestSchema.parse({
        schemaVersion: fixtureSchemaVersion,
        mode,
        recordedOn: '2026-10-15',
        startedAt: '2026-10-15T08:00:00.000Z',
        finishedAt: '2026-10-15T09:00:00.000Z',
        models: { agent: 'claude-haiku-5-5', judge: null },
        platform: { os: 'linux', arch: 'arm64', node: 'v24.15.0' },
        versions: { '@mastra/core': '1.77.0' },
        corpusSha256: 'a'.repeat(64),
        split: 'held-out',
        plannedRuns: runs.length,
        recordedRuns: runs.length,
        failedRuns: 0,
        stoppedEarly: null,
        keptSpanTypes: ['agent_run', 'tool_call'],
    }),
    runs: runs.map(recorded),
});

const completed = (runId: string, questionId?: string): RecordedRunInput => ({
    labels: cleanLabels(runId, questionId),
    outcome: {
        kind: 'completed',
        trace: { traceId: 'trace-sample', spans: answeredSpans },
        judgement: { kind: 'judged', correct: true, reason: 'states Paris' },
    },
});

describe('replayFixtures', () => {
    test('scores a recorded run with every run entry and labels it recorded for a live fixture', () => {
        const result = replayFixtures(fixtureSet('live', [completed('run-a')]), [question]);
        expect(result.source).toBe('recorded');
        expect(result.scored).toHaveLength(1);
        expect(result.scored[0]?.source).toBe('recorded');
        expect(result.scored[0]?.verdicts.length).toBeGreaterThan(0);
        expect(result.judged).toEqual([{ runId: 'run-a', correct: true }]);
    });

    test('labels a dry-run fixture scripted', () => {
        expect(replayFixtures(fixtureSet('dry-run', [completed('run-a')]), [question]).scored[0]?.source).toBe(
            'scripted',
        );
    });

    test('reports a run that failed while recording instead of scoring it', () => {
        const failedRun: RecordedRunInput = {
            labels: cleanLabels('run-b'),
            outcome: { kind: 'failed', reason: 'BudgetExceededError: budget cap reached' },
        };
        const result = replayFixtures(fixtureSet('live', [completed('run-a'), failedRun]), [question]);
        expect(result.scored).toHaveLength(1);
        expect(result.failedWhileRecording).toEqual([
            { runId: 'run-b', reason: 'BudgetExceededError: budget cap reached' },
        ]);
    });

    test('reports a run whose question is not in the corpus as unscorable', () => {
        const result = replayFixtures(fixtureSet('live', [completed('run-c', 'q-missing')]), [question]);
        expect(result.scored).toEqual([]);
        expect(result.unscorable).toEqual([{ runId: 'run-c', reason: 'question q-missing is not in the corpus' }]);
    });
});

describe('sourceOf', () => {
    test('maps a live recording to recorded numbers and a dry run to scripted ones', () => {
        expect(sourceOf('live')).toBe('recorded');
        expect(sourceOf('dry-run')).toBe('scripted');
    });
});
