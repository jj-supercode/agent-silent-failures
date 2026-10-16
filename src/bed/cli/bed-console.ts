import { countedText, type CommandHeader, type NextStep } from '../../command-output/index.ts';
import { offlineStackFact } from '../console/scored-runs-report.ts';
import type { BedOptions } from './bed-options.ts';

const scopeText = (options: BedOptions): string =>
    `${options.split === 'all' ? 'dev and held-out splits' : `${options.split} split`}, ` +
    `${options.entryId === null ? 'every catalog entry' : `entry ${options.entryId}`}`;

export const bedHeader = (options: BedOptions, plannedRuns: number): CommandHeader => ({
    title: 'agent-silent-failures bed',
    description: `${countedText(plannedRuns, 'planned run')}: ${scopeText(options)}.`,
    measures: 'per detector, catches on its own faulted runs and false alarms on clean runs, Wilson 95% intervals',
    total: plannedRuns,
    unit: 'runs',
    facts: [
        ['stack', offlineStackFact],
        [
            'writes',
            options.writeResults
                ? 'results/offline/ when every run is scored'
                : 'nothing (--write-results writes results/offline/)',
        ],
    ],
});

export const bedNextSteps = (options: BedOptions, wroteResults: boolean): readonly NextStep[] => [
    ...(wroteResults
        ? [{ command: 'pnpm docs:tables', purpose: 'render the README and entry pages from the new results' }]
        : []),
    ...(options.details ? [] : [{ command: 'pnpm bed --details', purpose: 'every variation, fault and headline row' }]),
];
