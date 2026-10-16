import { describe, expect, test } from 'vitest';

import { sourceIdSchema } from '../../trace/index.ts';
import { checkedSubject, checkPrompt, promptSubject, reworded } from './delegation-prompts.ts';

describe('check prompts', () => {
    test('name their subject so the checker can read it back', () => {
        const subject = sourceIdSchema.parse('Lake Louisvilla, Louisville');
        expect(checkedSubject(checkPrompt(subject))).toBe(subject);
    });

    test('any other prompt names no subject', () => {
        expect(checkedSubject('Find what the corpus says about Ed Wood.')).toBeNull();
    });
});

describe('reworded', () => {
    test('alternates between the prompt and a polite variant of it', () => {
        const prompt = 'Find what the corpus says about Ed Wood.';
        expect([0, 1, 2].map((attempt) => reworded(prompt, attempt))).toEqual([
            prompt,
            'Please find what the corpus says about Ed Wood.',
            prompt,
        ]);
    });
});

const edWood = sourceIdSchema.parse('Ed Wood');
const edWoodFilm = sourceIdSchema.parse('Ed Wood (film)');
const scottDerrickson = sourceIdSchema.parse('Scott Derrickson');

describe('promptSubject', () => {
    test('is the subject the prompt names first, even when it quotes a question naming both', () => {
        const prompt = `Look up ${scottDerrickson} for this question: were ${edWood} and ${scottDerrickson} alike?`;
        expect(promptSubject(prompt, [edWood, scottDerrickson])).toBe(scottDerrickson);
    });

    test('prefers the longer title when one title contains the other', () => {
        expect(promptSubject(`Research ${edWoodFilm} and report the key facts.`, [edWood, edWoodFilm])).toBe(
            edWoodFilm,
        );
    });

    test('is null when the prompt names no subject', () => {
        expect(promptSubject('Research the weather.', [edWood])).toBeNull();
    });
});
