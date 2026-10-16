import {
    defineEmptyRetrievalAnsweredEntry,
    defineFlatScoreEntry,
    delegationPingPongEntry,
    embeddingCoverageEntry,
    ignoredWorkerResultEntry,
    swallowedToolErrorEntry,
    toolLoopEntry,
} from '../entries/index.ts';
import { harnessRunViewOptions } from './retrieval-tools.ts';

/** The run entries that read retrieval rows, bound to the harness's `searchCorpus` tool. */
export const flatScoreEntry = defineFlatScoreEntry(harnessRunViewOptions);

/** The harness agent abstains with the shared contract sentence, so it needs no extra abstention patterns. */
export const emptyRetrievalAnsweredEntry = defineEmptyRetrievalAnsweredEntry({
    runViewOptions: harnessRunViewOptions,
    extraAbstentionPatterns: [],
});

export {
    delegationPingPongEntry,
    embeddingCoverageEntry,
    ignoredWorkerResultEntry,
    swallowedToolErrorEntry,
    toolLoopEntry,
};
