import { describe, expect, test } from 'vitest';

import { loadQuestions, parseQuestionLines } from './load-questions.ts';
import { sampleQuestion } from './testing.ts';

const committedQuestionCount = 40;
const committedPerType = 20;

describe('parseQuestionLines', () => {
    test('decodes one question per non-empty line', () => {
        const questions = [sampleQuestion('q1', ['A', 'B']), sampleQuestion('q2', ['C', 'D'])];
        const text = questions.map((question) => JSON.stringify(question)).join('\n\n') + '\n';
        expect(parseQuestionLines('sample.jsonl', text)).toEqual({ kind: 'loaded', questions });
    });

    test('reports the first line that is not JSON', () => {
        const text = [JSON.stringify(sampleQuestion('q1', ['A'])), '{not json'].join('\n');
        expect(parseQuestionLines('sample.jsonl', text)).toMatchObject({
            kind: 'failed',
            failure: { kind: 'invalid', path: 'sample.jsonl', lineNumber: 2 },
        });
    });

    test('reports the physical line number when blank lines come before the bad line', () => {
        const text = [
            JSON.stringify(sampleQuestion('q1', ['A'])),
            '',
            JSON.stringify(sampleQuestion('q2', ['B'])),
            '{',
        ].join('\n');
        expect(parseQuestionLines('sample.jsonl', text)).toMatchObject({ failure: { lineNumber: 4 } });
    });

    test('reports a line that breaks the schema', () => {
        const text = JSON.stringify({ ...sampleQuestion('q1', ['A']), type: 'multiple-choice' });
        expect(parseQuestionLines('sample.jsonl', text)).toMatchObject({
            kind: 'failed',
            failure: { kind: 'invalid', lineNumber: 1 },
        });
    });
});

describe('loadQuestions', () => {
    test('reports a missing file as unreadable', async () => {
        expect(await loadQuestions('/nonexistent/questions.jsonl')).toMatchObject({
            kind: 'failed',
            failure: { kind: 'unreadable' },
        });
    });

    test('the committed subsample holds 20 bridge and 20 comparison questions with no shared gold paragraph', async () => {
        const loaded = await loadQuestions();
        const questions = loaded.kind === 'loaded' ? loaded.questions : [];
        const goldTitles = questions.flatMap((question) => [
            ...new Set(question.supportingFacts.map((fact) => fact.sourceId)),
        ]);
        expect(questions).toHaveLength(committedQuestionCount);
        expect(questions.filter((question) => question.type === 'bridge')).toHaveLength(committedPerType);
        expect(new Set(goldTitles).size).toBe(goldTitles.length);
    });

    test('every gold title of the committed subsample has its paragraph in the question context', async () => {
        const loaded = await loadQuestions();
        const questions = loaded.kind === 'loaded' ? loaded.questions : [];
        const missing = questions.flatMap((question) =>
            question.supportingFacts.filter(
                (fact) => !question.paragraphs.some((paragraph) => paragraph.sourceId === fact.sourceId),
            ),
        );
        expect(missing).toEqual([]);
    });
});
