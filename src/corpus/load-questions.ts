import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { corpusQuestionSchema, type CorpusLoadResult } from './model.ts';

export const defaultQuestionsPath = new URL('../../data/hotpotqa/questions.jsonl', import.meta.url);

const questionLineSchema = z
    .string()
    .transform((line, context) => {
        try {
            const value: unknown = JSON.parse(line);
            return value;
        } catch (error) {
            context.addIssue({ code: 'custom', message: `not JSON: ${String(error)}` });
            return z.NEVER;
        }
    })
    .pipe(corpusQuestionSchema);

export const parseQuestionLines = (path: string, text: string): CorpusLoadResult => {
    // Numbered before blank lines are dropped, so a reported line number is the physical line in the file.
    const parsedLines = text
        .split('\n')
        .map((line, index) => ({ line, lineNumber: index + 1 }))
        .filter(({ line }) => line.trim() !== '')
        .map(({ line, lineNumber }) => ({ lineNumber, parsed: questionLineSchema.safeParse(line) }));
    const firstInvalid = parsedLines.find(({ parsed }) => !parsed.success);
    if (firstInvalid?.parsed.error !== undefined) {
        return {
            kind: 'failed',
            failure: {
                kind: 'invalid',
                path,
                lineNumber: firstInvalid.lineNumber,
                issues: z.prettifyError(firstInvalid.parsed.error),
            },
        };
    }
    return { kind: 'loaded', questions: parsedLines.flatMap(({ parsed }) => (parsed.success ? [parsed.data] : [])) };
};

export const loadQuestions = async (path: URL | string = defaultQuestionsPath): Promise<CorpusLoadResult> => {
    const displayPath = path.toString();
    try {
        return parseQuestionLines(displayPath, await readFile(path, 'utf8'));
    } catch (error) {
        return { kind: 'failed', failure: { kind: 'unreadable', path: displayPath, reason: String(error) } };
    }
};
