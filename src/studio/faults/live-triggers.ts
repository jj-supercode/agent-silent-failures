import {
    searchCorpusToolId,
    withDelegationReplyWrapper,
    withRagAgentInstructions,
    withSearchOutputWrapper,
    type HarnessConfig,
} from '../../harness/index.ts';

/**
 * A system prompt many RAG apps ship: search results are a help, not the only allowed source, and nothing says to
 * abstain. A configuration choice, not a bug; under it a model that meets empty or failed retrieval is free to answer
 * from memory, which is the failure the empty-retrieval and swallowed-error entries catch.
 */
export const lenientRagInstructions = [
    `Answer the question. Use the ${searchCorpusToolId} tool and use the search results when helpful.`,
    'Cite passages you use with their label in square brackets, for example [S1].',
].join('\n');

export const withLenientPrompt = (config: HarnessConfig): HarnessConfig =>
    withRagAgentInstructions(config, lenientRagInstructions);

/**
 * Every search runs, then its rows never reach the model: an empty result and no error. The symptom of mastra#24110,
 * where a token limiter silently removed the current run's tool result and the agent re-issued the call until its
 * step budget ran out.
 */
export const withSearchResultsDropped = (config: HarnessConfig): HarnessConfig =>
    withSearchOutputWrapper(config, (output) => ('hits' in output ? { hits: [] } : output));

/** Every worker finishes its work, and the supervisor reads an empty reply: a reply lost between worker and supervisor. */
export const withWorkerReplyDropped = (config: HarnessConfig): HarnessConfig =>
    withDelegationReplyWrapper(config, () => '');
