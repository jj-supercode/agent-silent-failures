import { describe, expect, test } from 'vitest';

import { documentsFor } from '../../catalog/index.ts';
import { CorpusLoadError, loadQuestions } from '../../corpus/index.ts';
import type { RunSpec } from '../model.ts';
import { planRuns } from '../plan/plan-runs.ts';
import { questionsOf } from '../plan/question-split.ts';
import { verdictOf } from '../summary/run-queries.ts';
import { runBed } from './run-bed.ts';

const loaded = await loadQuestions();
if (loaded.kind === 'failed') {
    throw new CorpusLoadError(loaded.failure);
}
const [question] = questionsOf(loaded.questions, 'held-out');
const smallCorpus = loaded.questions.slice(0, 3);

const conditionIs = (spec: RunSpec, key: string): boolean =>
    spec.condition.kind === 'clean' ? spec.condition.variation === key : spec.condition.faultId === key;

/** One run per chosen condition, on one held-out question, each harness ingesting a three-question corpus. */
const chosenSpecs = planRuns(loaded.questions, { split: 'held-out', entryId: null })
    .filter((spec) => spec.question.id === question?.id && spec.replicate === 0)
    .filter(
        (spec) =>
            (spec.observation === 'agent-run' &&
                ['baseline', 'multi-agent-baseline', 'repeated-search', 'supervisor-no-ack'].some((key) =>
                    conditionIs(spec, key),
                )) ||
            (spec.observation === 'ingestion' && ['baseline', 'zero-vectors'].some((key) => conditionIs(spec, key))),
    )
    .filter((spec, index, all) => all.findIndex((other) => other.plan.key === spec.plan.key) === index)
    .map((spec) => ({
        ...spec,
        plan:
            spec.observation === 'agent-run'
                ? {
                      ...spec.plan,
                      documents: documentsFor('paragraphs', [
                          ...smallCorpus,
                          ...(question === undefined ? [] : [question]),
                      ]),
                  }
                : spec.plan,
    }));

describe('runBed on the real offline stack', () => {
    test('scores every planned run, clean runs clear and faulted runs caught by their own entry', async () => {
        const outcome = await runBed(chosenSpecs);
        expect(outcome.failures).toEqual([]);
        expect(outcome.runs).toHaveLength(chosenSpecs.length);
        outcome.runs.forEach((run) => {
            const own = run.condition.kind === 'faulted' ? verdictOf(run, run.condition.entryId) : undefined;
            if (run.condition.kind === 'faulted') {
                expect(own?.verdict.kind, run.runId).toBe('fired');
            } else {
                expect(
                    run.verdicts.filter((scored) => scored.verdict.kind === 'fired'),
                    run.runId,
                ).toEqual([]);
            }
        });
    });

    test('agent runs carry task quality and sweeps; ingestions carry only ingestion verdicts', async () => {
        const outcome = await runBed(chosenSpecs.filter((spec) => conditionIs(spec, 'baseline')));
        const agentRun = outcome.runs.find((run) => run.observation.kind === 'agent-run');
        const ingestion = outcome.runs.find((run) => run.observation.kind === 'ingestion');
        expect(
            agentRun?.observation.kind === 'agent-run' && agentRun.observation.quality.goldSentenceRecall,
        ).not.toBeNull();
        expect(agentRun?.verdicts.some((scored) => scored.sweep.length > 0)).toBe(true);
        expect(ingestion?.verdicts.map((scored) => scored.entryId)).toEqual(['embedding-coverage']);
    });

    test('is reproducible: the same specs give the same verdicts and task quality', async () => {
        const baseline = chosenSpecs.filter(
            (spec) => spec.observation === 'agent-run' && conditionIs(spec, 'baseline'),
        );
        const summaryOf = async () =>
            (await runBed(baseline)).runs.map((run) => [
                run.runId,
                run.observation,
                run.verdicts.map((scored) => [scored.entryId, scored.verdict.kind, scored.sweep]),
            ]);
        expect(await summaryOf()).toEqual(await summaryOf());
    });
});
