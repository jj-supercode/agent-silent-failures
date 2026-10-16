import type { ReproReport } from './model.ts';
import { markdownRows } from './markdown-rows.ts';

const outcomeText = (report: ReproReport): string => {
    switch (report.outcome) {
        case 'reproduces':
            return 'reproduces';
        case 'not-reproduced':
            return 'no longer reproduces';
        default:
            return report.outcome satisfies never;
    }
};

/** The last `pnpm repros` result of each script, with the platform and date it ran on. */
export const reprosTable = (reports: readonly ReproReport[]): string =>
    markdownRows(
        ['Repro', 'Last result', 'What it measured', 'Ran on'],
        reports.map((report) => [
            `[\`${report.reproductionId}\`](../repros/${report.reproductionId}/repro.ts)`,
            outcomeText(report),
            report.summary,
            `${report.platform}, ${report.generatedOn}`,
        ]),
    );
