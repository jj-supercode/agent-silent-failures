import { describe, expect, test } from 'vitest';

import { harnessKeySchema } from '../../bed/index.ts';
import { questionIdSchema } from '../../corpus/index.ts';
import { studioFaultPresetList, studioFaultPresets } from '../faults/presets.ts';
import { demonstrationLabels, presetHarnessKey, presetOfHarnessKey } from './recording-labels.ts';

const questionId = questionIdSchema.parse('5ab92e3c554299753720f777');

describe('preset harness keys', () => {
    test.each(studioFaultPresetList)('$id round-trips through its harness key', ({ id }) => {
        expect(presetOfHarnessKey(presetHarnessKey(id))).toBe(id);
    });

    test('a key no demonstration wrote names no preset', () => {
        expect(presetOfHarnessKey(harnessKeySchema.parse('held-out/h2/clean'))).toBeNull();
        expect(presetOfHarnessKey(harnessKeySchema.parse('studio/not-a-preset'))).toBeNull();
    });
});

describe('demonstrationLabels', () => {
    test('a chat line carries the preset in its run id and its catalog fault case as the condition', () => {
        const preset = studioFaultPresets['search-drops-results'];
        expect(demonstrationLabels(preset, 'live', { kind: 'rag-agent-chat', questionId })).toMatchObject({
            runId: `studio/search-drops-results/${questionId}`,
            harnessKey: 'studio/search-drops-results',
            harness: 'single-agent',
            observation: 'agent-run',
            questionId,
            condition: {
                kind: 'faulted',
                entryId: preset.faultCase.entryId,
                faultId: preset.faultCase.faultId,
                severity: preset.faultCase.severity,
            },
        });
    });

    test('a supervisor chat is a multi-agent run; the ingestion has one line per preset', () => {
        const supervisor = studioFaultPresets['worker-reply-dropped'];
        expect(demonstrationLabels(supervisor, 'live', { kind: 'supervisor-chat', questionId }).harness).toBe(
            'multi-agent',
        );
        const ingestion = demonstrationLabels(studioFaultPresets['embed-batch-cap'], 'scripted', {
            kind: 'ingestion',
            questionId,
        });
        expect(ingestion).toMatchObject({ runId: 'studio/embed-batch-cap/ingestion', observation: 'ingestion' });
    });

    test('only a scripted preset that scripts the model is a fault policy; a live model never is', () => {
        const scriptsTheModel = studioFaultPresets['supervisor-ignores-workers'];
        const infrastructureOnly = studioFaultPresets['collapsed-embedder'];
        const observation = { kind: 'supervisor-chat', questionId } as const;
        expect(demonstrationLabels(scriptsTheModel, 'scripted', observation).modelSource).toBe('fault-policy');
        expect(demonstrationLabels(infrastructureOnly, 'scripted', observation).modelSource).toBe('clean-policy');
        expect(demonstrationLabels(scriptsTheModel, 'live', observation).modelSource).toBe('clean-policy');
    });
});
