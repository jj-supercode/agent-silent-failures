import { describe, expect, test } from 'vitest';

import { CorpusLoadError, loadQuestions } from '../../corpus/index.ts';
import { entryIdSchema } from '../../entries/index.ts';
import { replicatedVariations } from './condition-cases.ts';
import { planRuns } from './plan-runs.ts';
import { devQuestionCount, questionsOf } from './question-split.ts';

const loaded = await loadQuestions();
if (loaded.kind === 'failed') {
    throw new CorpusLoadError(loaded.failure);
}
const corpus = loaded.questions;
const heldOutQuestionCount = corpus.length - devQuestionCount;
const heldOutBaselineReplicates = 5;
const heldOut = planRuns(corpus, { split: 'held-out', entryId: null });
const dev = planRuns(corpus, { split: 'dev', entryId: null });

describe('questionsOf', () => {
    test('splits the corpus into disjoint dev and held-out questions', () => {
        const devIds = new Set(questionsOf(corpus, 'dev').map((question) => question.id));
        const heldOutIds = questionsOf(corpus, 'held-out').map((question) => question.id);
        expect(devIds.size).toBe(devQuestionCount);
        expect(heldOutIds).toHaveLength(corpus.length - devQuestionCount);
        expect(heldOutIds.filter((id) => devIds.has(id))).toEqual([]);
    });
});

describe('planRuns', () => {
    test('is deterministic: the same request plans the same runs and seeds', () => {
        const again = planRuns(corpus, { split: 'held-out', entryId: null });
        expect(again.map((spec) => [spec.runId, spec.seed])).toEqual(heldOut.map((spec) => [spec.runId, spec.seed]));
    });

    test('run ids are unique and seeds differ between splits', () => {
        expect(new Set(heldOut.map((spec) => spec.runId)).size).toBe(heldOut.length);
        const devSeeds = new Set(dev.map((spec) => spec.seed));
        expect(heldOut.filter((spec) => devSeeds.has(spec.seed))).toEqual([]);
    });

    test('held-out runs use only held-out families and questions', () => {
        const devQuestions = new Set(questionsOf(corpus, 'dev').map((question) => question.id));
        expect(new Set(heldOut.map((spec) => spec.family))).toEqual(new Set(['h1', 'h2', 'h3']));
        expect(heldOut.some((spec) => devQuestions.has(spec.question.id))).toBe(false);
    });

    test.each([...replicatedVariations])('the held-out %s holds every question x 5 replicates', (variation) => {
        const baseline = heldOut.filter(
            (spec) =>
                spec.observation === 'agent-run' &&
                spec.condition.kind === 'clean' &&
                spec.condition.variation === variation,
        );
        expect(baseline).toHaveLength(heldOutQuestionCount * heldOutBaselineReplicates);
    });

    test('multi-agent faults run only on the multi-agent harness', () => {
        const multiAgentEntries = new Set(['delegation-ping-pong', 'ignored-worker-result']);
        const faulted = heldOut.filter(
            (spec) => spec.condition.kind === 'faulted' && multiAgentEntries.has(spec.condition.entryId),
        );
        expect(faulted.length).toBeGreaterThan(0);
        expect(faulted.every((spec) => spec.plan.setting.harness === 'multi-agent')).toBe(true);
    });

    test('default-chunk-size runs over question-level documents', () => {
        const defaultChunks = heldOut.filter(
            (spec) => spec.condition.kind === 'faulted' && spec.condition.faultId === 'default-chunk-size',
        );
        expect(defaultChunks.length).toBeGreaterThan(0);
        expect(
            defaultChunks.every((spec) =>
                spec.plan.documents.every((document) => document.sourceId.startsWith('question:')),
            ),
        ).toBe(true);
        expect(defaultChunks.every((spec) => spec.plan.config.settings.chunking.maxSize === 4000)).toBe(true);
    });

    test('a configuration that replaces the model is labelled fault-policy; other clean runs keep the clean policy', () => {
        const modelSourceOf = (predicate: (spec: (typeof heldOut)[number]) => boolean) =>
            new Set(heldOut.filter(predicate).map((spec) => spec.modelSource));
        const scriptedHardNegatives = ['entity-swap/', 'parallel-retry/'];
        const isScriptedHardNegative = ({ condition }: (typeof heldOut)[number]) =>
            condition.kind === 'clean' &&
            scriptedHardNegatives.some((prefix) => condition.variation.startsWith(prefix));
        expect(modelSourceOf((spec) => spec.condition.kind === 'clean' && !isScriptedHardNegative(spec))).toEqual(
            new Set(['clean-policy']),
        );
        expect(modelSourceOf(isScriptedHardNegative)).toEqual(new Set(['fault-policy']));
        expect(
            modelSourceOf((spec) => spec.condition.kind === 'faulted' && spec.condition.faultId === 'repeated-search'),
        ).toEqual(new Set(['fault-policy']));
        expect(
            modelSourceOf((spec) => spec.condition.kind === 'faulted' && spec.condition.faultId === 'vector-side-off'),
        ).toEqual(new Set(['clean-policy']));
    });

    test('family settings reach the harness config', () => {
        const topKs = new Set(heldOut.map((spec) => spec.plan.config.settings.retrieval.topK));
        expect(topKs).toEqual(new Set([3, 5, 8]));
    });

    test('ingestions are planned per question, on the documents of that question only', () => {
        const ingestions = heldOut.filter((spec) => spec.observation === 'ingestion');
        expect(ingestions.length).toBeGreaterThan(0);
        expect(
            ingestions.every((spec) => new Set(spec.plan.documents.map((document) => document.sourceId)).size <= 20),
        ).toBe(true);
        expect(ingestions.every((spec) => spec.harness === 'single-agent')).toBe(true);
    });

    test('an entry filter keeps only its faults, and judges false alarms on the whole clean pool', () => {
        const pingPong = entryIdSchema.parse('delegation-ping-pong');
        const filtered = planRuns(corpus, { split: 'held-out', entryId: pingPong });
        const cleanRunIds = (specs: typeof heldOut) =>
            specs
                .filter((spec) => spec.condition.kind === 'clean' && spec.observation === 'agent-run')
                .map((spec) => spec.runId);
        expect(filtered.every((spec) => spec.observation === 'agent-run')).toBe(true);
        expect(filtered.every((spec) => spec.condition.kind === 'clean' || spec.condition.entryId === pingPong)).toBe(
            true,
        );
        expect(cleanRunIds(filtered)).toEqual(cleanRunIds(heldOut));
    });
});
