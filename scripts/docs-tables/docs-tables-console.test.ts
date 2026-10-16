import { describe, expect, test } from 'vitest';

import { docsTablesReport, pageFailure, type PageOutcome } from './docs-tables-console.ts';

const current: PageOutcome = { kind: 'current', path: 'README.md' };
const updated: PageOutcome = { kind: 'updated', path: 'docs/findings-in-mastra.md' };
const stale: PageOutcome = { kind: 'stale', path: 'src/entries/tool-loop/README.md' };
const unmarked: PageOutcome = { kind: 'missing-markers', path: 'README.md', name: 'headline' };

describe('docs:tables console', () => {
    test('current and rewritten pages pass; the rewritten ones are the outputs', () => {
        const report = docsTablesReport([current, updated]);
        expect(report.exit.code).toBe(0);
        expect(report.outputs).toEqual(['docs/findings-in-mastra.md']);
        expect(report.counts).toMatchObject({ pages: 2, upToDate: 1, updated: 1, stale: 0 });
    });

    test('a stale page or missing markers fail with exit 1 and a fix naming the command or the markers', () => {
        expect(docsTablesReport([current, stale, unmarked]).exit.code).toBe(1);
        expect(pageFailure(stale)?.fix).toBe('run pnpm docs:tables and commit the page');
        expect(pageFailure(unmarked)?.fix).toContain('<!-- docs-tables:headline:start -->');
        expect(pageFailure(current)).toBeNull();
    });
});
