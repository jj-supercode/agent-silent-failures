import { describe, expect, test } from 'vitest';

import { runEntryItems } from '../../catalog/index.ts';
import { sampleQuestion } from '../../corpus/testing.ts';
import {
    fixtureManifestSchema,
    recordedRunSchema,
    type FixtureManifest,
    type RecordedRun,
} from '../../record/index.ts';
import { sampleAgentRunSpans, sampleTraceId } from '../../trace/testing.ts';
import { studioFaultPresets } from '../faults/presets.ts';
import type { StudioFaultPreset } from '../faults/model.ts';
import { demonstrationSpendSchema } from './model.ts';
import { demonstrationLabels } from './recording-labels.ts';
import { scoreDemonstrationRecording, type DemonstrationRecording } from './score-recording.ts';

const question = sampleQuestion('5ab92e3c554299753720f777', ['Oldham County', 'John Bowman']);
const answer = 'Oldham County is in Kentucky [S1].';

const manifest = (mode: FixtureManifest['mode'], runs: readonly RecordedRun[]): FixtureManifest =>
    fixtureManifestSchema.parse({
        schemaVersion: 1,
        mode,
        recordedOn: '2026-10-16',
        startedAt: '2026-10-16T09:00:00.000Z',
        finishedAt: '2026-10-16T09:05:00.000Z',
        models: { agent: 'claude-haiku-5-5', judge: null },
        platform: { os: 'linux 6.10', arch: 'arm64', node: 'v24.22.0' },
        versions: { '@mastra/core': '1.77.0' },
        corpusSha256: '0'.repeat(64),
        split: 'held-out',
        plannedRuns: runs.length,
        recordedRuns: runs.length,
        failedRuns: runs.filter((run) => run.outcome.kind === 'failed').length,
        stoppedEarly: null,
        keptSpanTypes: ['agent_run', 'tool_call'],
    });

const chatLabels = (preset: StudioFaultPreset) =>
    demonstrationLabels(preset, 'live', { kind: 'rag-agent-chat', questionId: question.id });

const completedChat = (preset: StudioFaultPreset): RecordedRun =>
    recordedRunSchema.parse({
        labels: chatLabels(preset),
        outcome: {
            kind: 'completed',
            trace: {
                traceId: sampleTraceId,
                spans: sampleAgentRunSpans({ agentId: 'rag-agent', outputText: answer, steps: [] }),
            },
            judgement: null,
        },
    });

const failedChat = (preset: StudioFaultPreset, reason: string): RecordedRun =>
    recordedRunSchema.parse({ labels: chatLabels(preset), outcome: { kind: 'failed', reason } });

const recording = (runs: readonly RecordedRun[]): DemonstrationRecording => ({
    fixtures: { directory: '/tmp/recording', manifest: manifest('live', runs), runs },
    spend: demonstrationSpendSchema.parse({ usd: 0.02, modelCalls: 40 }),
    name: 'fixtures/demonstration/live/2026-10-16',
});

const searchDrops = studioFaultPresets['search-drops-results'];
const searchErrors = studioFaultPresets['search-errors'];

describe('scoreDemonstrationRecording', () => {
    const report = scoreDemonstrationRecording(
        recording([completedChat(searchDrops), failedChat(searchErrors, 'RunBudgetExceededError: cap reached')]),
        [question],
    );
    const presetRun = (id: StudioFaultPreset['id']) => report.presets.find((candidate) => candidate.preset === id);

    test('scores a recorded chat with every run entry, as Studio reports it, and reads the answer off the trace', () => {
        expect(presetRun('search-drops-results')).toMatchObject({
            kind: 'ran',
            expectedEntry: searchDrops.faultCase.entryId,
            traces: [{ kind: 'agent-run', questionId: question.id, answer }],
        });
        const ran = presetRun('search-drops-results');
        const outcomes = ran?.kind === 'ran' && ran.traces[0]?.kind === 'agent-run' ? ran.traces[0].outcomes : [];
        expect(outcomes.map((outcome) => outcome.entryId)).toEqual(runEntryItems.map(({ entry }) => entry.id));
        // A run without tool calls is not one tool-loop applies to: Studio reports that as not scorable.
        expect(outcomes.find((outcome) => outcome.entryId === 'tool-loop')?.kind).toBe('not-scorable');
    });

    test('a run that failed while recording stays in the report with its reason', () => {
        expect(presetRun('search-errors')).toMatchObject({
            kind: 'ran',
            traces: [{ kind: 'run-failed', reason: 'RunBudgetExceededError: cap reached' }],
        });
    });

    test('a preset without lines is not run: the scripted-only one says why, a live-capable one says the session stopped', () => {
        const scriptedOnly = presetRun('supervisor-ignores-workers');
        expect(scriptedOnly?.kind === 'not-run' ? scriptedOnly.reason : '').toContain('scripted-only');
        expect(presetRun('collapsed-embedder')).toMatchObject({
            kind: 'not-run',
            reason: 'not recorded: the session stopped before it ran',
        });
    });

    test('the report names its recording, keeps its spend and is labelled recorded, from the manifest alone', () => {
        expect(report).toMatchObject({
            agentModel: 'claude-haiku-5-5',
            spend: demonstrationSpendSchema.parse({ usd: 0.02, modelCalls: 40 }),
            basis: { kind: 'recorded-traces', fixtures: 'fixtures/demonstration/live/2026-10-16' },
            provenance: { source: 'recorded', generatedOn: '2026-10-16' },
        });
        expect(report.presets.map((presetRun) => presetRun.preset)).toEqual(Object.keys(studioFaultPresets));
    });
});
