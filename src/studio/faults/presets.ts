import { catalog, faultIdSchema, severityIdSchema, type FaultCase } from '../../catalog/index.ts';
import { UnknownFaultCaseError } from './errors.ts';
import { withLenientPrompt, withSearchResultsDropped, withWorkerReplyDropped } from './live-triggers.ts';
import type { LiveReach, StudioFaultId, StudioFaultPreset } from './model.ts';

const catalogFaultCase = (faultId: string, severity: string): FaultCase => {
    const wanted = { faultId: faultIdSchema.parse(faultId), severity: severityIdSchema.parse(severity) };
    const found = catalog
        .flatMap((item) => item.faultCases)
        .find((candidate) => candidate.faultId === wanted.faultId && candidate.severity === wanted.severity);
    if (found === undefined) {
        throw new UnknownFaultCaseError(faultId, severity);
    }
    return found;
};

const liveCapable: LiveReach = { kind: 'live-capable' };

const underLenientPrompt =
    '; the RAG agent runs a lenient prompt ("use the search results when helpful", no rule to abstain)';

/**
 * Every Studio preset, one per catalog fault severity worth showing interactively. Each reuses its catalog fault
 * case unchanged; the only additions are the documented live triggers in `live-triggers.ts`.
 */
export const studioFaultPresets = {
    'collapsed-embedder': {
        id: 'collapsed-embedder',
        breaks: 'every text embeds to the same vector, so every retrieval score is identical',
        faultCase: catalogFaultCase('vector-side-off', 'collapsed-embedder'),
        trigger: null,
        live: liveCapable,
    },
    'constant-fused-score': {
        id: 'constant-fused-score',
        breaks: 'a fusion layer whose vector leg is dead reports 0.5 for every row',
        faultCase: catalogFaultCase('vector-side-off', 'constant-fused-score'),
        trigger: null,
        live: liveCapable,
    },
    'default-chunk-size': {
        id: 'default-chunk-size',
        breaks: "long question-level documents ingested with Mastra's default 4,000-character chunks into a 512-token embedder",
        faultCase: catalogFaultCase('default-chunk-size', 'mastra-defaults'),
        trigger: null,
        live: liveCapable,
    },
    'embed-batch-cap': {
        id: 'embed-batch-cap',
        breaks: 'the embedder returns 4 vectors for every batch of 8 chunks, with no error',
        faultCase: catalogFaultCase('embed-batch-cap', 'keeps-4-of-8'),
        trigger: null,
        live: liveCapable,
    },
    'filter-key-mismatch': {
        id: 'filter-key-mismatch',
        breaks: 'every search filters on a metadata key no row has, so it returns zero rows',
        faultCase: catalogFaultCase('empty-retrieval-answered-from-memory', 'filter-key-mismatch'),
        trigger: null,
        live: liveCapable,
    },
    'filter-key-mismatch-lenient': {
        id: 'filter-key-mismatch-lenient',
        breaks: `every search filters on a metadata key no row has, so it returns zero rows${underLenientPrompt}`,
        faultCase: catalogFaultCase('empty-retrieval-answered-from-memory', 'filter-key-mismatch'),
        trigger: withLenientPrompt,
        live: liveCapable,
    },
    'search-errors': {
        id: 'search-errors',
        breaks: 'every search returns an error payload instead of rows',
        faultCase: catalogFaultCase('swallowed-search-error', 'retry-then-answer'),
        trigger: null,
        live: liveCapable,
    },
    'search-errors-lenient': {
        id: 'search-errors-lenient',
        breaks: `every search returns an error payload instead of rows${underLenientPrompt}`,
        faultCase: catalogFaultCase('swallowed-search-error', 'retry-then-answer'),
        trigger: withLenientPrompt,
        live: liveCapable,
    },
    'search-drops-results': {
        id: 'search-drops-results',
        breaks:
            'every search runs, then its rows are dropped before the model reads them: an empty result and no error ' +
            '(the mastra#24110 symptom)',
        faultCase: catalogFaultCase('repeated-search', 'repeat-3'),
        trigger: withSearchResultsDropped,
        live: liveCapable,
    },
    'worker-reply-dropped': {
        id: 'worker-reply-dropped',
        breaks: "Mastra's onDelegationComplete hook hands the supervisor an empty reply from every worker",
        faultCase: catalogFaultCase('supervisor-no-ack', 'redelegate-3'),
        trigger: withWorkerReplyDropped,
        live: liveCapable,
    },
    'supervisor-ignores-workers': {
        id: 'supervisor-ignores-workers',
        breaks: 'the supervisor answers from its own prior instead of what its workers returned',
        faultCase: catalogFaultCase('supervisor-ignores-workers', 'answer-from-prior'),
        trigger: null,
        live: {
            kind: 'scripted-only',
            reason: 'no infrastructure change makes a real supervisor ignore replies it did receive',
        },
    },
} as const satisfies { readonly [Id in StudioFaultId]: StudioFaultPreset & { readonly id: Id } };

export const studioFaultPresetList: readonly StudioFaultPreset[] = Object.values(studioFaultPresets);
