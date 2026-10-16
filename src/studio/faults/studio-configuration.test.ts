import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, test } from 'vitest';

import {
    defaultMultiAgentConfig,
    interactiveScenario,
    ragAgentInstructions,
    searchCorpusOutputSchema,
    type HarnessConfig,
    type SearchCallContext,
    type SearchCorpusOutput,
} from '../../harness/index.ts';
import { lenientRagInstructions } from './live-triggers.ts';
import type { StudioFaultPreset } from './model.ts';
import { studioFaultPresetList, studioFaultPresets } from './presets.ts';
import { studioConfiguration } from './studio-configuration.ts';

const liveStandIn = new MockLanguageModelV4();
const firstSearch: SearchCallContext & { readonly query: string } = {
    scenario: interactiveScenario,
    priorCalls: 0,
    query: 'Monstera',
};

/**
 * The parts of a configuration a fault changes, with the agents' model left out. Wrappers are closures built anew by
 * every application, so they compare by count; their behaviour is checked per trigger below.
 */
const mechanismsOf = (config: HarnessConfig) => ({
    settings: config.settings,
    embedderWrappers: config.mechanisms.embedderWrappers.length,
    retrieverWrappers: config.mechanisms.retrieverWrappers.length,
    searchOutputWrappers: config.mechanisms.searchOutputWrappers.length,
    delegationReplyWrappers: config.mechanisms.delegationReplyWrappers.length,
    ragAgentInstructions: config.mechanisms.ragAgentInstructions,
});

/** The fault case applied to the clean Studio configuration, then the preset's trigger: what both modes must hold. */
const expectedMechanisms = (preset: StudioFaultPreset) => {
    const withCase = preset.faultCase.apply(defaultMultiAgentConfig);
    return mechanismsOf(preset.trigger === null ? withCase : preset.trigger(withCase));
};

describe('studioConfiguration', () => {
    test.each(studioFaultPresetList)('$id: both modes carry the fault case and the trigger unchanged', (preset) => {
        const scripted = studioConfiguration(preset, { kind: 'scripted' });
        const live = studioConfiguration(preset, { kind: 'live', model: liveStandIn });
        expect(mechanismsOf(scripted.config)).toEqual(expectedMechanisms(preset));
        expect(mechanismsOf(live.config)).toEqual(expectedMechanisms(preset));
        expect(live.documents).toBe(scripted.documents);
    });

    test.each(studioFaultPresetList)('$id: live mode runs the provided model, never a scripted policy', (preset) => {
        expect(studioConfiguration(preset, { kind: 'live', model: liveStandIn }).config.mechanisms.model).toEqual({
            kind: 'provided',
            model: liveStandIn,
        });
    });

    test('scripted mode serves every agent from a scripted thread model', () => {
        studioFaultPresetList.forEach((preset) => {
            const { model } = studioConfiguration(preset, { kind: 'scripted' }).config.mechanisms;
            expect(model.kind).toBe('provided');
        });
    });

    test('a clean session is the clean multi-agent configuration over paragraphs', () => {
        const clean = studioConfiguration(null, { kind: 'scripted' });
        expect(mechanismsOf(clean.config)).toEqual(mechanismsOf(defaultMultiAgentConfig));
        expect(clean.documents).toBe('paragraphs');
    });

    test('default-chunk-size ingests long question-level documents', () => {
        expect(studioConfiguration(studioFaultPresets['default-chunk-size'], { kind: 'scripted' }).documents).toBe(
            'question-contexts',
        );
    });

    test('the lenient presets swap the RAG prompt; the others keep the strict one', () => {
        const instructionsOf = (preset: StudioFaultPreset) =>
            studioConfiguration(preset, { kind: 'live', model: liveStandIn }).config.mechanisms.ragAgentInstructions;
        expect(instructionsOf(studioFaultPresets['filter-key-mismatch-lenient'])).toBe(lenientRagInstructions);
        expect(instructionsOf(studioFaultPresets['search-errors-lenient'])).toBe(lenientRagInstructions);
        expect(instructionsOf(studioFaultPresets['filter-key-mismatch'])).toBe(ragAgentInstructions);
        expect(lenientRagInstructions).not.toMatch(/only|abstain|reply exactly/i);
    });

    test('search-drops-results returns an empty result for a search that found rows, and passes errors on', () => {
        const { searchOutputWrappers } = studioConfiguration(studioFaultPresets['search-drops-results'], {
            kind: 'live',
            model: liveStandIn,
        }).config.mechanisms;
        const found = searchCorpusOutputSchema.parse({
            hits: [{ chunkId: 'Monstera#0', sourceId: 'Monstera', score: 0.8, text: 'Monstera ...', citation: 'S1' }],
        });
        const rewrite = (output: SearchCorpusOutput) =>
            searchOutputWrappers.reduce((current, wrap) => wrap(current, firstSearch), output);
        expect(rewrite(found)).toEqual({ hits: [] });
        expect(rewrite({ error: 'upstream 503' })).toEqual({ error: 'upstream 503' });
    });

    test('worker-reply-dropped empties every worker reply the supervisor reads', () => {
        const { delegationReplyWrappers } = studioConfiguration(studioFaultPresets['worker-reply-dropped'], {
            kind: 'live',
            model: liveStandIn,
        }).config.mechanisms;
        expect(delegationReplyWrappers).toHaveLength(1);
        expect(
            delegationReplyWrappers.reduce(
                (reply, wrap) => wrap(reply, { workerId: 'researcher-agent', iteration: 1 }),
                'Monstera has 59 species [S1].',
            ),
        ).toBe('');
    });
});
