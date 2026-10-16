import { countText } from '../../src/command-output/index.ts';
import { mastraDefaultChunking } from '../../src/harness/index.ts';
import { unitIntervalSchema } from '../../src/trace/model.ts';
import type { HeadlineInput } from '../docs-tables/index.ts';
import { estimateOfProportion } from './estimates.ts';
import type { ChartRow, ChartSeries, ChartSpec, Estimate } from './model.ts';

export type RetrievalChartInput = Pick<HeadlineInput, 'book' | 'memory'>;

const embedded = {
    name: 'Query text inside the embedder window',
    slot: 0,
} as const satisfies ChartSeries;
const lost = {
    name: 'Query text past the window (never embedded)',
    slot: 1,
} as const satisfies ChartSeries;

const singleMarkRow = (label: string, series: ChartSeries, estimate: Estimate): ChartRow => ({
    label,
    marks: [{ kind: 'estimate', series, estimate }],
});

/**
 * The lead finding as one picture: a query copied from text past the embedder window finds its source far less
 * often than one from inside it, in plain retrieval and in Memory recall, and the gap closes once chunks fit.
 */
export const retrievalChart = ({ book, memory }: RetrievalChartInput): ChartSpec => {
    const { retrieval, fittingControl, window } = book.evidence;
    return {
        id: 'retrieval-past-the-window',
        title: 'Text past the embedder window is hard to find',
        subtitle:
            `Mastra's defaults: @mastra/rag chunks to ${countText(mastraDefaultChunking.maxSize)} characters and ` +
            `@mastra/fastembed embeds the first ${countText(window.tokens)} tokens of each input. Share of queries that ` +
            'find their source, with Wilson 95% intervals.',
        series: [embedded, lost],
        panels: [
            {
                heading: `A long book: source chunk in the top ${retrieval.topK}`,
                axisMax: unitIntervalSchema.parse(1),
                labelValues: true,
                rows: [
                    singleMarkRow(
                        "Sentence from a chunk's head",
                        embedded,
                        estimateOfProportion(retrieval.defaultChunksHeadSentences.hitAtTopK),
                    ),
                    singleMarkRow(
                        "Sentence from a chunk's tail",
                        lost,
                        estimateOfProportion(retrieval.defaultChunksTailSentences.hitAtTopK),
                    ),
                    singleMarkRow(
                        `Same tail sentence, chunks of ${countText(fittingControl.maxSize)} characters`,
                        embedded,
                        estimateOfProportion(retrieval.fittingChunksSameTailSentences.hitAtTopK),
                    ),
                ],
            },
            {
                heading: `Mastra Memory semantic recall: message in the top ${memory.evidence.recallTopK}`,
                axisMax: unitIntervalSchema.parse(1),
                labelValues: true,
                rows: [
                    singleMarkRow(
                        `Sentence in the first ${countText(window.tokens)} tokens`,
                        embedded,
                        estimateOfProportion(memory.evidence.queriesFromEmbeddedRegion),
                    ),
                    singleMarkRow(
                        `Sentence after token ${countText(window.tokens)}`,
                        lost,
                        estimateOfProportion(memory.evidence.queriesFromNeverEmbeddedRegion),
                    ),
                ],
            },
        ],
        footnote:
            `Scripted (offline, no model). Sources: results/repros/${book.report.reproductionId}.json ` +
            `(${book.report.platform}, generated ${book.report.generatedOn}) and ` +
            `results/repros/${memory.report.reproductionId}.json (${memory.report.platform}, generated ` +
            `${memory.report.generatedOn}).`,
    };
};
