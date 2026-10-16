import { describe, expect, test } from 'vitest';

import {
    advanceProgress,
    crossedCheckpoint,
    redrawDue,
    redrawIntervalMilliseconds,
    remainingMilliseconds,
    startProgress,
} from './progress.ts';

const done = { kind: 'done', spendUsd: null } as const;
const plannedRuns = 25;
const startedAt = 1_000;

const afterRuns = (count: number) =>
    Array.from({ length: count }).reduce(
        (state: ReturnType<typeof startProgress>) => advanceProgress(state, done),
        startProgress(plannedRuns, 'runs', startedAt),
    );

describe('progress', () => {
    test('a checkpoint is crossed once per tenth of the work and at the last unit', () => {
        const crossings = Array.from({ length: plannedRuns }, (_, index) =>
            crossedCheckpoint(afterRuns(index), afterRuns(index + 1)),
        ).filter(Boolean).length;
        expect(crossings).toBe(10);
    });

    test('a failed unit counts as done and as failed, and spend keeps its last known value', () => {
        const failure = { subject: 'run-1', what: 'run failed', why: 'timeout', fix: null };
        const state = advanceProgress(advanceProgress(afterRuns(0), { kind: 'done', spendUsd: 0.5 }), {
            kind: 'failed',
            failure,
            spendUsd: null,
        });
        expect(state).toMatchObject({ done: 2, failed: 1, spendUsd: 0.5 });
    });

    test('the estimate is linear in finished units and absent before the first and after the last', () => {
        const millisecondsPerRun = 200;
        expect(remainingMilliseconds(afterRuns(0), startedAt)).toBeNull();
        expect(remainingMilliseconds(afterRuns(5), startedAt + 5 * millisecondsPerRun)).toBe(20 * millisecondsPerRun);
        expect(remainingMilliseconds(afterRuns(plannedRuns), startedAt)).toBeNull();
    });

    test('a rewritten line waits for the redraw interval, except for the last unit', () => {
        expect(redrawDue(afterRuns(1), redrawIntervalMilliseconds - 1)).toBe(false);
        expect(redrawDue(afterRuns(1), redrawIntervalMilliseconds)).toBe(true);
        expect(redrawDue(afterRuns(plannedRuns), 0)).toBe(true);
    });
});
