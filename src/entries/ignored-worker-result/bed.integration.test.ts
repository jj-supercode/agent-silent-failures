import { describe, expect, test } from 'vitest';

import { CorpusLoadError, loadQuestions, toSourceDocuments } from '../../corpus/index.ts';
import {
    defaultMultiAgentConfig,
    scoreStoredTrace,
    withMultiAgentRuns,
    withTransientSearchError,
    type HarnessConfig,
    type ViewedRun,
} from '../../harness/index.ts';
import { ignoredWorkerResultEntry } from './entry.ts';
import { supervisorIgnoresWorkersFault } from './fault.ts';
import { ignoredWorkerResultScorer } from './scorer.ts';

const smokeSeeds = [0, 1, 2];
const questionsUnderTest = 2;

const loaded = await loadQuestions();
if (loaded.kind === 'failed') {
    throw new CorpusLoadError(loaded.failure);
}
const questions = loaded.questions.slice(0, questionsUnderTest);
const runCount = smokeSeeds.length * questions.length;

/**
 * The whole corpus, not only the questions under test: on a two-question corpus both researchers retrieve the same
 * rows, so no reply holds a fact of its own and every run is (rightly) not applicable.
 */
const documents = toSourceDocuments(loaded.questions);

const request = (config: HarnessConfig) => ({
    config,
    documents,
    questions,
    seeds: smokeSeeds,
    scorers: { [ignoredWorkerResultEntry.id]: ignoredWorkerResultScorer },
});

const faultVariant = (severity: string) => {
    const variant = supervisorIgnoresWorkersFault.variants.find((candidate) => candidate.severity === severity);
    if (variant === undefined) {
        throw new Error(`no ${severity} variant`);
    }
    return variant;
};

const verdictKinds = (runs: readonly ViewedRun[]) => runs.map((run) => ignoredWorkerResultEntry.detect(run.view).kind);

describe('ignored-worker-result on the offline stack (real Mastra, fastembed, LibSQL)', () => {
    test.each([
        ['clean: answers synthesised from every reply', defaultMultiAgentConfig],
        ['a transient search error inside the workers', withTransientSearchError(defaultMultiAgentConfig)],
    ])('never fires on a multi-agent run with %s', async (_label, config) => {
        expect(await withMultiAgentRuns(request(config), verdictKinds)).not.toContain('fired');
    });

    test('fires on every run under answer-from-prior', async () => {
        expect(
            await withMultiAgentRuns(
                request(faultVariant('answer-from-prior').apply(defaultMultiAgentConfig)),
                verdictKinds,
            ),
        ).toEqual(Array(runCount).fill('fired'));
    });

    /**
     * A known miss, stated rather than hidden: when both researchers retrieve the same rows, the kept reply already
     * carries the overridden subject's facts, so they do reach the answer and the run reads as clear.
     */
    test('fires on most runs under override-one-worker and is never unjudgeable', async () => {
        const kinds = await withMultiAgentRuns(
            request(faultVariant('override-one-worker').apply(defaultMultiAgentConfig)),
            verdictKinds,
        );
        expect(kinds.filter((kind) => kind === 'fired').length).toBeGreaterThanOrEqual(runCount / 2);
        expect(kinds).not.toContain('not-applicable');
    });

    test('scores 1 on a faulted trace and 0 on a clean one through Mastra trace scoring', async () => {
        const firstScore = (config: HarnessConfig) =>
            withMultiAgentRuns({ ...request(config), seeds: [0] }, ([run]) =>
                run === undefined ? null : scoreStoredTrace(run, ignoredWorkerResultScorer),
            );
        const [faulted] = supervisorIgnoresWorkersFault.variants;
        expect(await firstScore(faulted.apply(defaultMultiAgentConfig))).toBe(1);
        expect(await firstScore(defaultMultiAgentConfig)).toBe(0);
    });
});
