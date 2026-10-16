import { describe, expect, test } from 'vitest';

import { catalogEntries } from '../catalog/index.ts';
import { CorpusLoadError, loadQuestions } from '../corpus/index.ts';
import { ragAgentKey, supervisorKey } from '../harness/index.ts';
import { demonstratePreset } from './demonstration/drive-preset.ts';
import { presetVerdict } from './demonstration/preset-verdict.ts';
import { demonstrationQuestions } from './demonstration/questions.ts';
import { studioFaultPresetList } from './faults/presets.ts';
import { startStudioHarness } from './start-studio-harness.ts';

const loaded = await loadQuestions();
if (loaded.kind === 'failed') {
    throw new CorpusLoadError(loaded.failure);
}
const [firstQuestion] = demonstrationQuestions(loaded.questions);
if (firstQuestion === undefined) {
    throw new Error('the corpus holds no held-out question with a supervisor task');
}

describe('Studio under every fault preset (scripted)', () => {
    test.each(studioFaultPresetList)(
        '$id: Studio starts, shows the fault on its agents and keeps every scorer',
        async (preset) => {
            await using harness = await startStudioHarness({ model: { kind: 'scripted' }, preset });
            const rag = harness.mastra.getAgent(ragAgentKey);
            const supervisor = harness.mastra.getAgent(supervisorKey);
            expect(rag.name).toBe(`RAG agent [FAULT ${preset.id}]`);
            expect(supervisor.name).toBe(`Supervisor [FAULT ${preset.id}]`);
            expect(supervisor.getDescription()).toContain(`[FAULT ${preset.id}]`);
            expect(Object.keys(harness.mastra.listScorers() ?? {}).toSorted()).toEqual(
                catalogEntries.map((entry) => entry.id).toSorted(),
            );
        },
    );

    test.each(studioFaultPresetList)(
        '$id: its entry fires on a Studio chat, scored the way Studio scores',
        async (preset) => {
            const demonstration = await demonstratePreset({
                preset,
                model: { kind: 'scripted' },
                questions: [firstQuestion],
                onTrace: () => Promise.resolve(),
            });
            expect(presetVerdict(demonstration).kind).toBe('fired');
        },
    );

    test('a clean Studio session labels nothing', async () => {
        await using harness = await startStudioHarness({ model: { kind: 'scripted' }, preset: null });
        expect(harness.mastra.getAgent(ragAgentKey).name).toBe('RAG agent');
        expect(harness.mastra.getAgent(supervisorKey).name).toBe('Supervisor');
    });
});
