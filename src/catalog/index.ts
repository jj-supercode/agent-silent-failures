import { supervisorNoAckFault } from '../entries/delegation-ping-pong/fault.ts';
import { defaultChunkSizeFault, embedBatchCapFault, zeroVectorsFault } from '../entries/embedding-coverage/fault.ts';
import { emptyRetrievalAnsweredFault } from '../entries/empty-retrieval-answered/fault.ts';
import { flatScoreFault } from '../entries/flat-score/fault.ts';
import { supervisorIgnoresWorkersFault } from '../entries/ignored-worker-result/fault.ts';
import type { Entry, IngestionEntry, RunEntry } from '../entries/index.ts';
import { swallowedSearchErrorFault } from '../entries/swallowed-tool-error/fault.ts';
import { repeatedSearchFault } from '../entries/tool-loop/fault.ts';
import {
    delegationPingPongEntry,
    embeddingCoverageEntry,
    emptyRetrievalAnsweredEntry,
    flatScoreEntry,
    ignoredWorkerResultEntry,
    swallowedToolErrorEntry,
    toolLoopEntry,
} from './bound-entries.ts';
import { allCases, faultCases } from './fault-cases.ts';
import {
    scoresAlwaysFlattened,
    policyAlwaysExpressed,
    someChunkNotStored,
    someChunkTruncated,
    someStoredRowUnreachable,
} from './fault-expressions.ts';
import type { CatalogItem, RunSetting } from './model.ts';
import {
    delegationPingPongSweeps,
    embeddingCoverageSweeps,
    emptyRetrievalAnsweredSweeps,
    flatScoreSweeps,
    ignoredWorkerResultSweeps,
    swallowedToolErrorSweeps,
    toolLoopSweeps,
} from './threshold-sweeps.ts';

const singleAgentParagraphs: RunSetting = { harness: 'single-agent', documents: 'paragraphs' };
const multiAgent: RunSetting = { harness: 'multi-agent' };

/**
 * Every entry with its reproductions and threshold sweeps: the single, complete, harness-bound list. Adding an entry
 * is one folder under `src/entries/` plus one item here. Multi-agent faults are bound to the multi-agent setting,
 * where the supervisor they change exists; `default-chunk-size` only reproduces over long question-level documents.
 */
export const catalog: readonly CatalogItem[] = [
    {
        entry: embeddingCoverageEntry,
        faultCases: allCases(
            faultCases(
                embeddingCoverageEntry.id,
                defaultChunkSizeFault,
                { harness: 'single-agent', documents: 'question-contexts' },
                someChunkTruncated,
            ),
            faultCases(embeddingCoverageEntry.id, embedBatchCapFault, singleAgentParagraphs, someChunkNotStored),
            faultCases(embeddingCoverageEntry.id, zeroVectorsFault, singleAgentParagraphs, someStoredRowUnreachable),
        ),
        sweeps: embeddingCoverageSweeps,
    },
    {
        entry: flatScoreEntry,
        faultCases: faultCases(flatScoreEntry.id, flatScoreFault, singleAgentParagraphs, scoresAlwaysFlattened),
        sweeps: flatScoreSweeps,
    },
    {
        entry: emptyRetrievalAnsweredEntry,
        faultCases: faultCases(
            emptyRetrievalAnsweredEntry.id,
            emptyRetrievalAnsweredFault,
            singleAgentParagraphs,
            policyAlwaysExpressed,
        ),
        sweeps: emptyRetrievalAnsweredSweeps,
    },
    {
        entry: swallowedToolErrorEntry,
        faultCases: faultCases(
            swallowedToolErrorEntry.id,
            swallowedSearchErrorFault,
            singleAgentParagraphs,
            policyAlwaysExpressed,
        ),
        sweeps: swallowedToolErrorSweeps,
    },
    {
        entry: toolLoopEntry,
        faultCases: faultCases(toolLoopEntry.id, repeatedSearchFault, singleAgentParagraphs, policyAlwaysExpressed),
        sweeps: toolLoopSweeps,
    },
    {
        entry: delegationPingPongEntry,
        faultCases: faultCases(delegationPingPongEntry.id, supervisorNoAckFault, multiAgent, policyAlwaysExpressed),
        sweeps: delegationPingPongSweeps,
    },
    {
        entry: ignoredWorkerResultEntry,
        faultCases: faultCases(
            ignoredWorkerResultEntry.id,
            supervisorIgnoresWorkersFault,
            multiAgent,
            policyAlwaysExpressed,
        ),
        sweeps: ignoredWorkerResultSweeps,
    },
];

export const catalogEntries: readonly Entry[] = catalog.map((item) => item.entry);

export const runEntryItems = catalog.flatMap((item) =>
    item.entry.kind === 'run' ? [{ entry: item.entry, sweeps: item.sweeps }] : [],
) satisfies readonly { entry: RunEntry }[];

export const ingestionEntryItems = catalog.flatMap((item) =>
    item.entry.kind === 'ingestion' ? [{ entry: item.entry, sweeps: item.sweeps }] : [],
) satisfies readonly { entry: IngestionEntry }[];

export { cleanPool } from './clean-pool.ts';
export { resultsBlockMarkers, resultsBlockName } from './entry-doc.ts';
export { documentLayoutOf, documentsFor } from './documents.ts';
export { harnessRunViewOptions } from './retrieval-tools.ts';
export * from './model.ts';
