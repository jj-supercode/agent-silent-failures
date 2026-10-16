import { scoreTraceBatch } from '@mastra/core/evals/scoreTraces';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { CorpusLoadError, loadQuestions, toSourceDocuments, type CorpusQuestion } from '../corpus/index.ts';
import { createEntryScorer, defineRunEntry, entryIdSchema } from '../entries/index.ts';
import { loadIngestionView, loadRunView, loadTraceSpans, unitIntervalSchema, type RunView } from '../trace/index.ts';
import { defaultHarnessConfig, withSettings } from './config.ts';
import { resolveCitations } from './citations.ts';
import { createHarness, type Harness } from './harness.ts';
import { harnessRetrievalTools } from './retrieval-tools.ts';

const questionsUnderTest = 3;
const seed = 11;

/** A throwaway entry that fires whenever a retrieval returned rows: it proves the Mastra scoring path, nothing more. */
const retrievedRowsEntry = defineRunEntry({
    id: entryIdSchema.parse('retrieved-rows-probe'),
    title: 'Retrieved rows probe',
    summary: 'Fires when any retrieval returned rows.',
    family: 'rag',
    status: 'experimental',
    thresholds: {},
    runViewOptions: { retrievalTools: harnessRetrievalTools },
    detect: (view) =>
        view.retrievals.some((call) => call.retrieved.kind === 'rows' && call.retrieved.hits.length > 0)
            ? {
                  kind: 'fired',
                  severity: unitIntervalSchema.parse(1),
                  evidence: { spanIds: view.retrievals.map((call) => call.spanId), summary: 'rows' },
              }
            : { kind: 'not-applicable', reason: 'no rows' },
});
const probeScorer = createEntryScorer(retrievedRowsEntry);

const throwMissing = (): never => {
    throw new Error('the committed corpus has fewer questions than this test needs');
};

const loadedQuestions = async (): Promise<readonly CorpusQuestion[]> => {
    const loaded = await loadQuestions();
    if (loaded.kind === 'failed') {
        throw new CorpusLoadError(loaded.failure);
    }
    return loaded.questions.slice(0, questionsUnderTest);
};

const runViewFor = async (harness: Harness, question: CorpusQuestion): Promise<RunView> => {
    const outcome = await harness.runScenario({ question, seed });
    if (outcome.kind === 'failed') {
        throw new Error(outcome.reason);
    }
    const loaded = await loadRunView(harness.mastra, outcome.run.traceId, { retrievalTools: harnessRetrievalTools });
    if (loaded.kind !== 'loaded') {
        throw new Error(`run view did not load: ${loaded.kind}`);
    }
    return loaded.view;
};

/** What must not change between two runs of the same scenario: ids and timestamps are excluded. */
const comparableShape = (view: RunView) => ({
    answer: view.rootAgentRun.outputText,
    retrievals: view.retrievals.map((call) => ({ args: call.args, retrieved: call.retrieved })),
});

describe('offline harness (real Mastra, fastembed, LibSQL; cold embedding path)', () => {
    let harness: Harness | undefined;
    let questions: readonly CorpusQuestion[] = [];

    beforeAll(async () => {
        questions = await loadedQuestions();
        const created = await createHarness({
            config: withSettings(defaultHarnessConfig, { embeddingCache: false }),
            documents: toSourceDocuments(questions),
            scorers: { [retrievedRowsEntry.id]: probeScorer },
        });
        if (created.kind === 'failed') {
            throw new Error(JSON.stringify(created.failure));
        }
        harness = created.harness;
    });

    afterAll(async () => {
        await harness?.[Symbol.asyncDispose]();
    });

    const ready = (): Harness => {
        if (harness === undefined) {
            throw new Error('harness did not start');
        }
        return harness;
    };

    test('ingestion reports every chunk embedded and indexed, none over the embedder window', () => {
        const { report } = ready().ingestion;
        expect(report.chunkCount).toBeGreaterThan(0);
        expect([report.embeddedCount, report.upsertedCount, report.vectorCount]).toEqual([
            report.chunkCount,
            report.chunkCount,
            report.chunkCount,
        ]);
        expect(report.tokenCounts.overLimitCount).toBe(0);
        expect(report.tokenCounts.maxChunkTokens).toBeLessThanOrEqual(report.embedder.maxInputTokens);
    });

    test('the ingestion trace maps to a view whose Mastra chunk count matches the report', async () => {
        const loaded = await loadIngestionView(ready().mastra, ready().ingestion.traceId);
        expect(loaded.kind).toBe('loaded');
        if (loaded.kind === 'loaded') {
            expect(loaded.view.chunkActions.map((action) => action.chunkCount)).toEqual([
                loaded.view.report.chunkCount,
            ]);
        }
    });

    test('the ingestion trace is rag_ingestion > workflow_run > one step per stage', async () => {
        const loaded = await loadTraceSpans(ready().mastra, ready().ingestion.traceId);
        const types =
            loaded.kind === 'loaded' ? loaded.spans.map((span) => `${span.spanType}:${span.entityId ?? ''}`) : [];
        expect(types).toEqual(
            expect.arrayContaining([
                'rag_ingestion:',
                'workflow_run:ingestCorpus',
                'workflow_step:chunk-documents',
                'workflow_step:embed-chunks',
                'workflow_step:upsert-vectors',
                'rag_action:chunk-documents',
            ]),
        );
    });

    test('a clean run retrieves top K rows with finite, descending, spread scores', async () => {
        const view = await runViewFor(ready(), questions[0] ?? throwMissing());
        const [retrieval] = view.retrievals;
        const scores = retrieval?.retrieved.kind === 'rows' ? retrieval.retrieved.hits.map((hit) => hit.score) : [];
        expect(view.retrievals).toHaveLength(1);
        expect(scores).toHaveLength(ready().settings.retrieval.topK);
        expect(scores.every(Number.isFinite)).toBe(true);
        expect(scores).toEqual(scores.toSorted((left, right) => right - left));
        expect(Math.max(...scores) - Math.min(...scores)).toBeGreaterThan(0);
    });

    test('a clean answer cites rows that the retrieval actually returned', async () => {
        const view = await runViewFor(ready(), questions[1] ?? throwMissing());
        const citations = resolveCitations(view, ready().settings.retrieval.topK);
        expect(citations.length).toBeGreaterThan(0);
        expect(citations.every((citation) => citation.hit !== null)).toBe(true);
    });

    test('the same scenario twice gives the same view, ids and timestamps aside', async () => {
        const question = questions[2] ?? throwMissing();
        expect(comparableShape(await runViewFor(ready(), question))).toEqual(
            comparableShape(await runViewFor(ready(), question)),
        );
    });

    test('an entry scorer scores a stored run trace through Mastra trace scoring, and skips the ingestion trace', async () => {
        const outcome = await ready().runScenario({ question: questions[0] ?? throwMissing(), seed });
        const storage = ready().mastra.getStorage();
        expect(outcome.kind).toBe('completed');
        expect(storage).toBeDefined();
        if (outcome.kind === 'completed' && storage !== undefined) {
            const batch = await scoreTraceBatch({
                storage,
                scorer: probeScorer,
                targets: [{ traceId: outcome.run.traceId }, { traceId: ready().ingestion.traceId }],
            });
            expect({
                scored: batch.scoredCount,
                notScorable: batch.notScorableCount,
                failed: batch.failedCount,
            }).toEqual({
                scored: 1,
                notScorable: 1,
                failed: 0,
            });
        }
    });
});
