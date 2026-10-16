import { scoreRun, type RunId, type RunLabels, type RunSource, type ScoredRun } from '../bed/index.ts';
import type { CorpusQuestion, QuestionId } from '../corpus/index.ts';
import type { FixtureSet, RecordedRun, RecordingMode } from '../record/index.ts';

/** A dry run replays the scripted policies, so its numbers are scripted; a live run's are recorded. */
export const sourceOf = (mode: RecordingMode): RunSource => {
    switch (mode) {
        case 'live':
            return 'recorded';
        case 'dry-run':
            return 'scripted';
        default:
            return mode satisfies never;
    }
};

export type ReplayProblem = { readonly runId: RunId; readonly reason: string };

export type JudgedRun = { readonly runId: RunId; readonly correct: boolean };

export type ReplayResult = {
    readonly source: RunSource;
    readonly scored: readonly ScoredRun[];
    /** Runs that failed while recording (provider error, budget refusal): reported, never scored as clear. */
    readonly failedWhileRecording: readonly ReplayProblem[];
    /** Recorded runs whose trace could not be scored (unknown question, a trace that is not a run). */
    readonly unscorable: readonly ReplayProblem[];
    readonly judged: readonly JudgedRun[];
};

/** One recorded run, scored offline: what replay and every other reader of a fixture set build their numbers from. */
export type ReplayedRun =
    | { readonly kind: 'scored'; readonly run: ScoredRun; readonly judged: JudgedRun | null }
    | { readonly kind: 'failed-while-recording'; readonly problem: ReplayProblem }
    | { readonly kind: 'unscorable'; readonly problem: ReplayProblem };

const toRunLabels = (recorded: RecordedRun['labels'], question: CorpusQuestion): RunLabels => ({
    runId: recorded.runId,
    split: recorded.split,
    family: recorded.family,
    question,
    replicate: recorded.replicate,
    seed: recorded.seed,
    harness: recorded.harness,
    condition: recorded.condition,
    observation: recorded.observation,
    modelSource: recorded.modelSource,
});

/**
 * Scores one recorded run with the bed's own scoring, offline. A run that failed while recording is reported, never
 * scored as clear.
 */
export const replayRecordedRun = (
    recorded: RecordedRun,
    questions: ReadonlyMap<QuestionId, CorpusQuestion>,
    source: RunSource,
): ReplayedRun => {
    const { labels, outcome } = recorded;
    if (outcome.kind === 'failed') {
        return { kind: 'failed-while-recording', problem: { runId: labels.runId, reason: outcome.reason } };
    }
    const question = questions.get(labels.questionId);
    if (question === undefined) {
        return {
            kind: 'unscorable',
            problem: { runId: labels.runId, reason: `question ${labels.questionId} is not in the corpus` },
        };
    }
    // A recording cannot observe the vector store, so a fault checked on the ingestion records `unknown`.
    const scored = scoreRun(toRunLabels(labels, question), outcome.trace.spans, source, null);
    if (scored.kind === 'unscorable') {
        return { kind: 'unscorable', problem: { runId: labels.runId, reason: scored.reason } };
    }
    const judged =
        outcome.judgement?.kind === 'judged' ? { runId: labels.runId, correct: outcome.judgement.correct } : null;
    return { kind: 'scored', run: scored.run, judged };
};

/** Scores every recorded run with the bed's own scoring, offline. Pure: no model, no embedder, no storage. */
export const replayFixtures = (fixtures: FixtureSet, corpus: readonly CorpusQuestion[]): ReplayResult => {
    const source = sourceOf(fixtures.manifest.mode);
    const questions = new Map(corpus.map((question) => [question.id, question]));
    const replayed = fixtures.runs.map((recorded) => replayRecordedRun(recorded, questions, source));
    return {
        source,
        scored: replayed.flatMap((run) => (run.kind === 'scored' ? [run.run] : [])),
        failedWhileRecording: replayed.flatMap((run) => (run.kind === 'failed-while-recording' ? [run.problem] : [])),
        unscorable: replayed.flatMap((run) => (run.kind === 'unscorable' ? [run.problem] : [])),
        judged: replayed.flatMap((run) => (run.kind === 'scored' && run.judged !== null ? [run.judged] : [])),
    };
};
