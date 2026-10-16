import { describe, expect, test } from 'vitest';

import { duplicateCosineTolerance } from '../../ingestion/index.ts';
import { cosineSimilarity, isSameEmbedding } from './vector-similarity.ts';

describe('cosineSimilarity', () => {
    test('is 1 for parallel vectors and 0 for orthogonal ones', () => {
        expect(cosineSimilarity([0.6, 0.8], [1.2, 1.6])).toBeCloseTo(1);
        expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    });
});

describe('isSameEmbedding', () => {
    test('a vector and its scaled copy are the same embedding', () => {
        expect(isSameEmbedding([0.6, 0.8, 0], [1.2, 1.6, 0])).toBe(true);
    });

    test('a difference above float noise is a different embedding', () => {
        const nudged = [0.6, 0.8, Math.sqrt(4 * duplicateCosineTolerance)];
        expect(isSameEmbedding([0.6, 0.8, 0], nudged)).toBe(false);
    });
});
