import { describe, expect, test } from 'vitest';

import { sampleQuestion } from '../corpus/testing.ts';
import { documentsFor } from './documents.ts';

const questions = [sampleQuestion('q1', ['Alpha', 'Beta'])];

describe('documentsFor', () => {
    test('paragraphs: one document per source', () => {
        expect(documentsFor('paragraphs', questions).map((document) => document.sourceId)).toEqual(['Alpha', 'Beta']);
    });

    test('duplicated paragraphs: every text twice under two source ids', () => {
        const documents = documentsFor('duplicated-paragraphs', questions);
        expect(documents.map((document) => document.sourceId)).toEqual([
            'Alpha',
            'Alpha (copy)',
            'Beta',
            'Beta (copy)',
        ]);
        expect(documents[0]?.text).toBe(documents[1]?.text);
    });

    test('question contexts: one long document per question', () => {
        expect(documentsFor('question-contexts', questions).map((document) => document.sourceId)).toEqual([
            'question:q1',
        ]);
    });
});
