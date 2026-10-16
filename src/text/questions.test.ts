import { describe, expect, test } from 'vitest';

import { withoutQuestionMark } from './questions.ts';

describe('withoutQuestionMark', () => {
    test('drops a closing question mark and the space around it', () => {
        expect(withoutQuestionMark('Who wrote it ? ')).toBe('Who wrote it');
    });

    test('keeps a question mark inside the text', () => {
        expect(withoutQuestionMark('Is "Why?" a film?')).toBe('Is "Why?" a film');
    });
});
