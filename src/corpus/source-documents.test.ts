import { describe, expect, test } from 'vitest';

import { paragraphSchema } from './model.ts';
import { paragraphText, toQuestionDocuments, toSourceDocuments } from './source-documents.ts';
import { sampleQuestion } from './testing.ts';

describe('paragraphText', () => {
    test('joins sentences without a separator, since each carries its own leading space', () => {
        expect(paragraphText(paragraphSchema.parse({ sourceId: 'A', sentences: ['One.', ' Two.'] }))).toBe('One. Two.');
    });
});

describe('toSourceDocuments', () => {
    test('emits one document per distinct source, in first-seen order', () => {
        const documents = toSourceDocuments([sampleQuestion('q1', ['A', 'B']), sampleQuestion('q2', ['B', 'C'])]);
        expect(documents.map((document) => document.sourceId)).toEqual(['A', 'B', 'C']);
    });

    test('keeps the paragraph text of the first occurrence', () => {
        const [document] = toSourceDocuments([sampleQuestion('q1', ['A'])]);
        expect(document?.text).toBe('A is a place. It has a river.');
    });
});

describe('toQuestionDocuments', () => {
    test('emits one document per question attributed to question:<id>, each paragraph headed by its title', () => {
        expect(toQuestionDocuments([sampleQuestion('q1', ['A', 'B'])])).toEqual([
            { sourceId: 'question:q1', text: 'A\nA is a place. It has a river.\n\nB\nB is a place. It has a river.' },
        ]);
    });
});
