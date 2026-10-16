import {
    countedText,
    type CommandFailure,
    type CommandHeader,
    type CommandReport,
} from '../../src/command-output/index.ts';
import { docsTablesExitCodes } from './docs-tables-command.ts';

// What `pnpm docs:tables` says about its pages: one failure per stale page, and the closing report.

/** What happened to one generated page. */
export type PageOutcome =
    | { readonly kind: 'current'; readonly path: string }
    | { readonly kind: 'updated'; readonly path: string }
    | { readonly kind: 'stale'; readonly path: string }
    | { readonly kind: 'missing-markers'; readonly path: string; readonly name: string };

export const docsTablesHeader = (pages: number, check: boolean): CommandHeader => ({
    title: 'agent-silent-failures docs:tables',
    description: check
        ? `Checks the generated blocks of ${countedText(pages, 'page')} against the committed results; writes nothing.`
        : `Rewrites the generated blocks of ${countedText(pages, 'page')} from the committed results.`,
    measures: null,
    total: pages,
    unit: 'pages',
    facts: [],
});

/** A page that is out of date or lost its markers, as a failure with its fix; `null` for a current one. */
export const pageFailure = (outcome: PageOutcome): CommandFailure | null => {
    switch (outcome.kind) {
        case 'current':
        case 'updated':
            return null;
        case 'stale':
            return {
                subject: outcome.path,
                what: 'page out of date',
                why: 'its generated blocks differ from what the committed results render',
                fix: 'run pnpm docs:tables and commit the page',
            };
        case 'missing-markers':
            return {
                subject: outcome.path,
                what: 'block markers missing',
                why: `no "${outcome.name}" start and end markers`,
                fix: `restore <!-- docs-tables:${outcome.name}:start --> and its end marker`,
            };
        default:
            return outcome satisfies never;
    }
};

/** Counts by outcome, the pages rewritten and the exit code. */
export const docsTablesReport = (outcomes: readonly PageOutcome[]): CommandReport => {
    const updated = outcomes.filter((outcome) => outcome.kind === 'updated').map((outcome) => outcome.path);
    const failed = countOf(outcomes, 'stale') + countOf(outcomes, 'missing-markers');
    return {
        exit: failed === 0 ? docsTablesExitCodes.upToDate : docsTablesExitCodes.stale,
        headline:
            `${countedText(outcomes.length, 'page')}: ${countOf(outcomes, 'current')} up to date, ${updated.length} updated, ` +
            `${failed} out of date`,
        counts: {
            pages: outcomes.length,
            upToDate: countOf(outcomes, 'current'),
            updated: updated.length,
            stale: countOf(outcomes, 'stale'),
            missingMarkers: countOf(outcomes, 'missing-markers'),
        },
        rates: [],
        spendUsd: null,
        outputs: updated,
        next: failed === 0 ? [] : [{ command: 'pnpm docs:tables', purpose: 'rewrite the out-of-date pages' }],
    };
};

const countOf = (outcomes: readonly PageOutcome[], kind: PageOutcome['kind']): number =>
    outcomes.filter((outcome) => outcome.kind === kind).length;
