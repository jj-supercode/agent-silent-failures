import { defineRunEntry, entryIdSchema } from '../contract.ts';
import { detectToolLoop } from './detector.ts';
import { toolLoopThresholds } from './model.ts';

export const toolLoopEntryId = entryIdSchema.parse('tool-loop');

export const toolLoopEntry = defineRunEntry({
    id: toolLoopEntryId,
    title: 'Tool loop',
    summary:
        'The agent keeps calling the same tool with near-identical arguments, or cycles between two calls, until its step budget runs out.',
    family: 'tool-use',
    status: 'stable',
    thresholds: toolLoopThresholds,
    runViewOptions: { retrievalTools: new Map() },
    detect: detectToolLoop,
});
