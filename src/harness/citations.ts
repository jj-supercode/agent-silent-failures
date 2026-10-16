import type { RetrievalHit, RunView } from '../trace/index.ts';

/**
 * Rows are labelled by their search's position in the run, so a label never repeats within a run: the search at
 * position `p` (0-based, in the order the searches started, workers included) labels its row of rank `r` (1-based)
 * `S{p * topK + r}`. With top K 5, the first search cites S1 to S5 and the second S6 to S10, even when the first
 * returned fewer rows or both ran in parallel.
 */
export const citationLabel = (searchPosition: number, topK: number, rank: number): string =>
    `S${searchPosition * topK + rank}`;

const citationPattern = /\[(S\d+)\]/g;

export const citedLabels = (text: string): readonly string[] => [
    ...new Set(text.matchAll(citationPattern).map((match) => match[1] ?? '')),
];

export type ResolvedCitation = { readonly label: string; readonly hit: RetrievalHit | null };

const labelledRows = (view: RunView, topK: number): ReadonlyMap<string, RetrievalHit> =>
    new Map(
        view.retrievals.flatMap((call, position) =>
            call.retrieved.kind === 'rows'
                ? call.retrieved.hits.map((hit, index) => [citationLabel(position, topK, index + 1), hit] as const)
                : [],
        ),
    );

/**
 * Resolves the labels in the root answer against the rows every search of the run returned, in start order (the
 * order `searchCorpus` hands out positions, so a supervisor's answer resolves the labels its workers relayed). A label
 * with no such row resolves to `null`, which is itself a finding.
 */
export const resolveCitations = (view: RunView, topK: number): readonly ResolvedCitation[] => {
    const rows = labelledRows(view, topK);
    return citedLabels(view.rootAgentRun.outputText).map((label) => ({ label, hit: rows.get(label) ?? null }));
};
