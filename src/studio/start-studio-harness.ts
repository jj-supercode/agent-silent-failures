import { catalogEntries, documentsFor } from '../catalog/index.ts';
import { CorpusLoadError, loadQuestions } from '../corpus/index.ts';
import { createEntryScorer, type Entry } from '../entries/index.ts';
import { createMultiAgentHarness, type MultiAgentHarness } from '../harness/index.ts';
import { StudioHarnessStartError } from './errors.ts';
import { agentLabelOf } from './faults/preset-text.ts';
import type { StudioFaultPreset } from './faults/model.ts';
import { studioConfiguration, type StudioAgentModel } from './faults/studio-configuration.ts';
import { createStudioMemory } from './studio-memory.ts';

/** A catalog entry with its scorer as registered on the Studio instance, ready for trace scoring. */
export type RegisteredEntryScorer = { readonly entry: Entry; readonly scorer: ReturnType<typeof createEntryScorer> };

export type StudioHarness = MultiAgentHarness & { readonly entryScorers: readonly RegisteredEntryScorer[] };

export type StudioHarnessRequest = {
    readonly model: StudioAgentModel;
    /** `null` is a clean session. */
    readonly preset: StudioFaultPreset | null;
};

/**
 * The harness behind both Studio projects: the RAG agent with conversation memory, the supervisor with its two
 * workers, the ingested corpus and one scorer per catalog entry, under the requested fault preset. The projects
 * differ only in the agents' model. An active preset labels every agent's description, and the top-level agents'
 * names, so no screenshot can pass a faulted session off as a clean one.
 */
export const startStudioHarness = async ({ model, preset }: StudioHarnessRequest): Promise<StudioHarness> => {
    const loaded = await loadQuestions();
    if (loaded.kind === 'failed') {
        throw new CorpusLoadError(loaded.failure);
    }
    const { config, documents } = studioConfiguration(preset, model);
    const entryScorers = catalogEntries.map((entry) => ({ entry, scorer: createEntryScorer(entry) }));
    const created = await createMultiAgentHarness({
        config,
        documents: documentsFor(documents, loaded.questions),
        scorers: Object.fromEntries(entryScorers.map(({ entry, scorer }) => [entry.id, scorer])),
        agentMemory: createStudioMemory(),
        ...(preset === null ? {} : { agentLabel: agentLabelOf(preset) }),
    });
    if (created.kind === 'failed') {
        throw new StudioHarnessStartError(created.failure);
    }
    return { ...created.harness, entryScorers };
};
