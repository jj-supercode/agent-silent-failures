import type { AgentLabel } from '../../harness/index.ts';
import type { StudioFaultPreset, StudioMode } from './model.ts';
import { presetObservation } from './preset-observation.ts';
import { studioFaultPresetList } from './presets.ts';

/** The label every agent's description (and the top-level agents' names) carries while a preset is active. */
export const agentLabelOf = (preset: StudioFaultPreset): AgentLabel => `FAULT ${preset.id}`;

/** Where to look for the expected verdict in Studio. */
export const whereToScore = (preset: StudioFaultPreset): string => {
    const observation = presetObservation(preset);
    switch (observation) {
        case 'ingestion':
            return 'score the "corpus ingestion" trace under Observability';
        case 'rag-agent-chat':
            return 'chat with the RAG agent, then score that trace under Observability';
        case 'supervisor-chat':
            return (
                'chat with the Supervisor (a question, then a "Subjects: A | B" line naming two corpus articles), ' +
                'then score that trace under Observability'
            );
        default:
            return observation satisfies never;
    }
};

const reachText = (preset: StudioFaultPreset): string =>
    preset.live.kind === 'live-capable' ? 'live-capable' : `scripted-only: ${preset.live.reason}`;

const scriptedText = (preset: StudioFaultPreset): string =>
    `scripted mode also runs the catalog fault ${preset.faultCase.faultId}/${preset.faultCase.severity}`;

/** Scripted runs fire by construction; a real model may recover, which is a correct clear, never a miss. */
const expectation = (preset: StudioFaultPreset, mode: StudioMode): string => {
    switch (mode) {
        case 'scripted':
            return `Expect ${preset.faultCase.entryId} to fire: ${whereToScore(preset)}.`;
        case 'live':
            return (
                `Score with ${preset.faultCase.entryId}: ${whereToScore(preset)}. It fires when the failure reaches ` +
                'the trace; a model that recovers (abstains, or says the search failed) is a correct clear.'
            );
        default:
            return mode satisfies never;
    }
};

/** The line a Studio session prints at start: no fault, or which fault is active and what should fire. */
export const activeFaultLine = (preset: StudioFaultPreset | null, mode: StudioMode): string =>
    preset === null
        ? `[studio] no fault preset: a clean ${mode} session (pnpm studio --list-faults shows the presets)`
        : `[studio] FAULT ACTIVE (${mode}): ${preset.id}: ${preset.breaks}. ${expectation(preset, mode)}`;

const listingBlock = (preset: StudioFaultPreset): string =>
    [
        preset.id,
        `  breaks:   ${preset.breaks}`,
        `  fires:    ${preset.faultCase.entryId}: ${whereToScore(preset)}`,
        `  runs:     ${reachText(preset)}`,
        `  scripted: ${scriptedText(preset)}`,
    ].join('\n');

/** What `--list-faults` prints: every preset, what it breaks, which detector should fire, and where it can run. */
export const faultListing = (): string =>
    [
        'Studio fault presets (pnpm studio --fault <preset>, pnpm studio:live --fault <preset>):',
        '',
        ...studioFaultPresetList.map(listingBlock).flatMap((block) => [block, '']),
        'Live-capable presets break infrastructure or configuration only; Claude decides what to do about it, and a',
        'recovery (an abstention, an acknowledged error) is a correct clear. Scripted-only presets need the model',
        'itself to misbehave and are refused by pnpm studio:live.',
    ].join('\n');
