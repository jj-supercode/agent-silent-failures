import type { CommandOutput, ProgressUpdate } from '../../command-output/index.ts';
import type { RunSpec } from '../model.ts';
import { runBed, type BedOutcome, type SpecOutcome } from '../runner/run-bed.ts';

/** A finished run as a progress update; a failed one carries its reason, so it is printed the moment it happens. */
const runProgressUpdate = (outcome: SpecOutcome): ProgressUpdate => {
    switch (outcome.kind) {
        case 'scored':
            return { kind: 'done', spendUsd: null };
        case 'failed':
            return {
                kind: 'failed',
                failure: { subject: outcome.failure.runId, what: 'run failed', why: outcome.failure.reason, fix: null },
                spendUsd: null,
            };
        default:
            return outcome satisfies never;
    }
};

/** Runs the bed with one progress update per finished run; the progress line is cleared before this returns. */
export const runBedWithProgress = async (specs: readonly RunSpec[], output: CommandOutput): Promise<BedOutcome> => {
    using tracker = output.trackProgress(specs.length, 'runs');
    return await runBed(specs, (outcome) => tracker.update(runProgressUpdate(outcome)));
};
