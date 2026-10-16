import { entryResultsBlock } from '../../src/bed/index.ts';
import { catalogEntries, resultsBlockName } from '../../src/catalog/index.ts';
import { embeddingCoverageEntryId, type EntryId } from '../../src/entries/index.ts';
import type { DocsInputs } from './collect-inputs.ts';
import { defaultStackCatch } from './default-stack-catch.ts';
import { bedProvenance } from './provenance-text.ts';
import { entriesTable } from './render-entries-table.ts';
import { defaultStackBlock } from './render-default-stack.ts';
import { demonstrationBlock } from './render-demonstration.ts';
import { headlineBlock } from './render-headline.ts';
import { liveLessonsBlock } from './render-live-lessons.ts';
import { recordedLeadBlock } from './render-recorded-lead.ts';
import { pitchBlock } from './render-pitch.ts';
import { replayBlock } from './render-replay.ts';
import { revisedOnRecording } from './report-queries.ts';
import { reprosTable } from './render-repros-table.ts';
import { usesBlock } from './render-uses.ts';

/** A page and the generated blocks it holds, by marker name. */
export type GeneratedPage = { readonly path: string; readonly blocks: Readonly<Record<string, string>> };

const heldOutSplit = (inputs: DocsInputs) => inputs.offline.splits.find((split) => split.split === 'held-out');

const readmeBlocks = (inputs: DocsInputs): Readonly<Record<string, string>> => {
    const heldOut = heldOutSplit(inputs);
    const provenance = bedProvenance(inputs.offline.provenance);
    return {
        pitch: pitchBlock(inputs.headlineRepros.book.evidence),
        uses: usesBlock({
            demonstration: inputs.demonstration,
            replaySummary: inputs.replaySummary,
            replayReport: inputs.replayReport,
        }),
        'recorded-lead': recordedLeadBlock({
            replaySummary: inputs.replaySummary,
            replayReport: inputs.replayReport,
            firstScoring: { summary: inputs.firstScoringSummary, report: inputs.firstScoringReport },
            offlineHeldOut: heldOut,
            offlineProvenance: provenance,
            entries: catalogEntries,
        }),
        'live-lessons': liveLessonsBlock({
            firstScoring: {
                summary: inputs.firstScoringSummary,
                report: inputs.firstScoringReport,
                offline: inputs.firstScoringOffline,
            },
            currentScoring: { summary: inputs.replaySummary, report: inputs.replayReport, offline: inputs.offline },
            outageAnswers: inputs.outageAnswers,
        }),
        headline: headlineBlock({
            ...inputs.headlineRepros,
            defaultStackCatch: defaultStackCatch(heldOut),
            bedProvenance: provenance,
        }),
        entries:
            heldOut === undefined
                ? 'The offline report has no held-out split; run `pnpm bed`.'
                : entriesTable(catalogEntries, heldOut, provenance),
        replay: replayBlock({
            summary: inputs.replaySummary,
            report: inputs.replayReport,
            entries: catalogEntries,
            inSample: revisedOnRecording(
                { summary: inputs.firstScoringSummary, report: inputs.firstScoringReport },
                { summary: inputs.replaySummary, report: inputs.replayReport },
            ),
        }),
        demonstration: demonstrationBlock(inputs.demonstration.scripted, inputs.demonstration.live),
    };
};

/** Blocks a page carries besides its results, by entry id. */
const extraEntryBlocks = (
    inputs: DocsInputs,
): Readonly<Partial<Record<EntryId, Readonly<Record<string, string>>>>> => ({
    [embeddingCoverageEntryId]: { 'default-stack': defaultStackBlock(inputs.headlineRepros) },
});

/** Each registered entry's page: its held-out results, rendered from the committed offline report. */
const entryPages = (inputs: DocsInputs): readonly GeneratedPage[] => {
    const extras = extraEntryBlocks(inputs);
    return catalogEntries.map((entry) => ({
        path: `src/entries/${entry.id}/README.md`,
        blocks: {
            ...extras[entry.id],
            [resultsBlockName]: entryResultsBlock(inputs.offline, entry.id, inputs.offline.provenance),
        },
    }));
};

/** Every page `pnpm docs:tables` writes. */
export const generatedPages = (inputs: DocsInputs): readonly GeneratedPage[] => [
    { path: 'README.md', blocks: readmeBlocks(inputs) },
    { path: 'docs/findings-in-mastra.md', blocks: { repros: reprosTable(inputs.repros) } },
    ...entryPages(inputs),
];
