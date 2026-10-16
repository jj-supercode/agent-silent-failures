import { parseDocument } from 'yaml';
import { z } from 'zod';

import { entryIdSchema, type Entry } from '../entries/index.ts';

/** The headings every entry page carries, in this order; the results block lives under the last one. */
export const entryDocSections = [
    'Symptom',
    'Why no error is raised',
    'Trace signature',
    'Detector',
    'Thresholds and why',
    'Reproduction',
    'Known false alarms',
    'Known misses',
    'Credits',
    'Results',
] as const satisfies readonly string[];

/**
 * The generated `results` block: `pnpm docs:tables` renders it from `results/offline/report.json` and `--check` fails
 * when it differs, so the text between the markers is never edited by hand.
 */
export const resultsBlockName = 'results';
export const resultsBlockMarkers = {
    start: `<!-- docs-tables:${resultsBlockName}:start -->`,
    end: `<!-- docs-tables:${resultsBlockName}:end -->`,
} as const;

const documentedThresholdSchema = z.object({
    name: z.string().min(1),
    value: z.number(),
    basis: z.string().min(1),
    calibratedOn: z.enum(['prior', 'dev', 'invariant']),
});

const referenceSchema = z.object({
    title: z.string().min(1),
    url: z.url(),
    date: z.iso.date(),
});

export const entryDocFrontmatterSchema = z.strictObject({
    id: entryIdSchema,
    title: z.string().min(1),
    family: z.enum(['rag', 'rag-ingest', 'tool-use', 'multi-agent']),
    scope: z.enum(['run', 'ingestion']),
    status: z.enum(['stable', 'experimental']),
    /** The trace fields the detector reads, e.g. `tool_call.output.hits[].score`. */
    requires: z.array(z.string().min(1)).min(1),
    thresholds: z.array(documentedThresholdSchema),
    references: z.array(referenceSchema).min(1),
});
export type EntryDocFrontmatter = z.infer<typeof entryDocFrontmatterSchema>;

export type EntryDoc = {
    readonly frontmatter: EntryDocFrontmatter;
    /** Second-level headings in document order. */
    readonly sectionHeadings: readonly string[];
    readonly body: string;
};

export type EntryDocParseResult =
    { readonly kind: 'parsed'; readonly doc: EntryDoc } | { readonly kind: 'invalid'; readonly reason: string };

const frontmatterPattern = /^---\n(?<frontmatter>[\s\S]*?)\n---\n(?<body>[\s\S]*)$/;

const sectionHeadingsOf = (body: string): readonly string[] =>
    body.split('\n').flatMap((line) => (line.startsWith('## ') ? [line.slice('## '.length).trim()] : []));

/** `parseDocument` reports syntax errors as data instead of throwing. */
const parseFrontmatterYaml = (source: string): { readonly parsed: unknown } | { readonly error: string } => {
    const document = parseDocument(source);
    const [firstError] = document.errors;
    return firstError === undefined ? { parsed: document.toJS() } : { error: firstError.message };
};

export const parseEntryDoc = (markdown: string): EntryDocParseResult => {
    const match = frontmatterPattern.exec(markdown);
    const frontmatterSource = match?.groups?.['frontmatter'];
    const body = match?.groups?.['body'];
    if (frontmatterSource === undefined || body === undefined) {
        return { kind: 'invalid', reason: 'the page must start with a --- delimited frontmatter block' };
    }
    const yaml = parseFrontmatterYaml(frontmatterSource);
    if ('error' in yaml) {
        return { kind: 'invalid', reason: `frontmatter is not valid YAML: ${yaml.error}` };
    }
    const frontmatter = entryDocFrontmatterSchema.safeParse(yaml.parsed);
    return frontmatter.success
        ? { kind: 'parsed', doc: { frontmatter: frontmatter.data, sectionHeadings: sectionHeadingsOf(body), body } }
        : { kind: 'invalid', reason: z.prettifyError(frontmatter.error) };
};

const sectionProblems = (doc: EntryDoc): readonly string[] => {
    const expected = entryDocSections.join(' | ');
    const actual = doc.sectionHeadings.join(' | ');
    return actual === expected ? [] : [`sections must be exactly "${expected}", found "${actual}"`];
};

const resultsBlockProblems = (doc: EntryDoc): readonly string[] => {
    const start = doc.body.indexOf(resultsBlockMarkers.start);
    const end = doc.body.indexOf(resultsBlockMarkers.end);
    const resultsHeading = doc.body.indexOf('## Results');
    return start > resultsHeading && end > start ? [] : ['the Results section must hold the results block markers'];
};

/** Problems that make a page unfit for the catalog, independent of the entry it documents. */
export const entryDocShapeProblems = (doc: EntryDoc): readonly string[] => [
    ...sectionProblems(doc),
    ...resultsBlockProblems(doc),
];

const describedFieldProblems = (frontmatter: EntryDocFrontmatter, entry: Entry): readonly string[] =>
    (
        [
            ['id', frontmatter.id, entry.id],
            ['title', frontmatter.title, entry.title],
            ['family', frontmatter.family, entry.family],
            ['scope', frontmatter.scope, entry.kind],
            ['status', frontmatter.status, entry.status],
        ] as const
    ).flatMap(([field, documented, defined]) =>
        documented === defined ? [] : [`${field}: the page says ${documented}, the entry defines ${defined}`],
    );

const thresholdProblems = (frontmatter: EntryDocFrontmatter, entry: Entry): readonly string[] => {
    const documentedNames = frontmatter.thresholds.map((threshold) => threshold.name).toSorted();
    const definedNames = Object.keys(entry.thresholds).toSorted();
    const nameProblems =
        documentedNames.join() === definedNames.join()
            ? []
            : [
                  `thresholds: the page lists [${documentedNames.join(', ')}], the entry defines [${definedNames.join(', ')}]`,
              ];
    const valueProblems = frontmatter.thresholds.flatMap((documented) => {
        const defined = entry.thresholds[documented.name];
        return defined === undefined ||
            (defined.value === documented.value &&
                defined.basis === documented.basis &&
                defined.calibratedOn === documented.calibratedOn)
            ? []
            : [`threshold ${documented.name}: the page and the entry disagree on value, basis or calibratedOn`];
    });
    return [...nameProblems, ...valueProblems];
};

/** Problems where the page and the registered entry disagree; the entry definition is the source of truth. */
export const entryDocMismatches = (doc: EntryDoc, entry: Entry): readonly string[] => [
    ...describedFieldProblems(doc.frontmatter, entry),
    ...thresholdProblems(doc.frontmatter, entry),
];
