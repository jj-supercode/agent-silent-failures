import { describe, expect, test } from 'vitest';

import { terms } from './terms.ts';

describe('terms', () => {
    test('ignores case, punctuation, word order and plurals', () => {
        expect(terms('Canary birds?')).toEqual(terms('bird canary'));
    });

    test('drops stopwords', () => {
        expect([...terms('What is the population of the county')]).toEqual(['population', 'county']);
    });

    test('keeps short words and double s endings intact', () => {
        expect([...terms('gas class')]).toEqual(['gas', 'class']);
    });

    test('keeps digits as terms', () => {
        expect(terms('page 2')).toEqual(new Set(['page', '2']));
    });
});
