import { sourceIdSchema, type SourceId } from '../../trace/index.ts';

export type ResearchPromptTemplate = (subject: SourceId, question: string) => string;

/**
 * How the clean supervisor phrases a research request. The last template repeats the whole question, so two
 * requests for different subjects share most of their words: the hard negative for prompt similarity.
 */
export const researchPromptTemplates: readonly [ResearchPromptTemplate, ...ResearchPromptTemplate[]] = [
    (subject) => `Find what the corpus says about ${subject}.`,
    (subject) => `Research ${subject} and report the key facts.`,
    (subject, question) => `Look up ${subject} for this question: ${question}`,
];

/** Same task, different wording: what a supervisor re-sending a delegation it already made tends to produce. */
export const reworded = (prompt: string, attempt: number): string =>
    attempt % 2 === 0 ? prompt : `Please ${prompt.charAt(0).toLowerCase()}${prompt.slice(1)}`;

const checkPromptPattern = /^Read the source "([^"]+)" and confirm its key facts\.$/;

export const checkPrompt = (subject: SourceId): string => `Read the source "${subject}" and confirm its key facts.`;

/** The subject of a check request, or `null` when the prompt is not one. */
export const checkedSubject = (prompt: string): SourceId | null =>
    sourceIdSchema.safeParse(checkPromptPattern.exec(prompt.trim())?.[1]).data ?? null;

/**
 * The subject a prompt is about: the one it names first (a prompt may quote a question naming both); at the same
 * position the longer title wins, so "Ed Wood (film)" is not read as "Ed Wood".
 */
export const promptSubject = (prompt: string, subjects: readonly SourceId[]): SourceId | null =>
    subjects
        .map((subject) => ({ subject, position: prompt.indexOf(subject) }))
        .filter(({ position }) => position >= 0)
        .toSorted((left, right) => left.position - right.position || right.subject.length - left.subject.length)[0]
        ?.subject ?? null;
