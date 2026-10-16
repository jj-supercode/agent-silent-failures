import { describe, expect, test } from 'vitest';

import { loadQuestions } from '../../../corpus/index.ts';
import { salientTokens } from '../../../text/salient-tokens.ts';
import { sourceIdSchema, unitIntervalSchema } from '../../../trace/index.ts';
import { priorClaim } from './prior-claims.ts';

const subject = sourceIdSchema.parse('Ed Wood');
/** One draw inside each third of [0, 1): `pickWithDraw` maps them to the three claim templates. */
const drawsCoveringEveryClaim = [0, 0.4, 0.7];

const loaded = await loadQuestions();
if (loaded.kind === 'failed') {
    throw new Error(JSON.stringify(loaded.failure));
}
const corpusFacts = salientTokens(
    loaded.questions.flatMap((question) => question.paragraphs.flatMap((paragraph) => paragraph.sentences)).join(' '),
);

describe('priorClaim', () => {
    test.each(drawsCoveringEveryClaim)(
        'the claim at draw %d asserts facts the committed corpus never mentions',
        (value) => {
            const claimFacts = salientTokens(priorClaim(subject, () => unitIntervalSchema.parse(value))).difference(
                salientTokens(subject),
            );
            expect(claimFacts.size).toBeGreaterThan(0);
            expect([...claimFacts.intersection(corpusFacts)]).toEqual([]);
        },
    );

    test('the draws reach three different claims', () => {
        const claims = drawsCoveringEveryClaim.map((value) =>
            priorClaim(subject, () => unitIntervalSchema.parse(value)),
        );
        expect(new Set(claims).size).toBe(drawsCoveringEveryClaim.length);
    });
});
