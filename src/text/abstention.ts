/**
 * How an answer can decline or admit a failure, as named, documented phrase patterns. Matching is
 * case-insensitive on text with curly apostrophes straightened. Each pattern names a whole phrase with a subject
 * (the speaker, or the material searched) or a fixed declining idiom, never a bare negation, so a confident answer
 * that merely contains "not" ("Paris is not in Germany [S1].") or reports someone else's inability ("Doctors could
 * not determine the cause until 1990 [S1].") matches nothing.
 */
export type AnswerPhrasePattern = {
    readonly name: string;
    /** Matched against the lower-cased answer, so write it in lower case. Flags such as `g` change nothing. */
    readonly pattern: RegExp;
};

/** Ways to say "I could not": modal, past tense, contracted, and "was unable to" / "wasn't able to" forms. */
const inability = [
    'could not',
    "couldn't",
    'cannot',
    'can not',
    "can't",
    'did not',
    "didn't",
    'failed to',
    '(?:am|was|were|is|are|have been|has been)\\s+(?:not\\s+|un)able to',
    "(?:wasn't|weren't|isn't|aren't|haven't been|hasn't been)\\s+able to",
    'not able to',
    'unable to',
].join('|');

/** Verbs of finding or answering; "could not find", "cannot answer", "unable to confirm", "could not search". */
const seekingVerb =
    'find|locate|determine|identify|retrieve|confirm|verify|answer|say|tell|provide|give|check|search|look up';

/** Adverbs a model puts between the inability and the verb: "cannot reliably answer". */
const hedge = '(?:\\s+(?:reliably|confidently|accurately|fully|definitively|currently|actually))?';

/** What an answer searched: the speaker refers to it as its source. */
const material =
    '(?:corpus|knowledge base|documents?|docs|passages?|context|sources?|search results?|results?|records?|' +
    'files?|database|articles?|texts?|excerpts?|snippets?|retrieved (?:documents|passages|content))';

/** Kinds of material an answer can lack. */
const information = '(?:information|info|details|data|knowledge|context|record|records|facts|evidence)';

/** A sentence that opens with the inability, or the speaker as its subject, with an optional softener. */
const fromStartOrFirstPerson =
    "(?:^|[.!?:;]\\s*|\\b(?:i|we)(?:'m|'re|'ve)?\\s+)(?:(?:unfortunately|sadly|still|really|just|simply)\\s+)?";

/** Ends a non-English word: `\b` only knows ASCII letters, so it fails after "é". Needs the `u` flag. */
const wordEnd = '(?![\\p{L}\\p{N}])';

/** The answer declines to answer from the available material, in English or in German, French or Spanish. */
export const abstentionPatterns: readonly AnswerPhrasePattern[] = [
    {
        name: 'speaker could not find or answer',
        pattern: new RegExp(`${fromStartOrFirstPerson}(?:${inability})${hedge}\\s+(?:${seekingVerb})\\b`),
    },
    {
        name: 'speaker has no information',
        pattern: new RegExp(
            `\\b(?:i|we)\\s+(?:do not|don't|did not|didn't|does not|doesn't)\\s+have\\s+(?:any\\s+|enough\\s+|sufficient\\s+|the\\s+|specific\\s+|relevant\\s+)*${information}\\b|\\b(?:i|we)\\s+(?:have|had)\\s+no\\s+(?:relevant\\s+)?${information}\\b`,
        ),
    },
    {
        name: 'no relevant material',
        pattern:
            /\bno\s+(?:relevant\s+|useful\s+|matching\s+|specific\s+)?(?:information|passages?|documents?|results?|sources?|matches|mention)\b/,
    },
    {
        name: 'search found nothing',
        pattern: new RegExp(
            `\\bnothing\\s+(?:relevant|useful|related|came up|was found)\\b|\\b(?:search(?:es)?|query|queries|lookup|retrieval|i|we|it|${material})\\s+(?:returned|found|yielded|turned up|produced|gave|came back with)\\s+(?:nothing|no\\s+(?:results?|rows?|matches|hits|passages?|documents?))\\b`,
        ),
    },
    {
        name: 'material does not say',
        pattern: new RegExp(
            `\\b${material}\\s+(?:does not|doesn't|do not|don't|did not|didn't)\\s+(?:seem to\\s+|appear to\\s+)?(?:contain|mention|say|include|provide|state|cover|address|specify|discuss|answer)\\b`,
        ),
    },
    {
        name: 'not in the material',
        pattern: new RegExp(
            `\\bnot\\s+(?:mentioned|found|covered|available|included|present|stated|specified|addressed|discussed)\\s+(?:in|within|among|by)\\s+(?:the\\s+|any\\s+(?:of\\s+the\\s+)?)?(?:provided\\s+|retrieved\\s+|available\\s+|given\\s+)?${material}`,
        ),
    },
    { name: 'speaker does not know', pattern: /\b(?:i|we)\s+(?:do not|don't)\s+know\b/ },
    {
        name: 'not enough information',
        pattern: /\b(?:not enough|insufficient|too little)\s+(?:information|context|evidence|data|details)\b/,
    },
    {
        name: 'German: no information, could not find',
        pattern: new RegExp(
            `\\bkeine\\s+(?:informationen|angaben|ergebnisse|treffer|hinweise)${wordEnd}|\\b(?:ich|wir)\\s+(?:konnte|konnten|kann|können)\\b[^.]{0,60}\\bnicht\\s+(?:finden|beantworten|sagen)${wordEnd}|\\bweiß\\s+(?:ich\\s+)?nicht${wordEnd}`,
            'u',
        ),
    },
    {
        name: 'French: no information, could not find',
        pattern: new RegExp(
            `\\baucune\\s+(?:information|donnée|mention|source|réponse|résultat)|\\bn'ai\\s+pas\\s+(?:pu\\s+)?trouv|\\bje ne sais pas${wordEnd}|\\bje ne peux pas\\s+(?:répondre|trouver|confirmer)`,
            'u',
        ),
    },
    {
        name: 'Spanish: no information, could not find',
        pattern: new RegExp(
            `\\bno\\s+(?:encontré|pude encontrar|hay información|tengo información|sé|puedo responder)${wordEnd}|\\bninguna información${wordEnd}`,
            'u',
        ),
    },
];

/** The answer admits that a tool or lookup failed. */
export const failureAcknowledgementPatterns: readonly AnswerPhrasePattern[] = [
    {
        name: 'tool failed',
        pattern:
            /\b(?:search(?:es)?|tools?|lookups?|requests?|service|backend|query|queries|retrieval|api)\b[^.]{0,40}?\b(?:failed|errored|returned an?\s+(?:\w+\s+)?error|timed out|is down|was down|went down|unavailable|unreachable|not responding)\b/,
    },
    { name: 'error occurred', pattern: /\ban?\s+(?:\w+\s+)?error\s+(?:occurred|was returned|happened|came back)\b/ },
    {
        name: 'speaker hit an error',
        pattern:
            /\b(?:i|we)\s+(?:got|received|encountered|hit|ran into|run into|keep getting)\s+an?\s+(?:\w+\s+)?error\b/,
    },
    {
        name: 'unable to reach',
        pattern: new RegExp(
            `(?:${fromStartOrFirstPerson}|\\b(?:tool|search|lookup|request|service|api|query)\\s+)(?:${inability})\\s+(?:access|reach|search|complete|connect to|query|run|use)\\b`,
        ),
    },
];

const normalized = (text: string): string => text.replaceAll('’', "'").toLowerCase();

const matchesAny = (text: string, patterns: readonly AnswerPhrasePattern[]): boolean => {
    const subject = normalized(text);
    // `search` ignores `lastIndex`, so a caller's global pattern cannot make matching stateful.
    return patterns.some(({ pattern }) => subject.search(pattern) >= 0);
};

/** True when the answer declines to answer. Pass `extraPatterns` for an application's own abstention wording. */
export const isAbstention = (text: string, extraPatterns: readonly AnswerPhrasePattern[] = []): boolean =>
    matchesAny(text, [...abstentionPatterns, ...extraPatterns]);

/** True when the answer abstains or admits that a tool or lookup failed. */
export const acknowledgesFailure = (text: string, extraPatterns: readonly AnswerPhrasePattern[] = []): boolean =>
    matchesAny(text, [...abstentionPatterns, ...failureAcknowledgementPatterns, ...extraPatterns]);
