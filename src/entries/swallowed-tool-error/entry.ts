import type { AnswerPhrasePattern } from '../../text/abstention.ts';
import { defineRunEntry, entryIdSchema, type RunEntry } from '../contract.ts';
import { createSwallowedToolErrorDetector } from './detector.ts';
import { swallowedToolErrorThresholds, type SwallowedToolErrorThresholds } from './model.ts';

export const swallowedToolErrorEntryId = entryIdSchema.parse('swallowed-tool-error');

export type SwallowedToolErrorOptions = {
    /** The agent's own sentences for admitting a failure, if the shared phrases do not cover them. */
    readonly extraAcknowledgementPatterns: readonly AnswerPhrasePattern[];
};

/** The swallowed-tool-error entry for an agent that admits failures in its own words. */
export const defineSwallowedToolErrorEntry = ({
    extraAcknowledgementPatterns,
}: SwallowedToolErrorOptions): RunEntry<SwallowedToolErrorThresholds> =>
    defineRunEntry({
        id: swallowedToolErrorEntryId,
        title: 'Swallowed tool error',
        summary: 'A tool call failed and returned an error as its result, and the agent answered as if it had worked.',
        family: 'tool-use',
        status: 'stable',
        thresholds: swallowedToolErrorThresholds,
        runViewOptions: { retrievalTools: new Map() },
        detect: createSwallowedToolErrorDetector(extraAcknowledgementPatterns),
    });

/** The entry with the shared abstention and failure-acknowledgement phrases only. */
export const swallowedToolErrorEntry = defineSwallowedToolErrorEntry({ extraAcknowledgementPatterns: [] });
