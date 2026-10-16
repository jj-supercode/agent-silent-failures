import { describe, expect, test } from 'vitest';

import { questionIdSchema } from '../../src/corpus/index.ts';
import { entryIdSchema } from '../../src/entries/index.ts';
import {
    demonstrationSpendSchema,
    type DemonstrationReport,
    type PresetDemonstration,
} from '../../src/studio/demonstration/index.ts';
import { modelIdSchema } from '../../src/trace/index.ts';
import { demonstrationBlock } from './render-demonstration.ts';

const toolLoop = entryIdSchema.parse('tool-loop');
const ignoredWorker = entryIdSchema.parse('ignored-worker-result');
const questionId = questionIdSchema.parse('5ab92e3c554299753720f777');

const provenance = {
    source: 'scripted',
    platform: 'linux arm64, Node v24.22.0',
    generatedOn: '2026-10-15',
    versions: { '@mastra/core': '1.77.0' },
} as const;

const toolLoopRun = (kind: 'fired' | 'clear', reason: string): PresetDemonstration => ({
    kind: 'ran',
    preset: 'search-drops-results',
    expectedEntry: toolLoop,
    traces: [{ kind: 'agent-run', questionId, answer: 'An answer.', outcomes: [{ entryId: toolLoop, kind, reason }] }],
});

const ignoredWorkerRun: PresetDemonstration = {
    kind: 'ran',
    preset: 'supervisor-ignores-workers',
    expectedEntry: ignoredWorker,
    traces: [
        {
            kind: 'agent-run',
            questionId,
            answer: 'Ingrid, 1611.',
            outcomes: [
                { entryId: ignoredWorker, kind: 'fired', reason: 'fired, severity 1.00: answered from its prior' },
            ],
        },
    ],
};

const report = (presets: readonly PresetDemonstration[], live: boolean): DemonstrationReport => ({
    provenance: { ...provenance, source: live ? 'live' : 'scripted' },
    agentModel: modelIdSchema.parse(live ? 'claude-haiku-5-5' : 'scripted-policy'),
    questionCount: 1,
    presets,
    spend: live ? demonstrationSpendSchema.parse({ usd: 0.0421, modelCalls: 37 }) : null,
    basis: { kind: 'verdicts-only' },
});

const scripted = report(
    [toolLoopRun('fired', 'fired, severity 0.33: three near-identical searches'), ignoredWorkerRun],
    false,
);

describe('demonstrationBlock', () => {
    test('before any live run, every live cell says so and the evidence is the scripted firing', () => {
        const block = demonstrationBlock(scripted, null);
        expect(block).toContain('The live column is not run yet');
        expect(block).toContain('| `tool-loop` | `search-drops-results`: ');
        expect(block).toContain(
            '| fired 1/1 | not run yet | scripted: fired, severity 0.33: three near-identical searches |',
        );
    });

    test('a live run that cleared is reported with its reason, and a scripted-only preset is marked as such', () => {
        const live = report(
            [
                toolLoopRun('clear', 'no tool call repeated 3 times or cycled in the agent run'),
                {
                    kind: 'not-run',
                    preset: 'supervisor-ignores-workers',
                    expectedEntry: ignoredWorker,
                    reason: 'scripted-only',
                },
            ],
            true,
        );
        const block = demonstrationBlock(scripted, live);
        expect(block).toContain(
            '| fired 1/1 | not fired 0/1 | live: no tool call repeated 3 times or cycled in the agent run |',
        );
        expect(block).toContain(
            '| fired 1/1 | scripted-only, not run live | scripted: fired, severity 1.00: answered from its prior |',
        );
        expect(block).toContain('Live column: model `claude-haiku-5-5`');
        expect(block).toContain('USD 0.0421 over 37 model calls');
    });

    test('the live reading names entries that fired live and entries the model recovered from, never as misses', () => {
        const live = report(
            [
                toolLoopRun('clear', 'no tool call repeated 3 times or cycled in the agent run'),
                { ...ignoredWorkerRun, kind: 'ran' },
            ],
            true,
        );
        const block = demonstrationBlock(scripted, live);
        expect(block).toContain('Live, `ignored-worker-result` fired on the chats with `claude-haiku-5-5`.');
        expect(block).toContain('On the presets of `tool-loop`, `claude-haiku-5-5` recovered on its own');
        expect(block).toContain('never a miss');
    });

    test('a column scored from recorded traces names its recording; a verdict-only live file names none', () => {
        const traceBacked: DemonstrationReport = {
            ...scripted,
            basis: { kind: 'recorded-traces', fixtures: 'fixtures/demonstration/scripted/2026-10-15' },
        };
        const block = demonstrationBlock(traceBacked, report([toolLoopRun('clear', 'no repeat')], true));
        expect(block).toContain('; scored from the recorded traces in `fixtures/demonstration/scripted/2026-10-15`).');
        expect(block).not.toMatch(/Live column:[^.]*scored from the recorded traces/);
    });

    test('a live preset whose runs failed is not counted as a recovery', () => {
        const failedRun: PresetDemonstration = {
            kind: 'ran',
            preset: 'search-drops-results',
            expectedEntry: toolLoop,
            traces: [{ kind: 'run-failed', questionId, reason: 'provider overloaded' }],
        };
        expect(demonstrationBlock(scripted, report([failedRun], true))).not.toContain('recovered on its own');
    });

    test('a live ingestion firing is credited to the ingestion, never to the model', () => {
        const coverage = entryIdSchema.parse('embedding-coverage');
        const ingestion: PresetDemonstration = {
            kind: 'ran',
            preset: 'default-chunk-size',
            expectedEntry: coverage,
            traces: [{ kind: 'ingestion', outcomes: [{ entryId: coverage, kind: 'fired', reason: 'fired' }] }],
        };
        const block = demonstrationBlock(scripted, report([ingestion], true));
        expect(block).toContain("`embedding-coverage` fired on the live session's ingestion, which calls no model.");
        expect(block).not.toContain('fired on the chats');
    });
});
