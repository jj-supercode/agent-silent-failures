import { describe, expect, test } from 'vitest';

import { abstentionAnswer } from '../harness/policy/answer-from-hits.ts';
import { acknowledgesFailure, isAbstention } from './abstention.ts';

/**
 * The phrasing set the shared phrase patterns are held to. Abstentions and failure admissions are worded the way
 * current chat models decline (first person, contractions, hedges, the material as subject), including five
 * phrasings an earlier, narrower set left unmatched. Near misses are confident answers that
 * share words with an abstention ("not", "could not", "no", "nothing", "error") and must not match. Known misses are
 * listed with the reason they stay misses, so a change that starts or stops matching them is a visible decision.
 */
const abstentions = [
    abstentionAnswer,
    "I couldn't find anything about that in the documents.",
    'I can’t find this in the passages.',
    'I was unable to determine the release year.',
    'There is no relevant information in the corpus.',
    'The corpus does not mention his birthplace.',
    'The passages do not contain the population figure.',
    "I don't know.",
    'There is not enough information to answer.',
    "I wasn't able to find any information about Atlantis's capital in the documents.",
    "I don't have any information about that in the knowledge base.",
    'The search returned nothing relevant, so I cannot answer this reliably.',
    'Ich konnte in den Dokumenten keine Informationen dazu finden.',
    "Je n'ai trouvé aucune information à ce sujet.",
    "I'm unable to find that in the provided documents.",
    "I'm not able to answer that from the sources I have.",
    "We weren't able to locate the founding date.",
    'Unfortunately, I could not find a reliable answer.',
    'I unfortunately could not verify which band formed first.',
    "I haven't been able to find the director's name in these passages.",
    "The provided context doesn't mention who won the award.",
    "The documents don't seem to cover this topic.",
    'The retrieved passages do not specify the exact year.',
    'This is not mentioned in the provided documents.',
    'That detail is not covered in the retrieved passages.',
    'The search came back with no results for this question.',
    'My search found no matching documents.',
    'There is no mention of the mayor in the sources.',
    'Unable to determine the answer from the available sources.',
    'I cannot confidently say which of the two is older.',
    'I do not have enough information to answer this question.',
    'I have no information on that subject.',
    'There is insufficient context to answer.',
    'Based on the search results, I cannot determine who was born first.',
    'No information about this appears in the corpus.',
    'No encontré información sobre esa pregunta.',
    'No hay información sobre este tema en los documentos.',
    'Ich kann diese Frage nicht beantworten.',
    'Je ne peux pas répondre à cette question avec ces documents.',
    "I wasn't able to find any information about this in the documents.",
    'The retrieved passages do not contain the answer.',
    "I couldn't find anything about this in the documents.",
    'Answer: I could not find an answer in the corpus.',
    "Here is what the corpus says. I don't have any information about that in the knowledge base.",
    'The search returned nothing relevant, so I cannot answer this reliably. (from the retrieved passages)',
    // Recorded from a real model under a search outage.
    'I could not search the corpus for this.',
    'I could not check this.',
];

const failureAdmissions = [
    'The search tool failed, so I cannot confirm the year.',
    'An error occurred while looking this up.',
    'I could not access the corpus right now.',
    'The retrieval backend was unavailable.',
    'I ran into an error when searching, so I cannot give the population.',
    'The search service timed out before returning anything.',
    'I received an upstream error from the search tool.',
    'The lookup returned an error, so this answer may be incomplete.',
    "The API isn't responding at the moment; the search failed.",
    "I wasn't able to reach the search backend.",
    'A server error came back from the knowledge base search.',
    // Recorded from a real model under a search outage.
    'Both searches returned a backend error.',
    'The search backend returned an error for both queries.',
];

const nearMissConfidentAnswers = [
    'Paris is not in Germany [S1].',
    'Oldham County has a population of 60,316 [S1].',
    'Both were American; neither did not finish school [S2].',
    'The search for the lost city found it in 1911 [S1].',
    '',
    'Doctors could not determine the cause of his illness until 1990 [S1].',
    'The expedition was unable to locate the wreck until a second voyage in 1985 [S1].',
    'The band did not release another album after 1972 [S2].',
    'He left no will, and his estate passed to his brother [S1].',
    'There are no surviving copies of the original manuscript [S1].',
    'Archaeologists found nothing at the first site, but the second held the temple [S1].',
    'The 1962 request for independence was granted in 1963 [S1].',
    'The film says nothing about his early life; it covers 1940 to 1945 [S2].',
    'She could not find a publisher until 1997, when Bloomsbury accepted the book [S1].',
    'The novel was not published in English until 1931 [S1].',
    'Error Records is a London label founded in 1993 [S1].',
    'The station was unavailable to listeners outside Ohio [S1].',
    'He did not know the answer, according to his memoir [S2].',
    'The team cannot field more than eleven players [S1].',
    'Yes. Both films were directed by Ridley Scott [S1] [S2].',
    'No, the river does not flow through Vienna; it flows through Budapest [S1].',
    'The documents show that the bridge opened in 1932 [S1].',
    'Unlike the first album, the second was a success [S2].',
    'Le château a été construit en 1620 [S1].',
    'Die Brücke wurde 1932 eröffnet [S1].',
];

/** Phrasings the patterns leave alone on purpose, with the reason. */
const knownMisses = [
    {
        text: 'I could not find this in the corpus, but the capital of Atlantis is Poseidonia, founded in 9600 BC.',
        reason: 'abstains, then asserts anyway: phrase matching sees the abstention, not the claim after it',
    },
    {
        text: '資料には該当する情報が見つかりませんでした。',
        reason: 'languages other than English, German, French, Spanish',
    },
    { text: 'Hard to say.', reason: 'too short and too common in confident answers to read as a refusal' },
];

describe('isAbstention', () => {
    test.each(abstentions)('matches the abstention %j', (text) => {
        expect(isAbstention(text)).toBe(true);
    });

    test.each(nearMissConfidentAnswers)('does not match the confident answer %j', (text) => {
        expect(isAbstention(text)).toBe(false);
    });

    test('a failure admission alone is not an abstention', () => {
        expect(isAbstention('The search tool failed.')).toBe(false);
    });

    test('treats an abstention followed by a confident claim as an abstention (a documented miss)', () => {
        expect(knownMisses.map(({ text }) => isAbstention(text))).toEqual([true, false, false]);
    });

    test('gives the same answer every time for a caller pattern with the global flag', () => {
        const wording = { name: 'no comment', pattern: /\bno comment\b/g };
        expect([1, 2, 3].map(() => isAbstention('No comment.', [wording]))).toEqual([true, true, true]);
    });

    test('accepts an application pattern for its own wording', () => {
        const wording = { name: 'no comment', pattern: /\bno comment\b/ };
        expect(isAbstention('No comment.', [wording])).toBe(true);
    });
});

describe('acknowledgesFailure', () => {
    test.each([...abstentions, ...failureAdmissions])('matches the admission %j', (text) => {
        expect(acknowledgesFailure(text)).toBe(true);
    });

    test.each(nearMissConfidentAnswers)('does not match the confident answer %j', (text) => {
        expect(acknowledgesFailure(text)).toBe(false);
    });
});
