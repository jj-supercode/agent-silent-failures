import {
    countedText,
    displayPath,
    durationText,
    textTable,
    type CommandFailure,
    type CommandHeader,
    type CommandReport,
    type ProgressUpdate,
    type TextStyle,
} from '../../src/command-output/index.ts';
import { reproReportPath } from '../shared/report-outcome.ts';
import { reprosExitCodes } from './repros-command.ts';
import { reproductionVerdict, type ReproductionRun, type ReproductionVerdict } from './run-reproduction.ts';

// What `pnpm repros` says about its runs: failures with evidence, the result table and the closing report.

/** The last lines a broken repro printed: enough to see the error without its whole log. */
const brokenOutputLines = 12;

const tail = (output: string, lines: number): string => output.trimEnd().split('\n').slice(-lines).join('\n');

/** A repro that did not reproduce, or broke, as a failure with its evidence; `null` when it reproduces. */
export const failureOf = (run: ReproductionRun): CommandFailure | null => {
    const verdict = reproductionVerdict(run.exitCode);
    switch (verdict) {
        case 'reproduces':
            return null;
        case 'not-reproduced':
            return {
                subject: run.reproductionId,
                what: 'behaviour no longer reproduces',
                why: tail(run.output, 1),
                fix: 'check the pinned version upstream; update the repro and its README row if the behaviour changed',
            };
        case 'broken':
            return {
                subject: run.reproductionId,
                what: `repro broke (exit ${run.exitCode})`,
                why: tail(run.output, brokenOutputLines),
                fix: `run node repros/${run.reproductionId}/repro.ts to see its whole output`,
            };
        default:
            return verdict satisfies never;
    }
};

export const progressOf = (run: ReproductionRun): ProgressUpdate => {
    const failure = failureOf(run);
    return failure === null ? { kind: 'done', spendUsd: null } : { kind: 'failed', failure, spendUsd: null };
};

export const resultTable = (runs: readonly ReproductionRun[], style: TextStyle): readonly string[] =>
    textTable(
        [
            { header: 'repro', align: 'left' },
            { header: 'result', align: 'left' },
            { header: 'time', align: 'right' },
        ],
        runs.map((run) => {
            const verdict = reproductionVerdict(run.exitCode);
            return [
                run.reproductionId,
                verdict === 'reproduces' ? style.success(verdict) : style.failure(verdict),
                durationText(run.milliseconds),
            ];
        }),
        style.label,
    );

const countWhere = (runs: readonly ReproductionRun[], verdict: ReproductionVerdict): number =>
    runs.filter((run) => reproductionVerdict(run.exitCode) === verdict).length;

export const reprosHeader = (repros: number): CommandHeader => ({
    title: 'agent-silent-failures repros',
    description: `Runs ${countedText(repros, 'repro')}, each in its own Node process, offline.`,
    measures: 'whether each recorded Mastra behaviour still holds on the pinned versions',
    total: repros,
    unit: 'repros',
    facts: [],
});

/** Counts by verdict, the reports written (a broken repro writes none) and the exit code. */
export const reprosReport = (runs: readonly ReproductionRun[], repositoryRoot: string): CommandReport => {
    const reproduces = countWhere(runs, 'reproduces');
    const notReproduced = countWhere(runs, 'not-reproduced');
    const broken = countWhere(runs, 'broken');
    return {
        exit: reproduces === runs.length ? reprosExitCodes.allReproduce : reprosExitCodes.changed,
        headline: `${reproduces}/${runs.length} repros reproduce, ${notReproduced} no longer reproduce, ${broken} broke`,
        counts: { repros: runs.length, reproduces, notReproduced, broken },
        rates: [],
        spendUsd: null,
        outputs: runs
            .filter((run) => reproductionVerdict(run.exitCode) !== 'broken')
            .map((run) => displayPath(repositoryRoot, reproReportPath(run.reproductionId))),
        next: [{ command: 'pnpm docs:tables', purpose: 'render the findings table from the repro reports' }],
    };
};
