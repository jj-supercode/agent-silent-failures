import { describe, expect, test } from 'vitest';

import { defineIngestionEntry, entryIdSchema } from '../entries/index.ts';
import { unitIntervalSchema } from '../trace/index.ts';
import {
    entryDocMismatches,
    entryDocSections,
    entryDocShapeProblems,
    parseEntryDoc,
    resultsBlockMarkers,
} from './entry-doc.ts';

const threshold = { name: 'MAX_GAPS', value: 0, basis: 'any gap is a failure', calibratedOn: 'invariant' } as const;

const sampleEntry = defineIngestionEntry({
    id: entryIdSchema.parse('sample-entry'),
    title: 'Sample entry',
    summary: 'A sample.',
    family: 'rag-ingest',
    status: 'stable',
    thresholds: { MAX_GAPS: threshold },
    detect: () => ({ kind: 'fired', severity: unitIntervalSchema.parse(1), evidence: { spanIds: [], summary: 'x' } }),
});

const frontmatter = [
    'id: sample-entry',
    'title: Sample entry',
    'family: rag-ingest',
    'scope: ingestion',
    'status: stable',
    'requires: [rag_ingestion.output]',
    'thresholds:',
    `    - { name: MAX_GAPS, value: 0, basis: any gap is a failure, calibratedOn: invariant }`,
    'references:',
    '    - { title: A report, url: "https://example.org/report", date: 2026-10-14 }',
].join('\n');

const body = (sections: readonly string[]) =>
    sections.map((section) => `## ${section}\n\nText.\n`).join('\n') +
    `\n${resultsBlockMarkers.start}\n${resultsBlockMarkers.end}\n`;

const page = (yaml: string, sections: readonly string[] = entryDocSections) =>
    `---\n${yaml}\n---\n\n# Title\n\n${body(sections)}`;

const parsedDoc = (markdown: string) => {
    const parsed = parseEntryDoc(markdown);
    if (parsed.kind === 'invalid') {
        throw new Error(parsed.reason);
    }
    return parsed.doc;
};

describe('entry pages', () => {
    test('a complete page parses, has no shape problems and matches its entry', () => {
        const doc = parsedDoc(page(frontmatter));
        expect([...entryDocShapeProblems(doc), ...entryDocMismatches(doc, sampleEntry)]).toEqual([]);
    });

    test('a page without frontmatter is invalid', () => {
        expect(parseEntryDoc(body(entryDocSections)).kind).toBe('invalid');
    });

    test.each([
        ['an unknown family', frontmatter.replace('family: rag-ingest', 'family: retrieval')],
        ['an unknown key', `${frontmatter}\npriority: P0`],
        ['a reference without a URL', frontmatter.replace('url: "https://example.org/report", ', '')],
        ['broken YAML', `${frontmatter}\n  : [`],
    ])('frontmatter with %s is invalid', (_label, yaml) => {
        expect(parseEntryDoc(page(yaml)).kind).toBe('invalid');
    });

    test('sections out of order are a shape problem', () => {
        const swapped = [
            ...entryDocSections.slice(1, 2),
            ...entryDocSections.slice(0, 1),
            ...entryDocSections.slice(2),
        ];
        expect(entryDocShapeProblems(parsedDoc(page(frontmatter, swapped)))).toHaveLength(1);
    });

    test('a page whose thresholds disagree with the entry is a mismatch', () => {
        const doc = parsedDoc(page(frontmatter.replace('value: 0', 'value: 1')));
        expect(entryDocMismatches(doc, sampleEntry)).toHaveLength(1);
    });

    test('a page documenting another status than the entry is a mismatch', () => {
        const doc = parsedDoc(page(frontmatter.replace('status: stable', 'status: experimental')));
        expect(entryDocMismatches(doc, sampleEntry)).toEqual([
            'status: the page says experimental, the entry defines stable',
        ]);
    });
});
