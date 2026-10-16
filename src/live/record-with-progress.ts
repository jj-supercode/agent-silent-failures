import type { CommandOutput, ProgressUpdate } from '../command-output/index.ts';
import type { SpendState } from './budget/model.ts';
import type { LiveOptions } from './live-options.ts';
import type { RunProgress } from './record-session.ts';
import { recordToFixtures, type RecordedSession, type RecordToFixturesInput } from './record-to-fixtures.ts';
import { formatResilienceNotice } from './resilience/notices.ts';
import { sessionResilience } from './resilience/session-resilience.ts';

/** A dry run bills nothing, so its progress shows no spend; its estimate is printed once, at the end. */
const billedSpend = (options: LiveOptions, spend: SpendState): number | null =>
    options.mode === 'live' ? spend.spent : null;

const runProgressUpdate = (progress: RunProgress, spendUsd: number | null): ProgressUpdate =>
    progress.failure === null
        ? { kind: 'done', spendUsd }
        : {
              kind: 'failed',
              failure: { subject: progress.spec.runId, what: 'run failed', why: progress.failure, fix: null },
              spendUsd,
          };

/** Records the session with one progress update per run (spend included); network notices print as warnings. */
export const recordWithProgress = async (
    options: LiveOptions,
    output: CommandOutput,
    input: Omit<RecordToFixturesInput, 'onRun' | 'resilience'>,
): Promise<RecordedSession> => {
    using tracker = output.trackProgress(input.runs.length, 'runs');
    return await recordToFixtures({
        ...input,
        resilience: sessionResilience((notice) => output.warning(formatResilienceNotice(notice).trim(), [])),
        onRun: (progress, spend) => tracker.update(runProgressUpdate(progress, billedSpend(options, spend))),
    });
};
