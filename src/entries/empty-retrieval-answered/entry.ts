import type { AnswerPhrasePattern } from '../../text/abstention.ts';
import type { RunViewOptions } from '../../trace/index.ts';
import { defineRunEntry, entryIdSchema, type RunEntry } from '../contract.ts';
import { createEmptyRetrievalAnsweredDetector } from './detector.ts';
import { emptyRetrievalAnsweredThresholds, type EmptyRetrievalAnsweredThresholds } from './model.ts';

export const emptyRetrievalAnsweredEntryId = entryIdSchema.parse('empty-retrieval-answered');

export type EmptyRetrievalAnsweredOptions = {
    readonly runViewOptions: RunViewOptions;
    /** The agent's own declining sentences, if the shared abstention phrases do not cover them. */
    readonly extraAbstentionPatterns: readonly AnswerPhrasePattern[];
};

/** The empty-retrieval-answered entry for an agent whose retrieval tools are declared in `runViewOptions`. */
export const defineEmptyRetrievalAnsweredEntry = ({
    runViewOptions,
    extraAbstentionPatterns,
}: EmptyRetrievalAnsweredOptions): RunEntry<EmptyRetrievalAnsweredThresholds> =>
    defineRunEntry({
        id: emptyRetrievalAnsweredEntryId,
        title: 'Empty retrieval, answered anyway',
        summary: 'Every retrieval returns no rows, yet the agent answers as if it had found something.',
        family: 'rag',
        status: 'stable',
        thresholds: emptyRetrievalAnsweredThresholds,
        runViewOptions,
        detect: createEmptyRetrievalAnsweredDetector(extraAbstentionPatterns),
    });
