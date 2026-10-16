import { describe, expect, test } from 'vitest';

import { groupedConditionLines, planDescriptionLines } from './plan-text.ts';

const ingestionConditions = 32;
const ingestionRuns = 768;
const completedRuns = 400;

describe('live plan text', () => {
    test('scripted-only conditions collapse to one line per fault or clean family', () => {
        expect(
            groupedConditionLines([
                'agent-run repeated-search/repeat-3',
                'agent-run repeated-search/repeat-5',
                'agent-run clean/entity-swap/entity-swap-3',
                'agent-run supervisor-no-ack/redelegate-3',
            ]),
        ).toEqual([
            'repeated-search: repeat-3, repeat-5',
            'clean: entity-swap/entity-swap-3',
            'supervisor-no-ack: redelegate-3',
        ]);
    });

    test('a new plan states its exclusions once each; a resumed one states what it keeps', () => {
        const scriptedOnly = ['agent-run repeated-search/repeat-3'];
        expect(planDescriptionLines({ kind: 'new', scriptedOnly, ingestionConditions, ingestionRuns })).toContain(
            `Not recorded: ${ingestionConditions} ingestion conditions (${ingestionRuns} planned runs) call no model; ` +
                'their numbers stay scripted.',
        );
        expect(planDescriptionLines({ kind: 'resume', directory: 'fixtures/live/d', completedRuns })).toEqual([
            `Resuming fixtures/live/d: ${completedRuns} completed runs kept as recorded; only failed and missing runs are recorded.`,
        ]);
    });
});
