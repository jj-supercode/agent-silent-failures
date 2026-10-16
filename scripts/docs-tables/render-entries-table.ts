import { countText } from '../../src/command-output/index.ts';
import type { EntryId } from '../../src/entries/index.ts';
import type { SplitReport } from './model.ts';
import { catchText, rateCell } from './number-text.ts';
import { markdownRows } from './markdown-rows.ts';

/** What the table needs from a catalog entry; the generator passes the registered entries. */
export type EntrySummary = {
    readonly id: EntryId;
    readonly title: string;
    readonly kind: 'run' | 'ingestion';
    readonly status: 'stable' | 'experimental';
    readonly summary: string;
};

const entryLink = (entry: EntrySummary): string => `[${entry.id}](src/entries/${entry.id}/README.md)`;

/**
 * One row per registered entry with its held-out catch and false-alarm rates. An entry the split never scored says
 * so rather than showing zeros.
 */
export const entriesTable = (entries: readonly EntrySummary[], heldOut: SplitReport, provenance: string): string => {
    const rows = entries.map((entry) => {
        const detector = heldOut.detectors.find((candidate) => candidate.entryId === entry.id);
        return [
            entryLink(entry),
            entry.kind,
            entry.status,
            entry.summary,
            detector === undefined ? 'not scored' : catchText(detector),
            detector === undefined ? 'not scored' : rateCell(detector.falseAlarms),
        ];
    });
    return [
        markdownRows(
            ['Entry', 'Kind', 'Status', 'What it catches', 'Held-out catch rate', 'Held-out false alarms'],
            rows,
        ),
        '',
        `Held-out split: ${countText(heldOut.agentRuns)} agent runs and ${countText(heldOut.ingestions)} ingestions. ` +
            `Rates with Wilson 95% intervals. Source: ${provenance}.`,
    ].join('\n');
};
